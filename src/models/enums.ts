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

/**
 * The Form 4 sale label: was the sale the insider's own decision? Reported as
 * `decision` in an article's `insider` block and taken by the `decision`
 * filter of the insider feed.
 *
 * - `discretionary`: the insider chose to sell; nothing in the filing explains
 *   the sale.
 * - `plan_like`: the sale follows from a 10b5-1 plan or from paperwork (shares
 *   sold to pay the tax on vesting, a sale that covers an option exercise).
 * - `unknown`: the filing does not say enough to tell.
 *
 * Only sales (`transaction_code` `S`) are labelled. Purchases, `D` (a sale to
 * the issuer) and other codes carry `null`.
 */
export type InsiderDecision = "discretionary" | "plan_like" | "unknown";

/**
 * Why an insider sale got its {@link InsiderDecision}, taken from the largest
 * sale that set it.
 *
 * With `plan_like`:
 * - `plan_10b5_1`: the 10b5-1 checkbox, or a footnote that places the sale
 *   under a pre-arranged plan (so it can appear with `is_10b5_1: false`).
 * - `tax_withholding`: shares sold to pay the tax on vesting.
 * - `exercise_cover`: the sale covers the cost of an option exercise and its tax.
 * - `stated_non_discretionary`: a footnote says the sale was automatic or
 *   outside the insider's discretion.
 *
 * With `discretionary`:
 * - `open_market`: no plan or paperwork explains the sale. Nothing in the
 *   filing points to one, or the sale is far larger than what vested or was
 *   exercised.
 * - `exercise_and_sell`: options exercised and the exercised shares sold,
 *   beyond what covering the exercise needs.
 * - `sold_all_vested`: the shares sold plus those withheld for tax cover
 *   everything that vested.
 *
 * With `unknown`:
 * - `partial_vest_sale`: part of the newly vested shares sold, more than the
 *   tax alone would need, or on top of tax already withheld.
 * - `cover_ambiguous`: the sale could be an exercise cover at a high tax rate
 *   or a choice.
 * - `mixed_acquisitions`: the filing both vests shares and exercises options,
 *   so the sale cannot be tied to either.
 * - `price_disputed`: the filed price failed a price check, so the share
 *   arithmetic is not trusted.
 * - `no_lines`: the rest of the filing is not held.
 */
export type InsiderDecisionReason =
  | "plan_10b5_1"
  | "tax_withholding"
  | "exercise_cover"
  | "stated_non_discretionary"
  | "open_market"
  | "exercise_and_sell"
  | "sold_all_vested"
  | "partial_vest_sale"
  | "cover_ambiguous"
  | "mixed_acquisitions"
  | "price_disputed"
  | "no_lines";

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

/**
 * Runtime list of every {@link InsiderDecision}: the three values the
 * `decision` filter of the insider feed takes. Any other value is answered
 * with a `400`.
 */
export const INSIDER_DECISIONS = [
  "discretionary",
  "plan_like",
  "unknown",
] as const satisfies readonly InsiderDecision[];

/**
 * Runtime list of every known {@link InsiderDecisionReason}, in the order the
 * API documents them: four for `plan_like`, three for `discretionary`, five for
 * `unknown`. The API can add reasons, so a response may carry one that is not
 * listed here.
 */
export const INSIDER_DECISION_REASONS = [
  "plan_10b5_1",
  "tax_withholding",
  "exercise_cover",
  "stated_non_discretionary",
  "open_market",
  "exercise_and_sell",
  "sold_all_vested",
  "partial_vest_sale",
  "cover_ambiguous",
  "mixed_acquisitions",
  "price_disputed",
  "no_lines",
] as const satisfies readonly InsiderDecisionReason[];
