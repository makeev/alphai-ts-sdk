import type { Actionability, Confidence, NewsCategory, Sentiment } from "./enums";

/**
 * AlphaAI response and request model types.
 *
 * Response objects are returned **as-is from the wire** (snake_case) to match
 * the JSON exactly. Monetary fields stay as decimal `string`s (never coerce to
 * `number` — JS floats lose precision) and timestamps stay as ISO 8601
 * `string`s (no auto-`Date`). Most fields are optional and enum fields tolerate
 * unknown values for forward compatibility.
 */

// ---------------------------------------------------------------------------
// Article building blocks
// ---------------------------------------------------------------------------

export interface Topic {
  topic: string;
  relevance: number;
}

export interface ImpactAnalysis {
  summary?: string;
  sentiment?: Sentiment | (string & {});
  price_impact_prediction?: string;
  confidence?: Confidence | (string & {});
  reasoning?: string;
}

export interface TickerAnalysis {
  ticker: string;
  relevance_context?: string;
  impact_analysis?: ImpactAnalysis;
}

export interface NewsTradingValue {
  actionability_score?: Actionability | (string & {});
  /** 0–10 (0 = pre-existing, already-priced-in information). */
  information_novelty?: number;
  timing_relevance?: string;
  market_sentiment_alignment?: string;
  estimated_read_time?: string;
}

export interface IndirectMarketEffects {
  sector_implications?: string;
  regional_market_impact?: string;
  global_market_relevance?: string;
}

export interface AlternativePerspectives {
  contrarian_view?: string;
  overlooked_factors?: string;
}

export interface KeyEntity {
  name: string;
  type: string;
  description: string;
}

export interface AITradingInsights {
  ticker_analysis: TickerAnalysis[];
  news_trading_value?: NewsTradingValue;
  indirect_market_effects?: IndirectMarketEffects;
  alternative_perspectives?: AlternativePerspectives;
}

export interface NewsContextEnhancement {
  background_context?: string;
  impact_analysis?: string;
  key_entities: KeyEntity[];
  market_relevance_summary?: string;
  estimated_read_time_minutes?: number;
}

/** The `original` block of an article — the source story. Never includes raw text. */
export interface OriginalArticle {
  id?: number;
  /** 16-character hex identifier. */
  uid: string;
  title: string;
  url: string;
  /** ISO 8601 timestamp. */
  time_published: string;
  authors: string[];
  /** AI-generated summary, safe to redistribute. */
  summary: string;
  banner_image?: string | null;
  source: string;
  source_domain: string;
  topics: Topic[];
  /** Loosely typed on purpose — shape varies by source. */
  tickers_sentiment: Record<string, unknown>[];
  created_at: string;
  updated_at: string;
}

/** The `enrichment` block of an article — AlphaAI's added analysis. */
export interface EnrichedArticle {
  category: NewsCategory | (string & {});
  /** Validated tickers (the live column). */
  tickers: string[];
  /** Relevance score, 1–10. */
  relevance_score: number;
  ai_trading_insights?: AITradingInsights;
  news_context_enhancement?: NewsContextEnhancement;
}

/** A fully enriched news article. */
/**
 * Structured SEC Form 4 event block, present on insider-feed items only
 * (`GET /api/news/insider/`). Aggregate of the row's whole transaction group:
 * `shares`/`total_value_usd` are group sums (a 10b5-1 ladder is one event),
 * `avg_price_usd` is value-weighted over priced tranches. `side` is the signal
 * label — `buy` (P) / `sell` (S) / `other` (incl. D, sale to issuer); the raw
 * `transaction_code` rides along. Money/share fields are decimal strings
 * ("25000", "187.32"); null when the filing prices no tranche.
 */
