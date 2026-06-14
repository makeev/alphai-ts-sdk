# Plan — `alphai-sdk` (TypeScript / npm): client for the AlphaAI REST API

> This document is **self-contained**. Everything needed to build the package —
> the full public API contract, the package design, and the publish plan — is
> embedded below. No external references required.

---

## Context

AlphaAI ships a paid, key-authenticated public REST API at **`api.alphai.io`**
(OpenAPI **1.5.0**) serving relevance-scored, ticker-linked financial news plus
SEC Form 4 insider data. The target audience is "financial news for AI agents
and trading bots" — much of which lives in the JS/TS ecosystem (Node services,
edge functions, browser dashboards, Deno/Bun bots).

Today TS consumers hand-roll `fetch` calls, re-implement cursor pagination,
mishandle the money-as-decimal-string fields, and get no types. A first-party,
fully-typed TypeScript SDK removes that friction and is a distribution lever
(`npm i alphai-sdk`, examples in the developer docs).

**Goal:** a typed, ergonomic, well-tested TypeScript client that wraps the 9
public REST endpoints 1:1, handles auth / pagination / retries / rate-limit
headers / the error envelope correctly, runs in Node + browser + edge + Deno +
Bun, and is publishable to npm.

### Recommended decisions (confirm before building)

- **Runtime transport:** native `fetch` (Node ≥18, browsers, edge, Deno, Bun) —
  **zero runtime dependencies**. The client accepts a custom `fetch` for tests
  and advanced use.
- **API style:** a single `AlphaAI` class with `client.news.*` / `client.symbols.*`
  resource namespaces; every method returns a `Promise`. Pagination via async
  iterators (`for await … of`).
- **Types:** ship hand-written TypeScript types + `.d.ts`. Response objects are
  returned **as-is from the wire (snake_case)** to match the API/JSON exactly;
  method *inputs* use idiomatic camelCase options mapped to query params. Runtime
  validation is intentionally light (defensive normalization only) — no heavy
  schema lib. (If strict runtime validation is later wanted, Zod is the drop-in.)
- **Money & timestamps:** monetary fields stay **`string`** (decimal strings —
  never coerce to `number`, JS floats lose precision). Timestamps stay ISO 8601
  **`string`** (no auto-`Date`).
- **Package name:** **`alphai-sdk`** on npm (verify availability; fallback
  `@alphai/sdk`). Module: **dual ESM + CJS** with types.
- **License:** **MIT**.
- **Node baseline:** Node ≥18 (global `fetch`/`AbortController`). TypeScript strict.

### Scope guardrails

- Wrap **only the 9 documented REST endpoints** (below). Do **not** invent
  endpoints that aren't there — in particular there is **no REST full-text `q`
  search**, no `actionable_now`, no `pair_analysis`. Convenience helpers may
  *compose* real endpoints (e.g. a ticker dashboard), but must not imply server
  features that don't exist.
- API-key **management** (create/revoke) is done on the website
  (`/account/api-keys`), not through this API — **out of scope**. The SDK only
  *consumes* a key.
- `raw_text` (full article body) is never returned by the API — the types must
  not include it.

---

## Part A — The public API contract (source of truth for the types)

Authoritative source: the OpenAPI 1.5.0 spec served at `GET /api/schema/`.
Reproduced here so the package can be built standalone.

### Hosts & auth
- Base URL (default): `https://api.alphai.io` — **key required** on every route
  except `/api/schema/`.
- Alt base URL: `https://alphai.io` — same routes also answer (behind edge
  anti-bot; no rate guarantees). Default the SDK to `api.alphai.io`.
- Auth header: `Authorization: Bearer ak_live_<random>` (key from
  `/account/api-keys` on the website).
- Rate limits (per account, hourly, sliding window): **Free 100 / Basic 1000 /
  Pro 10000** requests/hour.
