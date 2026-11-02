import type { RequestOptions } from "./types";

/**
 * Insider cluster buys (`GET /api/news/insider/clusters/`): episodes in which
 * several different insiders of one issuer bought on the open market together.
 * An issuer's Form 4 purchase dates are chained into one episode while
 * consecutive purchases are at most 10 days apart (an episode is cut at 30
 * days), and every purchase inside it is examined before a buyer counts.
 */

/**
 * The episode's verdict. `open_market`: at least two independent buyers remain
 * and one of them is an officer or director. `holders_only`: only 10% holders
 * without a role remain. `plan_or_offering`: fewer than two independent buyers
 * — an IPO or PIPE allocation, a plan lot, duplicate reporters.
 */
export type ClusterPattern = "open_market" | "plan_or_offering" | "holders_only";

/** `pattern` filter: a verdict, or `all` for every episode. */
export type ClusterPatternFilter = ClusterPattern | "all";

/**
 * Why a buyer does or does not count toward the cluster. `independent` buyers
 * are the cluster. `plan_like`: the buyer's fills all share an exact
 * date-and-price pair with another buyer's (an allocation, an ESPP/DRIP lot),
 * match another direct holder's lot at a round price, or the filing itself says
 * the shares were not bought on the open market (then `reason` is set).
 * `unpriced`: no fill carries a price (units, exchanges). `duplicate_of`: the
 * same transaction another reporter already reported; `duplicate_of` names
 * that reporter.
 */
export type ClusterBuyerRole = "independent" | "plan_like" | "unpriced" | "duplicate_of";

/**
 * Set on a `plan_like` buyer when the Form 4's own footnotes decided it:
 * `placement` — bought from the issuer (a PIPE, a subscription or securities
 * purchase agreement, SPAC sponsor units); `offering` — allocated in a public
 * offering or IPO; `private` — a negotiated block from another holder.
 */
export type ClusterBuyerReason = "placement" | "offering" | "private";

/** Cluster ordering; cursors are sort-specific. */
export type ClusterSort = "recent" | "buyers" | "value";

/** One reporting owner inside an episode and the role the rule gave them. */
export interface ClusterBuyer {
  name: string;
  /** `""` when the person is a director only. */
  title: string;
  is_officer: boolean;
  is_director: boolean;
  is_ten_percent_owner: boolean;
  role: ClusterBuyerRole;
  /** `null` when the price shape alone decided the role. */
  reason: ClusterBuyerReason | null;
  /** The reporter whose transaction this buyer duplicated (`duplicate_of` role only). */
  duplicate_of: string | null;
  fills: number;
  /** Sum of this buyer's priced fills, USD, as a decimal string; `null` when none carries a price. */
  usd: string | null;
  /** `YYYY-MM-DD`. */
  first_date: string;
  /** `YYYY-MM-DD`. */
  last_date: string;
  /** The `uid`s of the insider news rows fronting this buyer's filings — `news.get(uid)` opens the event. */
  news_uids: string[];
}

/** One Form 4 behind the episode, with its EDGAR index page. */
export interface ClusterFiling {
  accession_number: string;
  /** ISO-8601 datetime. */
  filed_at: string;
  sec_url: string;
}

/**
 * One issuer's run of Form 4 purchases and its verdict. `buyers` counts
 * independent buyers (the cluster); `buyers_total` everyone who bought,
 * including plan, unpriced and duplicate reporters. Money fields are decimal
 * strings.
 */
export interface InsiderCluster {
  ticker: string;
  name: string;
  /** SEC Central Index Key of the issuer. */
  cik: number;
  /** First purchase date of the episode, `YYYY-MM-DD`. */
  window_start: string;
  /** Last purchase date of the episode, `YYYY-MM-DD`. */
  window_end: string;
  /** When the episode's latest filing reached EDGAR — the clock `days` is measured on. */
  known_at: string;
  buyers: number;
  buyers_total: number;
  officer_director_buyers: number;
  ten_percent_owner_buyers: number;
  /** Purchase tranches counted (a transaction reported twice is counted once). */
  fills: number;
  /** Distinct Form 4 filings. */
  filings: number;
  /** Sum of the counted tranches' values, USD; `null` when no tranche carries a price. */
  total_usd: string | null;
  /** `true` when at least one counted tranche has no price, so `total_usd` understates the episode. */
  value_partial: boolean;
  distinct_dates: number;
  /** Distinct prices to the cent across priced tranches. */
  distinct_prices: number;
  pattern: ClusterPattern;
  /**
   * Machine-readable notes behind the verdict: `mass_uniform_date_price`,
   * `same_price_across_dates`, `one_price_multi_date`, `plan_like_buyers`,
   * `off_market_buyers`, `unpriced_buyers`, `duplicate_filings`,
   * `no_officer_or_director`.
   */
  pattern_reasons: string[];
  buyers_detail: ClusterBuyer[];
  filings_detail: ClusterFiling[];
}

/** What the list is and is not: a descriptive screen, not point-in-time. */
export interface InsiderClustersMeta {
  /** When the underlying computation ran (refreshed every few minutes). */
  as_of: string;
  /** Earliest purchase date on record; nothing before it can appear. */
  coverage_since: string | null;
  episode_gap_days: number;
  episode_max_days: number;
  research_only: boolean;
  point_in_time: boolean;
}

/** A page of classified purchase episodes. */
export interface InsiderClustersPage {
  results: InsiderCluster[];
  /** Opaque cursor for the next page (pass back with the same `sort`); `null` at the end. */
  next_cursor: string | null;
  meta: InsiderClustersMeta;
}

/** Options for {@link NewsResource.insiderClusters}. */
export interface InsiderClustersOptions extends RequestOptions {
  /**
   * Lookback in days over `known_at`, 1–90 (server default 30). Deeper than
   * your plan's archive horizon (Free 30, Basic 90) is a `PermissionDeniedError`
   * (`archive_horizon`). Sends `days`.
   */
  days?: number;
  /**
   * Minimum headcount, 2–10 (server default 2): independent buyers for
   * `open_market` / `holders_only` episodes, everyone who bought for
   * `plan_or_offering` ones. Sends `min_buyers`.
   */
  minBuyers?: number;
  /**
   * Drop episodes whose `total_usd` is below this. An episode with an unknown
   * total is kept, not dropped. Sends `min_usd`.
   */
  minUsd?: number;
  /** Which verdicts to return; `open_market` by default. Sends `pattern`. */
  pattern?: ClusterPatternFilter;
  /**
   * One ticker. A renamed company's current ticker also matches episodes tagged
   * with its former ticker, and share-class siblings match each other. Sends
   * `symbol`.
   */
  symbol?: string;
  /**
   * `recent` (default) — newest `known_at` first; `buyers` — most independent
   * buyers first, ties by value; `value` — largest `total_usd` first, unknown
   * totals last. Cursors are sort-specific. Sends `sort`.
   */
  sort?: ClusterSort;
  /** Opaque cursor from a prior page's `next_cursor`, with the same `sort`. */
  cursor?: string;
  /** Items per page, 1–20 on every key (server default 10), 21–50 with Pro. Sends `page_size`. */
  pageSize?: number;
}

/** Options for {@link NewsResource.iterateInsiderClusters}. */
export interface InsiderClustersIterateOptions extends InsiderClustersOptions {
  maxItems?: number;
  maxPages?: number;
}