export interface InsiderEvent {
  side: "buy" | "sell" | "other";
  transaction_code: string;
  shares: string;
  avg_price_usd?: string | null;
  total_value_usd?: string | null;
  is_10b5_1: boolean;
  insider_name: string;
  insider_title: string;
  is_officer: boolean;
  is_director: boolean;
  is_ten_percent_owner: boolean;
  /** ISO date of the last fill in the group, e.g. "2026-07-09". */
  transaction_date: string;
}

export interface RichNewsArticle {
  original: OriginalArticle;
  enrichment: EnrichedArticle;
  /** Structured Form 4 event block — insider-feed items only; absent/null elsewhere. */
  insider?: InsiderEvent | null;
  /** Present only when `collapseStories` (collapse=story) is set. */
  story_id?: string | null;
  /** Present only when `collapseStories` is set. */
  sources_count?: number | null;
  /** Present only when `collapseStories` is set — up to 10 source domains. */
  sources?: string[] | null;
}

/** A cursor-paginated page of news (endpoints `/api/news/` and `/api/news/insider/`). */
export interface NewsPage {
  results: RichNewsArticle[];
  /** Opaque cursor for the next page, or `null` at the end of the feed. */
  next_cursor: string | null;
}

// ---------------------------------------------------------------------------
// Symbols
// ---------------------------------------------------------------------------

/**
 * A tradeable symbol.
 *
 * Note: this type is named `Symbol` to mirror the API's model. When importing
 * it into code that also uses the global `Symbol`, alias it, e.g.
 * `import type { Symbol as AlphaSymbol } from "alphai-sdk"`.
 *
 * The list endpoint (`/api/symbols/`) omits `description` and `website`; the
 * detail endpoint (`/api/symbols/{ticker}/`) includes them. Both carry the
 * multi-market fields (`country`, `currency`, `supports_insider`, `tv_symbol`).
 *
 * Covers US equities/ETFs, cryptocurrencies (`BTC-USD`), and foreign listings
 * (Yahoo-suffix form, e.g. `VOD.L`).
 */
export interface Symbol {
  symbol: string;
  name: string;
  /** `"Stock"`, `"ETF"`, or `"Crypto"`. */
  asset_type?: string;
  /**
   * TradingView exchange prefix. US: NYSE/NASDAQ/AMEX/OTC/CBOE. Foreign listings
   * carry their venue (LSE, XETR, EURONEXT, TSE, HKEX, …); crypto carries the
   * `CRYPTO` sentinel. `""` if unknown.
   */
  exchange?: string;
  sector?: string;
  industry?: string;
  /** ISO alpha-2 country code for foreign listings; `""` for US and crypto. */
  country?: string;
  /** Trading currency for foreign/crypto listings; `""` for US. */
  currency?: string;
  /**
   * `true` only for US SEC names that can have Form 4 insider data; `false` for
   * cryptocurrencies and foreign listings.
   */
  supports_insider?: boolean;
  /** Optional TradingView-symbol override; usually `""`. */
  tv_symbol?: string;
  /**
   * Company-confirmed date of the next earnings report, `YYYY-MM-DD`, or `null`
   * when AlphaAI holds no confirmed date — never an estimate. Detail responses
   * only.
   */
  next_report_date?: string | null;
  description?: string;
  website?: string | null;
  /** Lowercase names the issuer is known by when they differ from `name`. List responses only. */
  brand_aliases?: string[];
  /**
   * The coin's ticker when this symbol's bare string also names an active
   * cryptocurrency (`BTC` the Grayscale ETF → `BTC-USD`); `null` otherwise.
   * Detail responses only.
   */
  crypto_counterpart?: string | null;
  /** Display name of `crypto_counterpart`; `""` when it is null. Detail responses only. */
  crypto_counterpart_name?: string;
  /** `"active"` or `"delisted"`. Delisted symbols stay resolvable so their history remains reachable. */
  status?: "active" | "delisted";
  /** When the symbol was marked delisted (ISO datetime); `null` for active symbols and for delistings before July 2026. */
  delisted_at?: string | null;
  /** Successor ticker when a delisted company continues under a new symbol; `""` otherwise. */
  renamed_to?: string;
}