- Every keyed response carries: `X-RateLimit-Limit`, `X-RateLimit-Remaining`,
  `X-RateLimit-Reset` (epoch seconds of the next bucket). On **429** also
  `Retry-After` (seconds). Cache-served responses may omit the trio.

### Error envelope (handle BOTH shapes)
- Most errors (400/401/403/404/429): `{ "message": string, "extra": object }`.
  For validation 400s, `extra = { "fields": { <field>: string[] } }`.
- A missing-key rejection from the host gate (before the app layer) can instead
  be `{ "detail": "API key required." }`.
- The parser should read `message` first, then fall back to `detail`, then the
  raw body. Never assume a single key.

### The 9 endpoints

| # | Method & path | Purpose | Key params | Returns |
|---|---|---|---|---|
| 1 | `GET /api/news/` | Main feed, newest first; default `relevance_score≥6` + ≥1 ticker | `cursor`, `symbol`, `category` (repeatable), `exclude_categories` (repeatable), `min_relevance` (1–10, default 6), `collapse=story` | `NewsPage` |
| 2 | `GET /api/news/trending/` | Last 48h, `score≥8`, ranked, reprints collapsed | — (fixed ≤10, no pagination) | `RichNewsArticle[]` |
| 3 | `GET /api/news/insider/` | `category=insider` feed (SEC Form 4 + institutional stakes) | `cursor`, `symbol` | `NewsPage` |
| 4 | `GET /api/news/{uid}/` | Single article (`uid` matches `^[a-f0-9]{16}$`) | — | `RichNewsArticle` |
| 5 | `GET /api/news/{uid}/related/` | ≤6 related articles | — | `{ results: RichNewsArticle[] }` |
| 6 | `GET /api/symbols/` | All active tickers, alphabetical (~10k) | `limit` (1–10000), `offset` (≥0) | `Symbol[]` (bare array) |
| 7 | `GET /api/symbols/{ticker}/` | Symbol detail (`ticker` matches `^[A-Z][A-Z0-9.\-]{0,9}$`) | — | `Symbol` |
| 8 | `GET /api/symbols/{ticker}/sentiment-summary/` | 7-day AI sentiment rollup (excludes Form 4) | — | `TickerSentimentSummary` |
| 9 | `GET /api/symbols/{ticker}/insider-summary/` | 30-day Form 4 rollup | — | `TickerInsiderSummary` |

**Param encoding notes**
- `category` / `exclude_categories`: accept a single value, an array, or a CSV
  string — serialize as **repeated** query params (`?category=a&category=b`),
  OR-matched server-side. Expose as `category?: NewsCategory | NewsCategory[]`.
- `collapse`: only `"story"` is valid (anything else → 400). Expose ergonomically
  as `collapseStories?: boolean` → sends `collapse=story` when true. When set,
  items get non-null `story_id`, `sources_count`, `sources`.
- Cursors are **opaque** — never build/parse; an invalid cursor → 400.
- Unknown but well-formed ticker → endpoints 8/9 return **zeros, not 404**;
  endpoint 7 returns **404**.

### Response shapes (→ TypeScript types)

Use string-union enums and keep wire field names (snake_case). Make most fields
optional and tolerate unknown values for forward-compatibility.

