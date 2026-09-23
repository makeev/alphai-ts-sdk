import type { CategoryFilter, DateBound, NewsPage, RequestOptions } from "./types";

/** Why an article matched. Scores are comparable within one response only. */
export interface SearchMatch {
  score: number;
  /** Matched word count in broadened mode; null in strict mode. */
  terms_matched?: number | null;
  /** Summary fragment with **highlighted** words; null for title/entity-only matches. */
  context?: string | null;
}

/** The server's interpretation of the text and its effective archive window. */
export interface NewsSearchQueryInfo {
  mode: "strict" | "broadened" | "no_match" | "no_terms";
  sort: "relevance" | "published";
  terms: string[];
  required_terms?: string[];
  optional_terms?: string[];
  window_from?: string | null;
  note?: string;
}

export interface NewsSearchPage extends NewsPage {
  /** Number of articles on this page. */
  count: number;
  /** Visible matches in the bounded candidate set (at most 200), not a corpus total. */
  matched: number;
  query: NewsSearchQueryInfo;
}

/** Text search with explicit filters. Keep all options fixed when following a cursor. */
export interface NewsSearchOptions extends RequestOptions {
  /** 2-200 characters; supports quoted phrases, -word and OR. Sent as q. */
  query: string;
  symbol?: string;
  category?: CategoryFilter;
  /** Press (gdelt), sec_form4, sec_form8k or sec_form6k; single, CSV or array. */
  sourceType?: string | string[];
  /** SEC 8-K item code (e.g. 5.02); implies sourceType: sec_form8k. */
  item?: string;
  minRelevance?: number;
  collapseStories?: boolean;
  cursor?: string;
  /** 1-20 on any key; 21-50 requires Pro. Server default: 10. */
  pageSize?: number;
  fromDate?: DateBound;
  toDate?: DateBound;
}
