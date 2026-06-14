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
export interface RichNewsArticle {
  original: OriginalArticle;
  enrichment: EnrichedArticle;
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
 * detail endpoint (`/api/symbols/{ticker}/`) includes them.
 */
export interface Symbol {
  symbol: string;
  name: string;
  /** e.g. "Stock" | "ETF". */
  asset_type?: string;
  /** NYSE/NASDAQ/AMEX/OTC/CBOE; "" if unknown. */
  exchange?: string;
  sector?: string;
  industry?: string;
  description?: string;
  website?: string | null;
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
export interface NewsListOptions extends RequestOptions {
  /** Opaque pagination cursor from a previous page's `next_cursor`. */
  cursor?: string;
  /** Restrict to a single ticker. */
  symbol?: string;
  /** Include only these categories (OR-matched). */
  category?: CategoryFilter;
  /** Exclude these categories. */
  excludeCategories?: CategoryFilter;
  /** Minimum relevance score, 1–10 (server default 6). */
  minRelevance?: number;
  /** Collapse reprints into a single story (sends `collapse=story`). */
  collapseStories?: boolean;
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
}
