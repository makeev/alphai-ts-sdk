import { AlphaAIError } from "../errors";
import type { HttpClient, QueryParams } from "../http";
import type {
  RadarIterateOptions,
  RadarReading,
  RadarSnapshot,
  RadarSnapshotOptions,
} from "../models/radar";
import { integerRange, tickerCSV } from "./snapshot-params";

function radarQuery(options: RadarSnapshotOptions): QueryParams {
  if (options.ticker !== undefined && options.tickers !== undefined) {
    throw new TypeError("Use ticker or tickers, not both");
  }
  if (options.cursor && options.offset) throw new TypeError("Use cursor or offset, not both");
  integerRange("limit", options.limit, 1, 100);
  integerRange("offset", options.offset, 0);
  if (
    options.minZ !== undefined &&
    (!Number.isFinite(options.minZ) || options.minZ < 0 || options.minZ > 8)
  ) {
    throw new RangeError("minZ must be a finite number between 0 and 8");
  }
  const choices = {
    window: ["4h", "24h"],
    scope: ["market", "watchlist"],
    market: ["all", "us_equity", "crypto", "international"],
    sort: ["score", "stories", "model_stories", "sentiment", "sentiment_change"],
    order: ["asc", "desc"],
    sentiment: ["all", "positive", "negative", "mixed"],
  };
  for (const name of Object.keys(choices) as (keyof typeof choices)[]) {
    const value = options[name];
    if (value !== undefined && !choices[name].includes(value)) {
      throw new TypeError(`Invalid ${name}: ${value}`);
    }
  }
  const ticker = options.ticker?.trim().toUpperCase();
  if (ticker !== undefined && (!ticker || ticker.length > 32)) {
    throw new RangeError("ticker must have 1–32 characters");
  }
  const search = options.search?.trim().toUpperCase();
  if (search !== undefined && search.length > 32) throw new RangeError("search is too long");
  const tickers = options.tickers === undefined ? undefined : tickerCSV(options.tickers, 32);
  if (tickers !== undefined && tickers.length > 16384) throw new RangeError("tickers is too long");
  if (options.cursor !== undefined && options.cursor.length > 4096)
    throw new RangeError("cursor is too long");
  return {
    window: options.window,
    scope: options.scope,
    market: options.market,
    ticker,
    tickers,
    search,
    sort: options.sort,
    order: options.order,
    sentiment: options.sentiment,
    min_z: options.minZ,
    limit: options.limit,
    offset: options.offset,
    cursor: options.cursor,
  };
}

/** Descriptive news activity. The server applies the tier delay to the entire snapshot. */
export class RadarResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Get one page. Free/Basic/Pro delay snapshots by 60/15/0 minutes; inspect as_of/freshness.
   * scope="watchlist" reads the key owner's saved list. Keep all filters and limit unchanged
   * with a cursor. ConflictError (409) requires a new scan without a cursor; 503 is unavailable
   * data, never an empty market. Nullable scores stay null.
   */
  snapshot(options: RadarSnapshotOptions = {}): Promise<RadarSnapshot> {
    return this.http.request<RadarSnapshot>("/api/signals/snapshot/", {
      query: radarQuery(options),
      signal: options.signal,
    });
  }

  /** Iterate one pinned snapshot. Errors propagate; an expired scan never silently restarts. */
  async *iterate(options: RadarIterateOptions = {}): AsyncGenerator<RadarReading> {
    const { maxItems, maxPages, signal } = options;
    integerRange("maxItems", maxItems, 0);
    integerRange("maxPages", maxPages, 0);
    // Capture serialized filters once: caller mutations cannot change subsequent pages.
    const query = radarQuery(options);
    const seen = new Set(options.cursor ? [options.cursor] : []);
    let snapshotId: string | undefined;
    let items = 0;
    let pages = 0;
    while (
      (maxItems === undefined || items < maxItems) &&
      (maxPages === undefined || pages < maxPages)
    ) {
      const page = await this.http.request<RadarSnapshot>("/api/signals/snapshot/", {
        query,
        signal,
      });
      if (snapshotId !== undefined && snapshotId !== page.snapshot_id) {
        throw new AlphaAIError("Radar snapshot changed during cursor pagination");
      }
      snapshotId = page.snapshot_id;
      pages++;
      for (const item of page.results) {
        yield item;
        items++;
        if (maxItems !== undefined && items >= maxItems) return;
      }
      if (!page.next_cursor) return;
      if (seen.has(page.next_cursor)) throw new AlphaAIError("Radar repeated a pagination cursor");
      seen.add(page.next_cursor);
      query.cursor = page.next_cursor;
      query.offset = undefined;
    }
  }
}
