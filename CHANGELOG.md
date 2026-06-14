# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