export interface DailySentimentBucket {
  /** YYYY-MM-DD. */
  day: string;
  bullish: number;
  neutral: number;
  bearish: number;
}

/** 7-day AI sentiment rollup (endpoint `/api/symbols/{ticker}/sentiment-summary/`). */
export interface TickerSentimentSummary {
  ticker: string;
  /** Window length in days (7). */
  days: number;
  total: number;
  bullish: number;
  neutral: number;
  bearish: number;
  daily: DailySentimentBucket[];
}

export interface TopInsider {
  name: string;
  /** "" when the person is a director only. */
  title: string;
  transaction_count: number;
  /** Decimal string (buys − sells), USD. `null` when unknown. */
  net_value: string | null;
}

/** 30-day SEC Form 4 rollup (endpoint `/api/symbols/{ticker}/insider-summary/`). */
export interface TickerInsiderSummary {
  ticker: string;
  /** Window length in days (30). */
  days: number;
  total_transactions: number;
  buy_count: number;
  sell_count: number;
  /** Decimal string, USD. `null` when unknown. */
  buy_value_usd: string | null;
  /** Decimal string, USD. `null` when unknown. */
  sell_value_usd: string | null;
  /** Percentage (0–100) of transactions under a 10b5-1 plan. */
  pct_10b5_1: number;
  top_insiders: TopInsider[];
}

// ---------------------------------------------------------------------------
// Earnings
// ---------------------------------------------------------------------------

/** The filing kind of an earnings read. */
export type EarningsSourceType = "sec_form8k" | "sec_form6k" | (string & {});

/** The rollup verdict on an earnings read. */
export type EarningsVerdict = "strong" | "solid" | "mixed" | "weak" | (string & {});

/** One headline figure from an earnings release, as reported. */
export interface KeyMetric {
  name: string;
  /** Figure as reported, e.g. `"$96.2 billion"`. */
  value: string;
  /** `"GAAP"`, `"non-GAAP"`, or `"other"`. */
  basis?: string;
  prior_year?: string | null;
  prior_quarter?: string | null;
  yoy_change?: string | null;
  qoq_change?: string | null;
  /**
   * `value` as a number at the scale it was printed, sign applied; `null` when
   * the string carries no figure (API 1.34.0, 2026-09-12).
   */
  numeric?: number | null;
  /** ISO-style currency code (`"USD"`, `"EUR"`…), `"pct"`, `"bp"`, or `null` for a plain count. */
  unit?: string | null;
  /**
   * The multiplier `numeric` is expressed in: `"ones"` | `"thousands"` |
   * `"millions"` | `"billions"` | `"trillions"`. `null` when the filing did not
   * say — treat as unknown, never assume millions.
   */
  scale?: "ones" | "thousands" | "millions" | "billions" | "trillions" | null;
}

/** One reporting segment and what drove it. */
export interface Segment {
  name: string;
  revenue: string;
  yoy_change?: string | null;
  qoq_change?: string | null;
  driver?: string;
}

/** Company guidance for the coming period (`null` when not disclosed). */
export interface Guidance {
  period?: string;
  revenue?: string | null;
  gross_margin?: string | null;
  operating_expenses?: string | null;
  tax_rate?: string | null;
  other?: string[];
}

/** A reported figure against the company's own prior outlook. */
export interface VsPriorGuidance {
  metric?: string;
  prior_guidance?: string;
  actual?: string;
  verdict?: string;
}

/** A management quote surfaced from the filing. */
export interface Quote {
  speaker: string;
  role?: string | null;
  text: string;
}

/**
 * AlphaAI's structured read of an earnings release, produced from the
 * company's own SEC filing — an 8-K item 2.02 for US filers, a 6-K earnings
 * release for foreign private issuers — with every figure checked against the
 * filing text. Consensus estimates and price targets are deliberately absent.
 */
