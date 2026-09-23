# alphai-sdk

A typed, ergonomic TypeScript client for the [AlphAI](https://alphai.io) REST API —
relevance-scored, ticker-linked financial news plus SEC Form 4 insider data, built
for AI agents and trading bots.

- **Fully typed** — hand-written types for every endpoint, money kept as precise
  decimal strings, timestamps as ISO 8601 strings.
- **Runs everywhere** — Node ≥18, browsers, edge runtimes, Deno, and Bun. Uses the
  native `fetch`; **zero runtime dependencies**.
- **Ergonomic** — resource namespaces (`client.news.*`, `client.symbols.*`), async
  iterators for pagination, automatic retries with backoff, typed errors, and
  rate-limit inspection.
- **Dual module** — ships ESM + CJS with `.d.ts`.

> Covers news search, feeds, symbols, Brief and Radar. Calendar, macro and insider-trades are a plain `fetch` away. API-key management (create /
> revoke) happens on the website at `/account/api-keys` — this SDK only *consumes* a key.

## Install

```bash
npm install alphai-sdk
```

Requires Node ≥18 (for global `fetch`), or any browser / edge / Deno / Bun runtime
that provides `fetch`.

## Authentication

Get an API key from [alphai.io/account/api-keys](https://alphai.io/account/api-keys).
Pass it explicitly, or set the `ALPHAI_API_KEY` environment variable and let the
client pick it up.

```ts
import { AlphaAI } from "alphai-sdk";

// Explicit:
const client = new AlphaAI({ apiKey: "ak_live_…" });

// Or from process.env.ALPHAI_API_KEY:
const client = new AlphaAI();
```

If no key is found, the constructor throws `MissingAPIKeyError`.

## Quickstart

```ts
import { AlphaAI } from "alphai-sdk";

const client = new AlphaAI();

const page = await client.news.list({ symbol: "NVDA", minRelevance: 7 });
for (const article of page.results) {
  console.log(`[${article.enrichment.relevance_score}] ${article.original.title}`);
}
```

## Usage

### News

```ts
// One page of the main feed (newest first). Filter by ticker, category, relevance.
const page = await client.news.list({
  symbol: "NVDA",
  category: ["earnings", "insider"], // single value, array, or CSV string
  excludeCategories: ["crypto"],
  minRelevance: 7,                   // 1–10
  collapseStories: true,             // collapse reprints into one story
  pageSize: 20,                      // 10 default; 1-20 any key, 21-50 needs Pro
  cursor,                            // opaque cursor from a previous page
});
console.log(page.results, page.next_cursor);

// Auto-pagination — follows next_cursor until the feed ends.
for await (const article of client.news.iterate({ symbol: "NVDA", maxItems: 100 })) {
  // …
}

// A publication window: inclusive bounds on time_published, same names as the
// MCP tools. A bare "YYYY-MM-DD" string means the WHOLE day (the server reads
// a bare toDate as that day's end, so equal bounds return the day); a Date is
// an exact instant. Works on news.list/iterate and news.insider/iterateInsider
// in the default published mode only (a window with sort: "ingested" is a 400),
// and respects the key's archive depth (past the horizon is a 403).
const july = await client.news.list({
  symbol: "NVDA",
  fromDate: "2026-07-01",
  toDate: "2026-07-31",
});

// Trending: up to 10 ranked stories from the last 48h (not paginated).
const trending = await client.news.trending();

// Insider feed (SEC Form 4 filings).
const insider = await client.news.insider({ symbol: "NVDA" });
for await (const article of client.news.iterateInsider({ symbol: "NVDA" })) {
  // …
}

// A single article by its 16-char hex uid, and related articles (≤6).
const article = await client.news.get("a1b2c3d4e5f60718");
const related = await client.news.related("a1b2c3d4e5f60718");
```

### Symbols

```ts
// All active tickers, alphabetical (~10k). Page with limit/offset.
const symbols = await client.symbols.list({ limit: 500, offset: 0 });
const hits = await client.symbols.list({ search: "bitcoin" }); // name / brand / prefix lookup → BTC-USD

// Symbol detail (throws NotFoundError for an unknown ticker).
const aapl = await client.symbols.get("AAPL");

// Crypto + foreign listings are supported too. Each Symbol carries multi-market
// metadata: asset_type ("Stock" | "ETF" | "Crypto"), country, currency, and
// supports_insider (US SEC names only). Crypto is "<SYM>-USD"; foreign uses the
// Yahoo suffix (e.g. "VOD.L").
const btc = await client.symbols.get("BTC-USD");
console.log(btc.asset_type, btc.currency, btc.supports_insider); // "Crypto" "USD" false

// 7-day AI sentiment rollup (excludes Form 4).
const sentiment = await client.symbols.sentimentSummary("AAPL");

// 30-day Form 4 rollup. Money fields are decimal STRINGS.
const insider = await client.symbols.insiderSummary("AAPL");
console.log(insider.buy_value_usd); // e.g. "1284500.00" — a string, not a number

// Earnings reads: AlphAI's structured, filing-verified analysis per quarter.
const earnings = await client.symbols.earnings("AAPL");
console.log(earnings.next_report_date); // "2026-10-29" or null (never an estimate)
for (const read of earnings.reports) {
  // read.source_type: "sec_form8k" (US 8-K item 2.02) | "sec_form6k" (FPI 6-K)
  const a = read.analysis; // may be null; key_metrics may be empty
  if (!a || a.key_metrics.length === 0) continue;
  console.log(read.fiscal_period, a.verdict, a.key_metrics[0].name, a.key_metrics[0].value);
}

// Each key_metrics row keeps `value` as printed and adds numeric / unit / scale
// ("$19,345" -> 19345, "USD", "millions" when the filing's table header says so);
// scale is null when the filing did not say. Don't assume millions.

// Latest-read pointer, for the article link. `null` when no read exists yet (HTTP 204).
const latest = await client.symbols.earningsLatest("AAPL");
if (latest) {
  const article = await client.news.get(latest.uid);
}
```

> **Type-name note:** the symbol model is exported as `Symbol`, which shadows the
> JavaScript global. Alias it on import if needed:
> `import type { Symbol as AlphaSymbol } from "alphai-sdk";`

### Money & timestamps

Monetary fields (`buy_value_usd`, `sell_value_usd`, `net_value`) are **decimal
strings** and are never coerced to `number` — JavaScript floats lose precision on
large dollar amounts. If you need arithmetic, feed them to a big-decimal library.
Timestamps are ISO 8601 **strings** (no automatic `Date` conversion).

## Pagination

`iterate()` and `iterateInsider()` return an `AsyncGenerator` that follows
`next_cursor` for you. Bound the work with `maxItems` and/or `maxPages`:

```ts
for await (const article of client.news.iterate({ symbol: "AAPL", maxItems: 50 })) {
  // stops after 50 articles (or when the feed ends)
}
```

Cursors are opaque — never build or parse them; pass `page.next_cursor` straight back
in as `cursor` to fetch the next page manually.

### Polling for what is new (`sort: "ingested"`)

Articles reach the feed after their publish time, so a poller that tracks
`time_published` silently skips late arrivals. `sort: "ingested"` orders the feed
by arrival instead, and its cursor is a polling position rather than an
end-of-feed marker:

```ts
let cursor = await loadCursor(); // undefined on the first run

const page = await client.news.list({
  sort: "ingested",
  cursor,
  symbol: "NVDA",
  pageSize: 20,
  minRelevance: 7,
});
for (const article of page.results) {
  handle(article); // article.original.created_at = when we received it
}
await saveCursor(page.next_cursor); // always set; empty results = caught up

// Branch on the results, never on the cursor: in this mode `next_cursor` is a
// polling position and is never null, so it says nothing about being done.
if (page.results.length === 0) await sleepUntilNextPoll();
```

Send the same `sort` on every call of a run. Each mode mints its own cursor
family, so replaying an ingested cursor into the default mode is a `400`, not a
silent restart. `iterate({ sort: "ingested" })` threads it for you and stops on
the first empty page.

**Keep up with the feed.** One call returns one page, so a poller that drains
slower than the feed publishes drifts backwards and its articles start reading
as hours old — the data is current, the position is not. Raise `pageSize` and
narrow the stream (`minRelevance`, `symbol`, `category`) until a single poll
covers a single interval, and remember that the per-day call cap bounds how much
of the feed a plan can drain at all.

On Free and Basic the archive horizon applies to where a poll *resumes*, so a
cursor left unused for longer than your window comes back `403`
(`extra.reason === "archive_horizon"`). Poll on your plan's cadence and you will
not see it; Pro has no window.

## Multi-ticker Brief and Radar

```ts
import { AlphaAI, ConflictError } from "alphai-sdk";

const client = new AlphaAI(); // reads ALPHAI_API_KEY
const brief = await client.news.brief({
  tickers: ["NVDA", "AMD", "BTC-USD"], hours: 24, limit: 10,
});
for (const event of [...brief.events, ...brief.filings]) {
  console.log(event.matched_tickers, event.title);
}
console.log(brief.upcoming_earnings, brief.unknown_tickers);
console.log("More coverage:", brief.events_truncated, brief.filings_truncated);

const page = await client.radar.snapshot({ window: "24h", market: "us_equity", limit: 10 });
console.log(page.snapshot_id, page.as_of, page.access, page.freshness);
for (const reading of page.results) {
  console.log(reading.ticker, reading.news_z, reading.sent.value);
}

// This reads the key owner's existing saved symbols.
const saved = await client.radar.snapshot({ scope: "watchlist" });
console.log(saved.watchlist_coverage);

try {
  for await (const reading of client.radar.iterate({ window: "4h", maxItems: 100 })) {
    console.log(reading.ticker, reading.stories);
  }
} catch (error) {
  if (!(error instanceof ConflictError)) throw error;
  console.log("Snapshot expired or context changed. Start a new scan without a cursor.");
}
```

**Brief** takes 1–100 explicit tickers on every tier; it does not read the saved
account watchlist. `hours` is a publication window (1–168, default 24); `limit`
caps each news/filings section separately (1–20, default 20). Check both
truncation flags and `unknown_tickers`. Confirmed earnings dates remain ISO date
strings; missing dates are not estimated. This ranked snapshot has no cursor.
For complete incremental ingestion, use `news.list({ sort: "ingested" })` with a
persisted cursor, not repeated Brief calls.

**Radar** accepts `window` (`4h` / `24h`), `scope`, `market`, exact `ticker` or
`tickers`, `search`, `sort`, `order`, `sentiment`, `minZ`, `limit`, `offset` and
`cursor`. Request options use camelCase; response fields remain snake_case.
`limit` is a page size (1–100, default 50), not a tier ticker cap. Ticker filters
match exactly, with no alias expansion. Empty ticker arrays are rejected.

The server delays the whole snapshot by 60 minutes on Free, 15 on Basic, and no
added delay on Pro. Processing adds latency; inspect `as_of` and `freshness`.
Nullable scores stay `null`. Radar describes news activity, not confirmed trading
signals or point-in-time backtests. An empty saved watchlist returns no readings.

For manual pagination, send `next_cursor` as `cursor` with unchanged filters and
page size. Cursors pin snapshots retained for three hours. `ConflictError` (409)
means start a new scan without a cursor; iteration never restarts silently or
mixes snapshots. Unavailable snapshots raise `ServerError` (503) after bounded
retries. Both methods and the iterator accept an `AbortSignal` as `signal`.

Runnable examples: [watchlist brief](examples/watchlist-brief.ts) and
[Radar](examples/radar.ts).

## Errors

Every non-2xx response is mapped to a typed error. All extend `AlphaAIError`.

| Class | When | Notable fields |
|---|---|---|
| `BadRequestError` | 400 | `.fields` (per-field validation messages), `.allowedParams` (the endpoint's real parameter names when you sent an unknown one) |
| `AuthenticationError` | 401 | — |
| `PermissionDeniedError` | 403 | — |
| `NotFoundError` | 404 | — |
| `RateLimitError` | 429 | `.retryAfter`, `.limit`, `.remaining`, `.reset` |
| `ServerError` | ≥500 | — |
| `AlphaAIAPIError` | other non-2xx | `.status`, `.body`, `.extra` (base for the above) |
| `AlphaAIConnectionError` | network / timeout / abort | `.cause` |
| `MissingAPIKeyError` | no key resolved | — |

```ts
import { AlphaAI, RateLimitError, NotFoundError } from "alphai-sdk";

try {
  await client.symbols.get("NOPE");
} catch (err) {
  if (err instanceof RateLimitError) {
    console.log(`Slow down — retry after ${err.retryAfter}s`);
  } else if (err instanceof NotFoundError) {
    console.log("No such ticker");
  } else {
    throw err;
  }
}
```

The error parser reads `message` first, then falls back to `detail`, then the raw
body — so both the app-layer (`{ message, extra }`) and host-gate
(`{ detail }`) envelopes are handled.

## Retries

Idempotent GETs are retried automatically on **429**, **5xx**, and network errors —
`maxRetries` times (default **2**) with exponential backoff and full jitter,
honoring the `Retry-After` header on 429s. Each request has a timeout (default
**30s**) enforced with `AbortController`.

```ts
const client = new AlphaAI({
  maxRetries: 3,
  backoffFactor: 0.5, // seconds; base for exponential backoff
  timeout: 15_000,    // ms
});
```

Pass `maxRetries: 0` to disable retries.

## Rate limits

Limits are per account and two-layer — a per-minute burst plus a per-day volume
cap: **Free 20/min · 100/day / Basic 60/min · 10,000/day / Pro 150/min ·
100,000/day**. News-archive depth is tiered too (Free 30 days / Basic 90 / Pro
180; deeper pagination — or a `fromDate` past the horizon — returns `403`). Every keyed response carries `X-RateLimit-Limit`,
`X-RateLimit-Remaining`, and `X-RateLimit-Reset` (epoch seconds). The SDK captures
them after each call:

```ts
await client.news.list({ symbol: "NVDA" });
console.log(client.lastRateLimit); // { limit: 10000, remaining: 9998, reset: 1700000000 }
```

Cache-served responses may omit the headers; in that case `lastRateLimit` keeps its
previous value.

## Configuration

```ts
new AlphaAI({
  apiKey,                                  // else process.env.ALPHAI_API_KEY
  baseURL: "https://api.alphai.io",        // default
  timeout: 30_000,                         // ms
  maxRetries: 2,
  backoffFactor: 0.5,                      // seconds
  fetch: customFetch,                      // inject a fetch (tests, proxies, edge)
  userAgent: "alphai-sdk-js/0.1.0",        // default
});
```

## Runtime support

Works anywhere a Web-standard `fetch` is available: Node ≥18, modern browsers, Cloudflare
Workers / Vercel Edge, Deno, and Bun. For older or custom runtimes, inject a `fetch`
implementation via the `fetch` option.

In the browser, the `User-Agent` header is a forbidden header name and is dropped by
the runtime — that's expected and harmless.

## Search by name or phrase

```ts
const toDate = new Date();
const fromDate = new Date(toDate.getTime() - 29 * 24 * 60 * 60 * 1000);
const options = { query: "Jane Street", fromDate, toDate, pageSize: 20 };
const page = await client.news.search(options);
console.log(page.query.mode, page.query.note, page.matched);
for (const article of page.results) {
  console.log(article.original.title, article.enrichment.tickers, article.search_match?.context);
}
if (page.next_cursor) {
  const nextPage = await client.news.search({ ...options, cursor: page.next_cursor });
  console.log(nextPage.results);
}
```

`news.search()` returns a typed `NewsSearchPage` with `query` interpretation and
per-article `search_match` details. Quoted phrases such as `query: '"going concern"'`,
`-word` exclusions and `OR` pass through unchanged. Add `symbol`, `category`,
`sourceType`, `item`, `minRelevance` or `collapseStories` to narrow results.
`item: "5.02"` limits search to 8-Ks carrying that item. Date bounds accept ISO
strings or `Date`, with the same semantics as the feed. `signal` supports cancellation.

Inspect `query.mode` and `query.note`: `broadened` may match only some words;
`no_match` and `no_terms` are empty answers within the searched coverage, not
proof an event did not happen. `matched` counts visible candidates among the best
200, not a global total; `count` is the current page size. Context can be null for
matches in titles/entity names; scores compare only within a response. Continue
with `next_cursor` and the same query, filters and window. Invalid cursors raise
`BadRequestError`; downtime raises `ServerError` after the configured retries,
never a successful empty page.

Runnable example: [news search](examples/news-search.ts). Try the same queries
in [AlphAI Search](https://alphai.io/search).

## Examples

Runnable scripts live in [`examples/`](./examples):

- `quickstart.ts` — fetch a news page for a ticker
- `paginate.ts` — async-iterate the feed with a cap
- `ticker-dashboard.ts` — compose detail + sentiment + insider + news in parallel

```bash
ALPHAI_API_KEY=ak_live_… npx tsx examples/quickstart.ts
```

A standalone, fuller set of runnable scripts lives in its own repo:
[**alphai-sdk-ts-examples**](https://github.com/makeev/alphai-sdk-ts-examples).

A worked recipe on the Free tier, with every response of the run logged:
[**alphai-earnings-week**](https://github.com/makeev/alphai-earnings-week) builds one
markdown card per week for a watchlist (confirmed report dates, the latest
filing-verified read per name, the macro calendar) in 26 requests. It is written in
Python; the same calls map onto `symbols.earnings()` here. The write-up walks through the
run: [Earnings week from the filings, not the headlines](https://dev.to/makeev/earnings-week-from-the-filings-not-the-headlines-one-script-on-a-free-api-key-l5d).

## License

[MIT](./LICENSE)
