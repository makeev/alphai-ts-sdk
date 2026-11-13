/**
 * String-union enums for the AlphAI API.
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

/**
 * What an SEC 8-K, a 6-K earnings release or a PR Newswire release is about,
 * first of all: the `type` of an article's `event` block and the value the
 * `eventType` feed filter takes.
 *
 * - `earnings`: a results release (its numbers are in the article's `earnings`
 *   block, not in the event).
 * - `earnings_date`: the date of an upcoming report or call.
 * - `exec_change`: an officer or director appointed or leaving.
 * - `m_and_a`: an acquisition, merger or divestiture.
 * - `offering`: a sale of shares, units, warrants or convertible notes (dilution).
 * - `debt_financing`: a loan, credit facility or non-convertible notes.
 * - `dividend`, `buyback`, `bankruptcy`.
 * - `contract_award`: a customer contract, order, licence or supply agreement.
 * - `guidance_update`: an outlook raised, lowered, reaffirmed, withdrawn or initiated.
 * - `stock_split`: forward or reverse.
 * - `listing_notice`: an exchange deficiency notice, regained compliance,
 *   delisting or transfer.
 * - `shareholder_vote`: results of a shareholder meeting.
 * - `restructuring`: layoffs or an exit plan with charges.
 * - `clinical_regulatory`: trial data or a regulator's decision on a product.
 * - `other`: none of the above.
 */
export type CorporateEventType =
  | "earnings"
  | "earnings_date"
  | "exec_change"
  | "m_and_a"
  | "offering"
  | "debt_financing"
  | "dividend"
  | "buyback"
  | "contract_award"
  | "guidance_update"
  | "stock_split"
  | "listing_notice"
  | "shareholder_vote"
  | "bankruptcy"
  | "restructuring"
  | "clinical_regulatory"
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

/**
 * Runtime list of every known {@link CorporateEventType}, in the order the API
 * documents them. An `eventType` outside this list is answered with a `400`
 * that names the allowed values.
 */
export const CORPORATE_EVENT_TYPES = [
  "earnings",
  "earnings_date",
  "exec_change",
  "m_and_a",
  "offering",
  "debt_financing",
  "dividend",
  "buyback",
  "contract_award",
  "guidance_update",
  "stock_split",
  "listing_notice",
  "shareholder_vote",
  "bankruptcy",
  "restructuring",
  "clinical_regulatory",
  "other",
] as const satisfies readonly CorporateEventType[];