export interface EarningsReport {
  company: string;
  ticker: string;
  fiscal_period: string;
  /** YYYY-MM-DD, or `null` when the filing does not state one. */
  period_end?: string | null;
  headline: string;
  verdict: EarningsVerdict;
  verdict_reason?: string;
  key_metrics: KeyMetric[];
  segments?: Segment[];
  guidance?: Guidance | null;
  vs_prior_guidance?: VsPriorGuidance[];
  capital_returns?: string[];
  balance_sheet_cash_flow?: string[];
  drivers?: string[];
  concerns?: string[];
  what_to_watch?: string[];
  quotes?: Quote[];
  analysis?: string;
  /** What the filing did NOT state, named rather than guessed. */
  missing_items?: string[];
  numbers_verified_from_document?: boolean;
}

/**
 * One published earnings read in a ticker's history. `ticker` is the share
 * class the filing was actually made under, which share-class bridging may
 * render as a class you did not ask for.
 */
export interface EarningsRead {
  /** Article uid; the same read is served by `GET /api/news/{uid}/`. */
  uid: string;
  /** ISO 8601 timestamp. */
  time_published: string;
  title: string;
  source_type: EarningsSourceType;
  ticker: string;
  fiscal_period: string;
  analysis: EarningsReport;
}

/** Pointer to a ticker's most recent earnings read (for the article link). */
export interface LatestEarningsPointer {
  uid: string;
  /** ISO 8601 timestamp. */
  time_published: string;
  title: string;
  fiscal_period: string;
  verdict: EarningsVerdict;
  headline: string;
}

/** Endpoint `/api/symbols/{ticker}/earnings/` — reads newest first, capped at 20. */
export interface TickerEarningsHistory {
  ticker: string;
  /** Empty when no read exists yet — a normal answer, not an error. */
  reports: EarningsRead[];
  /** Company-confirmed next report date, `YYYY-MM-DD` or `null`. */
  next_report_date: string | null;
}

// ---------------------------------------------------------------------------
// Rate limit
// ---------------------------------------------------------------------------

/**
 * Rate-limit snapshot parsed from response headers. Fields are `null` when the
 * corresponding header is absent (e.g. on cache-served responses).
 */
export interface RateLimit {
  /** `X-RateLimit-Limit` — requests allowed per window. */
  limit: number | null;
  /** `X-RateLimit-Remaining` — requests left in the current window. */
  remaining: number | null;
  /** `X-RateLimit-Reset` — epoch seconds when the window resets. */
  reset: number | null;
}

// ---------------------------------------------------------------------------
// Request options (camelCase inputs → snake_case query params)
// ---------------------------------------------------------------------------

/** A single category, an array of categories, or a CSV string. */
export type CategoryFilter = NewsCategory | (string & {}) | Array<NewsCategory | (string & {})>;

/** Options accepted by every request method for per-call cancellation. */
export interface RequestOptions {
  /** An `AbortSignal` to cancel this request. */
  signal?: AbortSignal;
}

/** Options for {@link NewsResource.list}. */
/**
 * Feed ordering. `published` (the default) is the reverse-chronological feed and
 * pages into older history. `ingested` is delta polling: rows in the order they
 * became available, ascending, so a poller cannot miss an article that reached
 * the feed after its publish time.
 *
 * The two modes mint SEPARATE cursor families. Pass the same `sort` on every
 * call of a run: replaying a cursor into the other mode is a `400`, not a
 * silent restart.
 */
export type NewsSort = "published" | "ingested";

/**
 * A `fromDate` / `toDate` window bound. A bare `"YYYY-MM-DD"` string means the
 * WHOLE day — the server reads a bare `to_date` as that day's end, so equal
 * bounds return the day rather than an empty page. A `Date` is an exact
 * instant (serialized with `toISOString()`, always UTC); a datetime string
 * without an offset is read as UTC by the server.
 */
