/**
 * `alphai-sdk` — a typed TypeScript client for the AlphAI REST API.
 *
 * @packageDocumentation
 */

export { AlphaAI } from "./client";
export type { AlphaAIOptions, FetchLike, ResolvedConfig } from "./config";
export { DEFAULT_BASE_URL } from "./config";

export {
  AlphaAIAPIError,
  AlphaAIConnectionError,
  AlphaAIError,
  type APIErrorArgs,
  AuthenticationError,
  BadRequestError,
  MissingAPIKeyError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  ServerError,
} from "./errors";

export {
  NEWS_CATEGORIES,
  type Actionability,
  type Confidence,
  type NewsCategory,
  type Sentiment,
} from "./models/enums";

export type {
  AITradingInsights,
  AlternativePerspectives,
  CategoryFilter,
  DailySentimentBucket,
  EarningsRead,
  EarningsReport,
  EarningsSourceType,
  EarningsVerdict,
  EnrichedArticle,
  Guidance,
  ImpactAnalysis,
  IndirectMarketEffects,
  DateBound,
  InsiderIterateOptions,
  InsiderListOptions,
  KeyEntity,
  KeyMetric,
  LatestEarningsPointer,
  NewsContextEnhancement,
  NewsIterateOptions,
  NewsListOptions,
  NewsPage,
  NewsSort,
  NewsTradingValue,
  OriginalArticle,
  Quote,
  RateLimit,
  RequestOptions,
  RichNewsArticle,
  Segment,
  Symbol,
  SymbolsListOptions,
  TickerAnalysis,
  TickerEarningsHistory,
  TickerInsiderSummary,
  TickerSentimentSummary,
  Topic,
  TopInsider,
  VsPriorGuidance,
} from "./models/types";

export { VERSION } from "./version";
