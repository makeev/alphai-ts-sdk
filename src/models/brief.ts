import type { RequestOptions } from "./types";
/** Public Brief responses. Dates remain ISO strings; nullable metrics stay null. */

export interface BriefSignal {
  ticker: string;
  sentiment: string | null;
}

export interface BriefEvent {
  uid: string;
  story_id: string;
  title: string;
  summary: string;
  url: string;
  article_url: string;
  source_domain: string;
  source_type: string;
  time_published: string;
  matched_tickers: string[];
  category: string;
  relevance_score: number;
  information_novelty: number | null;
  actionability: string | null;
  signals: BriefSignal[];
  earnings_available: boolean;
}

export interface BriefEarningsDate {
  ticker: string;
  report_date: string;
}

export interface NewsBrief {
  generated_at: string;
  window_start: string;
  window_end: string;
  hours: number;
  tickers: string[];
  unknown_tickers: string[];
  events: BriefEvent[];
  filings: BriefEvent[];
  upcoming_earnings: BriefEarningsDate[];
  events_truncated: boolean;
  filings_truncated: boolean;
}

/** Explicit tickers on every tier; this endpoint does not read the saved watchlist. */
export interface NewsBriefOptions extends RequestOptions {
  tickers: string | readonly string[];
  /** Publication window: 1–168 hours; default 24. */
  hours?: number;
  /** Maximum stories per section: 1–20; default 20. No pagination. */
  limit?: number;
}