```ts
// --- enums (string unions) ---
type NewsCategory =
  | "earnings" | "mergers_acquisitions" | "regulation" | "macro_economy"
  | "sector_analysis" | "market_movers" | "technology" | "commodities"
  | "crypto" | "ipo" | "geopolitics" | "insider" | "corporate_actions" | "other";
type Sentiment = "positive" | "neutral" | "negative";
type Confidence = "high" | "medium" | "low";
type Actionability = "high" | "medium" | "low" | "negligible";

// Forward-compat: allow unknown future strings while keeping autocomplete.
// e.g. `category: NewsCategory | (string & {})`

interface Topic { topic: string; relevance: number; }

interface ImpactAnalysis {
  summary?: string;
  sentiment?: Sentiment | (string & {});
  price_impact_prediction?: string;
  confidence?: Confidence | (string & {});
  reasoning?: string;
}

interface TickerAnalysis {
  ticker: string;
  relevance_context?: string;
  impact_analysis?: ImpactAnalysis;
}

interface NewsTradingValue {
  actionability_score?: Actionability | (string & {});
  information_novelty?: number;          // 0–10 (0 = pre-existing field)
  timing_relevance?: string;
  market_sentiment_alignment?: string;
  estimated_read_time?: string;
}

interface IndirectMarketEffects {
  sector_implications?: string;
  regional_market_impact?: string;
  global_market_relevance?: string;
}

interface AlternativePerspectives {
  contrarian_view?: string;
  overlooked_factors?: string;
}

interface KeyEntity { name: string; type: string; description: string; }

interface AITradingInsights {
  ticker_analysis: TickerAnalysis[];
  news_trading_value?: NewsTradingValue;
  indirect_market_effects?: IndirectMarketEffects;
  alternative_perspectives?: AlternativePerspectives;
}

interface NewsContextEnhancement {
  background_context?: string;
  impact_analysis?: string;
  key_entities: KeyEntity[];
  market_relevance_summary?: string;
  estimated_read_time_minutes?: number;
}

interface OriginalArticle {           // the `original` block — no raw_text
  id?: number;
  uid: string;                        // 16-char hex
  title: string;
  url: string;
  time_published: string;             // ISO 8601
  authors: string[];
  summary: string;                    // AI summary, safe to redistribute
  banner_image?: string | null;
  source: string;
  source_domain: string;
  topics: Topic[];
  tickers_sentiment: Record<string, unknown>[];  // loosely typed on purpose
  created_at: string;
  updated_at: string;
}

interface EnrichedArticle {           // the `enrichment` block
  category: NewsCategory | (string & {});
  tickers: string[];                  // validated tickers (live column)
  relevance_score: number;            // 1–10
  ai_trading_insights?: AITradingInsights;
  news_context_enhancement?: NewsContextEnhancement;
}

interface RichNewsArticle {
  original: OriginalArticle;
  enrichment: EnrichedArticle;
  story_id?: string | null;           // collapse=story only
  sources_count?: number | null;      // collapse=story only
  sources?: string[] | null;          // collapse=story only, ≤10 domains
}

interface NewsPage {                  // endpoints 1 & 3
  results: RichNewsArticle[];
  next_cursor: string | null;         // null = end of feed
}

interface Symbol {                    // endpoints 6 & 7 (list omits desc/website)
  symbol: string;
  name: string;
  asset_type?: string;                // "Stock" | "ETF"
  exchange?: string;                  // NYSE/NASDAQ/AMEX/OTC/CBOE; "" if unknown
  sector?: string;
  industry?: string;
  description?: string;
  website?: string | null;
}

interface DailySentimentBucket {
  day: string;                        // YYYY-MM-DD
  bullish: number; neutral: number; bearish: number;
}

interface TickerSentimentSummary {    // endpoint 8
  ticker: string;
  days: number;                       // 7
  total: number;
  bullish: number; neutral: number; bearish: number;
  daily: DailySentimentBucket[];
}

interface TopInsider {
  name: string;
  title: string;                      // "" when director-only
  transaction_count: number;
  net_value: string | null;          // decimal STRING (buys − sells), USD
}

interface TickerInsiderSummary {      // endpoint 9
  ticker: string;
  days: number;                       // 30
  total_transactions: number;
  buy_count: number;
  sell_count: number;
  buy_value_usd: string | null;       // decimal STRING, USD
  sell_value_usd: string | null;      // decimal STRING, USD
  pct_10b5_1: number;                 // 0–100
  top_insiders: TopInsider[];
}
```

