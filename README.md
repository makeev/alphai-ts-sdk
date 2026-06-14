# alphai-sdk

A typed, ergonomic TypeScript client for the [AlphaAI](https://alphai.io) REST API —
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

> Wraps the 9 documented public REST endpoints 1:1. API-key management (create /
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
  cursor,                            // opaque cursor from a previous page
});
console.log(page.results, page.next_cursor);

// Auto-pagination — follows next_cursor until the feed ends.
for await (const article of client.news.iterate({ symbol: "NVDA", maxItems: 100 })) {
  // …
}

// Trending: up to 10 ranked stories from the last 48h (not paginated).
const trending = await client.news.trending();

// Insider feed (SEC Form 4 + institutional stakes).
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

// Symbol detail (throws NotFoundError for an unknown ticker).
const aapl = await client.symbols.get("AAPL");

// 7-day AI sentiment rollup (excludes Form 4).
const sentiment = await client.symbols.sentimentSummary("AAPL");

// 30-day Form 4 rollup. Money fields are decimal STRINGS.
const insider = await client.symbols.insiderSummary("AAPL");
console.log(insider.buy_value_usd); // e.g. "1284500.00" — a string, not a number
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

## Errors

Every non-2xx response is mapped to a typed error. All extend `AlphaAIError`.

| Class | When | Notable fields |
|---|---|---|
| `BadRequestError` | 400 | `.fields` (per-field validation messages) |
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

Limits are per account, hourly, sliding window: **Free 100 / Basic 1000 / Pro 10000**
requests per hour. Every keyed response carries `X-RateLimit-Limit`,
`X-RateLimit-Remaining`, and `X-RateLimit-Reset` (epoch seconds). The SDK captures
them after each call:

```ts
await client.news.list({ symbol: "NVDA" });
console.log(client.lastRateLimit); // { limit: 1000, remaining: 998, reset: 1700000000 }
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

## License

[MIT](./LICENSE)
