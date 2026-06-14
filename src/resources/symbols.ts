import type { HttpClient } from "../http";
import type {
  Symbol as AlphaSymbol,
  RequestOptions,
  SymbolsListOptions,
  TickerInsiderSummary,
  TickerSentimentSummary,
} from "../models/types";

/** Symbols endpoints: ticker discovery, detail, and sentiment / insider rollups. */
export class SymbolsResource {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  /** `GET /api/symbols/` — all active tickers, alphabetical (~10k). */
  list(options: SymbolsListOptions = {}): Promise<AlphaSymbol[]> {
    return this.http.request<AlphaSymbol[]>("/api/symbols/", {
      query: { limit: options.limit, offset: options.offset },
      signal: options.signal,
    });
  }

  /** `GET /api/symbols/{ticker}/` — symbol detail. Throws `NotFoundError` for an unknown ticker. */
  get(ticker: string, options: RequestOptions = {}): Promise<AlphaSymbol> {
    if (!ticker) throw new TypeError("symbols.get(ticker): `ticker` is required");
    return this.http.request<AlphaSymbol>(`/api/symbols/${encodeURIComponent(ticker)}/`, {
      signal: options.signal,
    });
  }

  /**
   * `GET /api/symbols/{ticker}/sentiment-summary/` — 7-day AI sentiment rollup
   * (excludes Form 4). An unknown but well-formed ticker returns zeros, not 404.
   */
  sentimentSummary(ticker: string, options: RequestOptions = {}): Promise<TickerSentimentSummary> {
    if (!ticker) throw new TypeError("symbols.sentimentSummary(ticker): `ticker` is required");
    return this.http.request<TickerSentimentSummary>(
      `/api/symbols/${encodeURIComponent(ticker)}/sentiment-summary/`,
      { signal: options.signal },
    );
  }

  /**
   * `GET /api/symbols/{ticker}/insider-summary/` — 30-day Form 4 rollup. Money
   * fields are decimal strings. An unknown but well-formed ticker returns zeros.
   */
  insiderSummary(ticker: string, options: RequestOptions = {}): Promise<TickerInsiderSummary> {
    if (!ticker) throw new TypeError("symbols.insiderSummary(ticker): `ticker` is required");
    return this.http.request<TickerInsiderSummary>(
      `/api/symbols/${encodeURIComponent(ticker)}/insider-summary/`,
      { signal: options.signal },
    );
  }
}