export type DateBound = string | Date;

export interface NewsListOptions extends RequestOptions {
  /** Opaque pagination cursor from a previous page's `next_cursor`. */
  cursor?: string;
  /** Restrict to a single ticker. */
  symbol?: string;
  /** Include only these categories (OR-matched). */
  category?: CategoryFilter;
  /** Exclude these categories. */
  excludeCategories?: CategoryFilter;
  /** Minimum relevance score, 1–10 (server default 4). */
  minRelevance?: number;
  /** Collapse reprints into a single story (sends `collapse=story`). */
  collapseStories?: boolean;
  /**
   * Items per page. 1–20 on any key (server default 10); 21–50 needs a Pro
   * key, and anything outside 1–50 is a `400`. Sends `page_size`.
   *
   * This is the main dial for keeping a poller current: one call returns one
   * page, so a poller that drains slower than the feed publishes drifts
   * backwards and its articles start reading as hours old.
   */
  pageSize?: number;
  /**
   * Feed ordering; see {@link NewsSort}. With `"ingested"`, `next_cursor` is
   * always set — it is a polling position, never an end-of-feed marker — so an
   * empty `results` is the only "caught up" signal. Store the cursor and call
   * again later.
   */
  sort?: NewsSort;
  /**
   * Inclusive lower bound on `time_published`; see {@link DateBound}. Sends
   * `from_date`. A window reaching past the key's archive horizon is a `403`
   * on the first page, and a window cannot be combined with
   * `sort: "ingested"` (`400`) — delta polling never walks back into history.
   */
  fromDate?: DateBound;
  /** Inclusive upper bound on `time_published`; see {@link DateBound}. Sends `to_date`. */
  toDate?: DateBound;
}

/** Options for {@link NewsResource.iterate}. */
export interface NewsIterateOptions extends NewsListOptions {
  /** Stop after yielding this many articles. */
  maxItems?: number;
  /** Stop after fetching this many pages. */
  maxPages?: number;
}

/** Options for {@link NewsResource.insider}. */
export interface InsiderListOptions extends RequestOptions {
  cursor?: string;
  symbol?: string;
  /**
   * Minimum relevance score (1-10), same semantics as the main feed. Insider
   * rows score deterministically from the event's summed dollar value, so
   * this acts as an "only large trades" filter. Sends `min_relevance`.
   */
  minRelevance?: number;
  /**
   * Items per page. 1–20 on any key (server default 10); 21–50 needs a Pro
   * key. Sends `page_size`.
   */
  pageSize?: number;
  /**
   * Feed ordering; see {@link NewsSort}. The insider feed supports delta
   * polling under the same contract as the main feed, with its own cursor
   * family.
   */
  sort?: NewsSort;
  /**
   * Inclusive lower bound on `time_published` — when the filing reached the
   * feed, NOT the trade date inside the `insider` block (a Form 4 is filed
   * days after the trade). Same window semantics as the main feed; see
   * {@link DateBound}. Sends `from_date`.
   */
  fromDate?: DateBound;
  /** Inclusive upper bound, same clock as `fromDate`. Sends `to_date`. */
  toDate?: DateBound;
}

/** Options for {@link NewsResource.iterateInsider}. */
export interface InsiderIterateOptions extends InsiderListOptions {
  maxItems?: number;
  maxPages?: number;
}

/** Options for {@link SymbolsResource.list}. */
export interface SymbolsListOptions extends RequestOptions {
  /** Page size, 1–10000. */
  limit?: number;
  /** Offset into the alphabetical list, ≥0. */
  offset?: number;
  /**
   * Resolve a name, brand or ticker prefix to its canonical symbol
   * (`"bitcoin"` → `BTC-USD`, `"spacex"` → `SPCX`) — the lookup a 404
   * `unknown_symbol` error points you to.
   */
  search?: string;
}
