import type { RequestOptions } from "./types";
/** Public Radar responses. Dates remain ISO strings; nullable metrics stay null. */
export type RadarWindow = "4h" | "24h";
export type RadarScope = "market" | "watchlist";
export type RadarTier = "free" | "basic" | "pro";
export type RadarMarket = "all" | "us_equity" | "crypto" | "international";
export type RadarSort = "score" | "stories" | "model_stories" | "sentiment" | "sentiment_change";
export type RadarOrder = "asc" | "desc";
export type RadarSentimentFilter = "all" | "positive" | "negative" | "mixed";

export interface RadarCollection {
  status: "healthy" | "unverified";
  reasons: string[];
  required_channels: string[];
}

export interface RadarSentiment {
  value: number | null;
  usable_stories: number;
  coverage: number | null;
  reason: string | null;
}

export interface RadarCalculationParams {
  effective_at: number;
  window_seconds: number;
  baseline_seconds: number;
  half_life_seconds: number;
  min_relevance: number;
  max_story_tickers: number;
  prior_stories: number;
  min_baseline_stories: number;
  min_baseline_days: number;
  min_sentiment_stories: number;
  min_sentiment_coverage: number;
  spike_tail: number;
}

export interface RadarAccess {
  tier: RadarTier;
  delay_seconds: number;
  scope: RadarScope;
  watchlist_count: number | null;
  watchlist_limit: number | null;
}

export interface RadarEvidence {
  uid: string;
  title: string;
  url: string;
  source_domain: string;
  time_published: string;
}

export interface RadarReading {
  ticker: string;
  sector: string | null;
  market: string | null;
  market_exposure_baseline: number;
  market_exposure_current: number;
  collection: RadarCollection;
  stories: number;
  articles: number;
  outlets: number;
  model_stories: number;
  model_outlets: number;
  baseline_stories: number;
  baseline_active_days: number;
  stories_per_window_unadjusted: number;
  stories_expected: number | null;
  tail_probability: number | null;
  news_z: number | null;
  anomaly_reason: string | null;
  candidate_news_spike: boolean;
  sent: RadarSentiment;
  sent_prev: RadarSentiment;
  sent_delta: number | null;
  evidence_uids: string[];
  name: string | null;
  evidence: RadarEvidence[];
}

export interface RadarSummary {
  active_tickers: number;
  scored_tickers: number;
  elevated_tickers: number;
  verified_candidates: number;
  collection_unverified: number;
}

export interface RadarFreshness {
  mode: "historical_preview" | "live";
  effective_delay_seconds: number;
  generated_at: string | null;
  source_watermark: string | null;
  source_checked_at: string | null;
  unavailable_reason: string | null;
}

export interface RadarWatchlistCoverage {
  no_recent_news: string[];
  not_in_snapshot: string[];
}

export interface RadarSnapshot {
  snapshot_id: string;
  methodology_version: string;
  research_only: boolean;
  point_in_time: boolean;
  as_of: string;
  preview_reference_at: string | null;
  freshness: RadarFreshness;
  access: RadarAccess;
  window: RadarWindow;
  parameters: RadarCalculationParams;
  limitations: string[];
  input_hashes: Record<string, string>;
  universe: number;
  summary: RadarSummary;
  watchlist_coverage: RadarWatchlistCoverage | null;
  total: number;
  offset: number;
  next_offset: number | null;
  next_cursor: string | null;
  previous_cursor: string | null;
  results: RadarReading[];
}

export interface RadarSnapshotOptions extends RequestOptions {
  /** Window ending at the selected snapshot's as_of; default 24h. */
  window?: RadarWindow;
  /** watchlist reads the key owner's saved symbols; default market. */
  scope?: RadarScope;
  market?: RadarMarket;
  /** Exact ticker; mutually exclusive with tickers. No alias expansion. */
  ticker?: string;
  /** Exact symbols, serialized as one CSV parameter. No tier ticker cap. */
  tickers?: string | readonly string[];
  /** Case-insensitive ticker substring. */
  search?: string;
  sort?: RadarSort;
  order?: RadarOrder;
  sentiment?: RadarSentimentFilter;
  /** Descriptive activity score threshold, 0–8. */
  minZ?: number;
  /** Page size, 1–100; default 50. */
  limit?: number;
  /** Legacy starting offset; prefer cursors. Cannot combine a nonzero offset and cursor. */
  offset?: number;
  /** Opaque token pinning the snapshot, filters and access context. 409 means start a new scan. */
  cursor?: string;
}
export interface RadarIterateOptions extends RadarSnapshotOptions {
  maxItems?: number;
  maxPages?: number;
}
