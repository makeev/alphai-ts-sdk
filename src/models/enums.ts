/**
 * String-union enums for the AlphaAI API.
 *
 * Every enum field on a response type is widened with `| (string & {})` so that
 * unknown future values returned by the API still type-check (forward
 * compatibility) while keeping editor autocomplete for the known members.
 */

/** News category. Used to filter the feed and returned on every article. */
export type NewsCategory =
  | "earnings"
  | "mergers_acquisitions"
  | "regulation"
  | "macro_economy"
  | "sector_analysis"
  | "market_movers"
  | "technology"
  | "commodities"
  | "crypto"
  | "ipo"
  | "geopolitics"
  | "insider"
  | "corporate_actions"
  | "other";

/** AI-assessed directional sentiment of a news item for a ticker. */
export type Sentiment = "positive" | "neutral" | "negative";

/** Model confidence in an impact assessment. */
export type Confidence = "high" | "medium" | "low";

/** How tradeable a news item is judged to be. */
export type Actionability = "high" | "medium" | "low" | "negligible";

/**
 * Runtime list of every known {@link NewsCategory}. Handy for building filter
 * UIs or validating user input. The `satisfies` check keeps it in sync with the
 * {@link NewsCategory} union at compile time.
 */
export const NEWS_CATEGORIES = [
  "earnings",
  "mergers_acquisitions",
  "regulation",
  "macro_economy",
  "sector_analysis",
  "market_movers",
  "technology",
  "commodities",
  "crypto",
  "ipo",
  "geopolitics",
  "insider",
  "corporate_actions",
  "other",
] as const satisfies readonly NewsCategory[];
