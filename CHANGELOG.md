# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.0] - 2026-08-15

### Added
- `fromDate` / `toDate` on `news.list`, `news.iterate`, `news.insider` and
  `news.iterateInsider` — the publication window the REST API gained today,
  same names as the MCP tools (sent as `from_date` / `to_date`). Bounds are
  inclusive. A bare `"YYYY-MM-DD"` string means the whole day (the server
  reads a bare `to_date` as that day's end, so equal bounds return the day);
  a `Date` is serialized with `toISOString()` as the exact instant. Exported
  `DateBound` type. The SDK passes through; the server enforces the rest
  (window past the plan's archive horizon = 403 on the first page, window
  with `sort: "ingested"` = 400).
- `symbols.earnings(ticker)` and `symbols.earningsLatest(ticker)`, mirroring
  `GET /api/symbols/{ticker}/earnings/` and `…/earnings/latest/`. Typed via
  `TickerEarningsHistory` (reads newest first, capped at 20, plus
  `next_report_date`), `EarningsRead`, `EarningsReport`, and
  `LatestEarningsPointer`; an empty `reports` array is a normal answer, not an
  error. `Symbol.next_report_date` — the company-confirmed next earnings date
  (`string | null` in the `YYYY-MM-DD` form, never an estimate; detail
  responses only).

## [0.4.2] - 2026-08-04

### Fixed
- `news.iterate({ sort: "ingested" })` and `news.iterateInsider(...)` could run
  without bound. The paginator stopped when `next_cursor` repeated, on the
  assumption that a caught-up delta poll returns the same cursor it was given.
  It does not: a caught-up poll parks the position at the **global** feed head,
  which advances whenever any row is ingested — not just one matching the
  caller's filter. A filtered drain (`symbol: "RARE"`) therefore kept fetching
  empty pages for as long as rows kept landing, burning rate-limit budget. Both
  now stop on the first empty page, which is the mode's real "caught up"
  signal. Published mode is unchanged: an empty page there can still have more
  behind it, so stopping on it would truncate the feed.

### Added
- `sort` on `news.insider()` / `news.iterateInsider()`. The insider feed has
  supported delta polling all along; the SDK simply could not ask for it.
- `PaginateOptions.stopOnEmptyPage` for callers driving `paginate()` directly.

### Changed
- `pageSize` documentation was wrong in the types and the README: it said "10
  (default) or 50 (Pro keys only)". The API accepts any size in 1–20 on any key
  and 21–50 on Pro. The wrong text hid the setting that keeps a poller current.
- README: a delta-polling section on falling behind — why a slow poller sees
  hours-old timestamps, and which dials fix it.

## [0.4.1] - 2026-07-28

### Added
- `BadRequestError.allowedParams` — the endpoint's full query-parameter
  vocabulary, which the API now returns on a 400 caused by an unknown
  parameter. Left `undefined` for 400s from anywhere else, so it never guesses.

### Fixed
- `BadRequestError.fields` was `undefined` for the most common validation
  error. The API sends `extra.fields` as an **array** of validator entries when
  a query parameter is unknown or ill-typed, and as a **record** when a field is
  rejected inside a view (a malformed `cursor`); only the record was
  understood. Both shapes now normalise to `Record<string, string[]>`.
- `BadRequestError` docs no longer suggest a cursor can expire — the tokens
  carry no expiry. An unreadable cursor was constructed or truncated rather
  than taken from a previous response's `next_cursor`.

## [0.4.0] - 2026-07-25

### Added
- `sort` on `news.list` / `news.iterate` (`NewsSort = "published" | "ingested"`).
  `"ingested"` is delta polling: the feed ordered by arrival rather than publish
  time, so a poller cannot miss an article that reached the feed late (most do -
  general news lands a median of ~33 minutes after publication). In that mode
  `next_cursor` is always set and an empty `results` means "caught up": store the
  cursor and call again later. `article.original.created_at` carries the moment
  AlphaAI received the article.

### Fixed
- `iterate()` now stops when `next_cursor` stops advancing, not only when it is
  `null`. Delta mode never returns a null cursor, so without this a
  `sort: "ingested"` iteration would have spun against the API until the rate
  limit stopped it.
- `VERSION` was still `0.1.0`, so every request sent
  `User-Agent: alphai-sdk-js/0.1.0` regardless of the installed release. Now
  bumped with the package and pinned to `package.json` by a test.

### Notes
- Cursors are mode-specific. Send the same `sort` on every call of a run -
  replaying a cursor into the other mode returns `400` (`BadRequestError`), as
  does a corrupted cursor, rather than silently restarting at the head.
- On Free and Basic the news-archive horizon applies to where a poll resumes, so
  a cursor left unused for longer than your window returns `403`
  (`extra.reason === "archive_horizon"`). Pro has no window.

## [0.3.0] - 2026-07-11

### Added

- Structured `insider` block on insider-feed items (`news.insider` /
  `news.iterateInsider`): `InsiderEvent` with `side` (`buy`/`sell`/`other`),
  raw `transaction_code`, group-summed `shares` and `total_value_usd`
  (decimal strings), value-weighted `avg_price_usd`, `is_10b5_1`, the
  reporting owner and `transaction_date`. Absent outside the insider feed -
  no more deriving the trade side from the headline.
- `minRelevance` (1-10) on `news.insider` / `news.iterateInsider`, same
  semantics as the main feed's option. Insider rows score deterministically
  from the event's summed dollar value, so this acts as an "only large
  trades" filter. Sends `min_relevance`.

## [0.2.0] - 2026-07-09

### Added

- `pageSize` option on `news.list`, `news.iterate`, `news.insider`, and
  `news.iterateInsider` (sends `page_size`). The API accepts 10 (the default)
  or 50; 50 requires a Pro key. Previously the SDK had no way to request the
  larger page, so Pro callers paid 5x the requests for deep pagination.

## [0.1.2] - 2026-06-17

### Added

- `Symbol` now includes the multi-market fields `country`, `currency`,
  `supports_insider`, and `tv_symbol`, mirroring the API's crypto + foreign
  equity support. `country` (ISO alpha-2) and `currency` are populated for
  foreign/crypto listings (empty for US); `supports_insider` is `true` only for
  US SEC names with Form 4 data. Crypto tickers use a `-USD` quote suffix
  (e.g. `BTC-USD`); foreign listings use the Yahoo-suffix form (e.g. `VOD.L`).

### Documentation

- Corrected the documented `minRelevance` server default to 4 (was 6).

## [0.1.1] - 2026-06-14

### Changed

- Package `homepage` now points to <https://alphai.io/developers> (was the GitHub
  README), so the npm page links to the product documentation.

