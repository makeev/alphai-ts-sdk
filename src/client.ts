import { type AlphaAIOptions, resolveConfig } from "./config";
import { HttpClient } from "./http";
import type { RateLimit } from "./models/types";
import { NewsResource } from "./resources/news";
import { RadarResource } from "./resources/radar";
import { SymbolsResource } from "./resources/symbols";

/**
 * The AlphAI API client.
 *
 * ```ts
 * import { AlphaAI } from "alphai-sdk";
 *
 * const client = new AlphaAI({ apiKey: "ak_live_…" }); // or set ALPHAI_API_KEY
 * const page = await client.news.list({ symbol: "NVDA" });
 * ```
 */
export class AlphaAI {
  /** News endpoints. */
  readonly news: NewsResource;
  /** Market and saved-watchlist Radar snapshots. */
  readonly radar: RadarResource;
  /** Symbols endpoints. */
  readonly symbols: SymbolsResource;

  private readonly http: HttpClient;

  constructor(options: AlphaAIOptions = {}) {
    this.http = new HttpClient(resolveConfig(options));
    this.radar = new RadarResource(this.http);
    this.news = new NewsResource(this.http);
    this.symbols = new SymbolsResource(this.http);
  }

  /**
   * Rate-limit snapshot from the most recent response that carried the
   * `X-RateLimit-*` headers, or `null` if none has yet. Cache-served responses
   * may omit the headers, in which case this keeps its previous value.
   */
  get lastRateLimit(): RateLimit | null {
    return this.http.lastRateLimit;
  }
}