> **Money rule:** `buy_value_usd`, `sell_value_usd`, `net_value` are decimal
> strings — keep them as `string`. If callers want arithmetic, point them at a
> big-decimal lib; do not `Number()` them in the SDK.

> **Relevance score legend** (for docs): 1–2 none · 3–4 derivative · 5–6
> macro/sector or minor company news · 7–8 fresh catalyst · 9–10 primary,
> material, newly disclosed. Form 4 rows are scored from the transaction itself.

---

## Part B — SDK design

### Package layout (`src/`, dual ESM+CJS build)
```
alphai-ts-sdk/
├── package.json            # name, exports map, scripts, deps
├── tsconfig.json           # strict
├── tsup.config.ts          # bundle ESM + CJS + .d.ts
├── biome.json              # lint + format (or eslint+prettier)
├── vitest.config.ts
├── README.md  LICENSE  CHANGELOG.md  PLAN.md  .gitignore  .npmignore
├── .github/workflows/ci.yml  release.yml
├── src/
│   ├── index.ts            # public exports (AlphaAI, types, errors)
│   ├── client.ts           # AlphaAI class wiring resources + http
│   ├── config.ts           # resolveConfig (apiKey from opts or env), defaults
│   ├── http.ts             # fetch wrapper: headers, query build, retry, rate-limit, error mapping
│   ├── errors.ts           # error class hierarchy
│   ├── pagination.ts       # async-iterator paginator over NewsPage
│   ├── resources/
│   │   ├── news.ts         # NewsResource
│   │   └── symbols.ts      # SymbolsResource
│   └── models/
│       ├── types.ts        # the interfaces above
│       └── enums.ts        # the string-union types + a runtime list of categories
├── test/                   # vitest; deterministic via injected fetch
└── examples/               # quickstart.ts, paginate.ts, ticker-dashboard.ts
```

### Public surface
```ts
import { AlphaAI } from "alphai-sdk";

const client = new AlphaAI({ apiKey: "ak_live_…" }); // or env ALPHAI_API_KEY

// News
await client.news.list({ symbol: "NVDA", category: ["earnings", "insider"],
                         minRelevance: 7, collapseStories: true, cursor });   // -> NewsPage
for await (const a of client.news.iterate({ symbol: "NVDA", maxItems: 100 })) { … } // auto-cursor
await client.news.trending();                       // -> RichNewsArticle[]
await client.news.insider({ symbol: "NVDA", cursor }); // -> NewsPage
for await (const a of client.news.iterateInsider({ symbol })) { … }
await client.news.get(uid);                         // -> RichNewsArticle
await client.news.related(uid);                     // -> RichNewsArticle[]

// Symbols
await client.symbols.list({ limit, offset });       // -> Symbol[]
await client.symbols.get(ticker);                   // -> Symbol
await client.symbols.sentimentSummary(ticker);      // -> TickerSentimentSummary
await client.symbols.insiderSummary(ticker);        // -> TickerInsiderSummary

client.lastRateLimit;  // { limit, remaining, reset } | null — updated each call
```
- `iterate()` returns an `AsyncGenerator<RichNewsArticle>`, following
  `next_cursor` until null, honoring optional `maxItems` / `maxPages`.
- Input option keys are camelCase (`minRelevance`, `collapseStories`) and are
  mapped to the snake_case query params in `http.ts`.

### Errors (`errors.ts`)
```
AlphaAIError                         // base
├── AlphaAIConnectionError           // network/timeout/abort (wraps fetch errors)
├── AlphaAIAPIError                  // any non-2xx; { status, message, body, extra }
│   ├── BadRequestError      (400)   // .fields (validation)
│   ├── AuthenticationError  (401)
│   ├── PermissionDeniedError(403)
│   ├── NotFoundError        (404)
│   ├── RateLimitError       (429)   // .retryAfter, .limit, .remaining, .reset
│   └── ServerError          (>=500)
└── MissingAPIKeyError               // no apiKey and no ALPHAI_API_KEY
```
The error parser maps status → class and reads `message` then `detail`.