### Documentation

- README links the standalone [alphai-sdk-ts-examples](https://github.com/makeev/alphai-sdk-ts-examples)
  repo.

No runtime code changed in this release.

## [0.1.0] - 2026-06-14

### Added

- Initial release of `alphai-sdk`, a typed TypeScript client for the AlphaAI REST API.
- `AlphaAI` client with `news` and `symbols` resource namespaces wrapping all 9
  public REST endpoints 1:1.
- `news.list`, `news.iterate`, `news.trending`, `news.insider`,
  `news.iterateInsider`, `news.get`, `news.related`.
- `symbols.list`, `symbols.get`, `symbols.sentimentSummary`, `symbols.insiderSummary`.
- Async-iterator pagination (`for await … of`) with `maxItems` / `maxPages` caps.
- Automatic retries with exponential backoff and full jitter on `429` and `5xx`
  responses and network errors, honoring the `Retry-After` header.
- Rate-limit header capture exposed via `client.lastRateLimit`.
- Typed error hierarchy (`AuthenticationError`, `RateLimitError`,
  `BadRequestError`, …) mapped from HTTP status codes.
- Monetary fields preserved as decimal `string`s; timestamps as ISO 8601 `string`s.
- Zero runtime dependencies (native `fetch`); dual ESM + CJS build with `.d.ts`.

[Unreleased]: https://github.com/makeev/alphai-ts-sdk/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/makeev/alphai-ts-sdk/releases/tag/v0.1.0
