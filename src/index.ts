/**
 * `alphai-sdk` — a typed TypeScript client for the AlphaAI REST API.
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
  EnrichedArticle,
  ImpactAnalysis,
  IndirectMarketEffects,
  InsiderIterateOptions,
  InsiderListOptions,
  KeyEntity,
  NewsContextEnhancement,
  NewsIterateOptions,
  NewsListOptions,
  NewsPage,
  NewsTradingValue,
  OriginalArticle,
  RateLimit,
  RequestOptions,
  RichNewsArticle,
  Symbol,
  SymbolsListOptions,
  TickerAnalysis,
  TickerInsiderSummary,
  TickerSentimentSummary,
  Topic,
  TopInsider,
} from "./models/types";

export { VERSION } from "./version";