### Retry policy (`http.ts`)
All calls are idempotent GETs. Retry on **429** and **5xx** and network errors,
up to `maxRetries` (default 2), exponential backoff with full jitter, honoring
`Retry-After` on 429. Per-request timeout via `AbortController` (default 30s).

### Config (`config.ts`)
```ts
new AlphaAI({
  apiKey?,            // else process.env.ALPHAI_API_KEY (guard: process may be undefined in browser)
  baseURL = "https://api.alphai.io",
  timeout = 30_000,   // ms
  maxRetries = 2,
  backoffFactor = 0.5,
  fetch?,             // custom fetch (tests, proxies, edge runtimes)
  userAgent = `alphai-sdk-js/<version>`,
})
```
If `apiKey` is missing and no env var (or no `process`), throw
`MissingAPIKeyError` with a clear message pointing at `/account/api-keys`.

---

## Part C — Tooling, tests, packaging

- **Language/build:** TypeScript (strict), **tsup** → dual **ESM + CJS** + `.d.ts`.
  `package.json` `exports` map with `import`/`require`/`types` conditions;
  `"sideEffects": false`; `"type": "module"`. Node ≥18 engines field.
- **Runtime deps:** none (uses global `fetch`).
- **Dev deps:** `typescript`, `tsup`, `vitest`, `@biomejs/biome` (lint+format;
  or `eslint` + `@typescript-eslint` + `prettier`), `@types/node`.
- **Lint/format:** Biome `check` (or eslint+prettier). **Types:** `tsc --noEmit`.
- **Tests (vitest, offline, deterministic):** inject a fake `fetch` into the
  client (the cleanest mock surface — no network, no extra dep):
  - `news.test.ts` / `symbols.test.ts` — each endpoint parses a captured JSON
    body into the typed result; assert key fields incl. money kept as `string`.
  - `pagination.test.ts` — `iterate()` follows `next_cursor`, stops on null,
    `maxItems` / `maxPages` caps, cursor is forwarded on page 2.
  - `params.test.ts` — `category` single/array → repeated params;
    `collapseStories` → `collapse=story`; undefined dropped; `minRelevance`.
  - `errors.test.ts` — 401 `{detail}`, 401 `{message}`, 400 validation
    `{message, extra.fields}`, 404, 429 (asserts `retryAfter`/`limit`), 500,
    non-JSON body.
  - `retry.test.ts` — 429-then-200 retried (honors `Retry-After`), 500-then-200,
    exhausted → throws, network error retried then `AlphaAIConnectionError`,
    `maxRetries: 0` disables.
  - `config.test.ts` — apiKey from opts/env/missing; rate-limit capture.
  - Keep small JSON fixtures under `test/fixtures/`.
  - **Optional live integration** (`test/integration`, skipped unless
    `ALPHAI_API_KEY` set): hit live `api.alphai.io` for one news page + one
    symbol + one summary; a thin drift guard. CI runs it only when the secret
    exists.
- **CI** (`.github/workflows/ci.yml`): Node matrix (18/20/22) → biome check,
  `tsc --noEmit`, vitest, build. Verify ESM `import` and CJS `require` of the
  built `dist/`. Separate optional integration job.
- **Docs:** `README.md` (install, auth via env, quickstart, async iteration,
  error table, rate-limit inspection, tier limits); `examples/` runnable
  scripts; `CHANGELOG.md` (Keep a Changelog), starting at `0.1.0`.

---

## Part D — Release / publish

1. **Pre-publish:** confirm `alphai-sdk` is free on npm (`npm view alphai-sdk`);
   if taken, use `@alphai/sdk`. Ensure `dist/` ships and `files`/`.npmignore`
   exclude tests/sources as desired (ship `dist` + types).
2. **Build & inspect:** `npm run build` then `npm pack` — open the tarball, confirm
   it contains `dist/*.js`, `dist/*.cjs`, `dist/*.d.ts`, `README`, `LICENSE`.
3. **Local install smoke:** in a temp dir, `npm i ../alphai-ts-sdk/alphai-sdk-0.1.0.tgz`,
   then verify both `import { AlphaAI } from "alphai-sdk"` (ESM) and
   `require("alphai-sdk")` (CJS) resolve and are typed.
4. **Publish:** `npm publish --access public --provenance` (provenance via a
   GitHub Actions release workflow on a `v*` tag with `id-token: write`). Manual
   `npm publish` with an automation token is the fallback.
5. **After publish:** smoke `npm i alphai-sdk` in a clean project; add
   `npm i alphai-sdk` to the developer docs and a changelog note if it's
   consumer-actionable.

---

## Execution steps

1. **Scaffold:** create `package.json`, `tsconfig.json`, `tsup.config.ts`,
   `biome.json`, `vitest.config.ts`, `LICENSE` (MIT), `README` skeleton,
   `CHANGELOG`, `.gitignore`, `.npmignore`, empty `src/` tree; `git init`.
2. **Types + enums** (`src/models/`): the interfaces and string-union enums from
   Part A, with forward-compat `| (string & {})` on enum fields and money as
   `string`.
3. **Config + errors** (`config.ts`, `errors.ts`): defaults, apiKey resolution,
   the error class hierarchy.
4. **HTTP core** (`http.ts`): fetch wrapper — header/query build (camel→snake,
   repeated arrays, drop undefined), timeout via AbortController, retry/backoff
   honoring `Retry-After`, rate-limit header capture, status→error mapping.
5. **Client + resources** (`client.ts`, `resources/*`): `AlphaAI` class,
   `news` + `symbols` resources, `lastRateLimit`.
6. **Pagination** (`pagination.ts`): async-generator over `NewsPage` with
   `maxItems` / `maxPages`; wire `iterate()` / `iterateInsider()`.
7. **Tests + fixtures** (`test/`): the vitest suite in Part C via injected fetch;
   `tsc --noEmit`, biome, vitest all green.
8. **README + examples + CI**: finalize docs, runnable examples, GH Actions.
9. **Build & pack dry run**: `npm run build`, `npm pack`, temp-dir ESM+CJS install
   smoke. Stop before the real `npm publish` for an explicit go-ahead.

---

## Verification

- **Offline:** `biome check`, `tsc --noEmit`, `vitest run`, `npm run build` all
  succeed on Node 18/20/22 in CI.
- **Type DX:** `(await client.news.get(uid)).enrichment.relevance_score` is
  `number`; `(await client.symbols.insiderSummary(t)).buy_value_usd` is
  `string | null`.
- **Dual-module:** built package resolves under both `import` (ESM) and
  `require` (CJS) from a temp project, with working `.d.ts`.
- **Live end-to-end** (real key vs `api.alphai.io`):
  - `news.list({ symbol: "NVDA" })` returns a `NewsPage`; `next_cursor` fetches
    the next page; `iterate({ maxItems: 25 })` yields 25 articles.
  - `news.trending()` ≤10; `news.get(uid)` round-trips a uid from the feed;
    `news.related(uid)` ≤6.
  - `symbols.get("AAPL")`, `symbols.sentimentSummary("AAPL")`,
    `symbols.insiderSummary("AAPL")` parse; money fields are strings.
  - Bad key → `AuthenticationError`; over-quota → `RateLimitError` with
    `.retryAfter`; `client.lastRateLimit.remaining` decrements across calls.
- **Drift guard:** optional live integration test passes; unknown new fields do
  not break parsing (types are permissive).

---

## Open follow-ups (not blocking v1)
- A small CLI (`npx alphai news --symbol NVDA`).
- Optional Zod schemas for runtime validation, exported under a subpath.
- React hooks / TanStack Query helpers as a separate companion package.
