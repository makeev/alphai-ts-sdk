import { AlphaAIError, MissingAPIKeyError } from "./errors";
import { VERSION } from "./version";

/**
 * A `fetch`-compatible function. Matches the global `fetch` signature closely
 * enough that you can pass `globalThis.fetch` or any drop-in (node-fetch,
 * undici, a test double) directly.
 */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Options for constructing an {@link AlphaAI} client. */
export interface AlphaAIOptions {
  /**
   * Your AlphaAI API key (`ak_live_…`). If omitted, the client reads
   * `process.env.ALPHAI_API_KEY`. Create one at https://alphai.io/account/api-keys.
   */
  apiKey?: string;
  /** Base URL. Defaults to `https://api.alphai.io`. */
  baseURL?: string;
  /** Per-request timeout in milliseconds. Defaults to `30000`. */
  timeout?: number;
  /** Maximum retry attempts on 429/5xx/network errors. Defaults to `2`. */
  maxRetries?: number;
  /** Base for exponential backoff, in seconds. Defaults to `0.5`. */
  backoffFactor?: number;
  /** Custom `fetch` implementation (tests, proxies, edge runtimes). */
  fetch?: FetchLike;
  /** Value sent as the `User-Agent` header. Defaults to `alphai-sdk-js/<version>`. */
  userAgent?: string;
}

/** Fully-resolved configuration with all defaults applied. */
export interface ResolvedConfig {
  apiKey: string;
  baseURL: string;
  timeout: number;
  maxRetries: number;
  backoffFactor: number;
  fetch: FetchLike;
  userAgent: string;
}

/** Default API base URL. */
export const DEFAULT_BASE_URL = "https://api.alphai.io";

interface ProcessLike {
  env?: Record<string, string | undefined>;
}

/** Read an environment variable, tolerating runtimes with no `process` (browsers, some edge). */
function getEnv(name: string): string | undefined {
  const g = globalThis as typeof globalThis & { process?: ProcessLike };
  return g.process?.env?.[name];
}

/** Resolve a usable `fetch`, preferring an injected one then the global. */
function resolveFetch(custom?: FetchLike): FetchLike | undefined {
  if (custom) return custom;
  if (typeof globalThis.fetch === "function") {
    return globalThis.fetch.bind(globalThis) as FetchLike;
  }
  return undefined;
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

/**
 * Validate options and apply defaults. Throws {@link MissingAPIKeyError} when no
 * key can be resolved, or {@link AlphaAIError} when no `fetch` is available.
 */
export function resolveConfig(options: AlphaAIOptions = {}): ResolvedConfig {
  const apiKey = options.apiKey ?? getEnv("ALPHAI_API_KEY");
  if (!apiKey) {
    throw new MissingAPIKeyError();
  }

  const fetchImpl = resolveFetch(options.fetch);
  if (!fetchImpl) {
    throw new AlphaAIError(
      "No global `fetch` found. Use Node 18+, a browser/edge runtime, or pass a custom `fetch` to `new AlphaAI({ fetch })`.",
    );
  }

  return {
    apiKey,
    baseURL: stripTrailingSlash(options.baseURL ?? DEFAULT_BASE_URL),
    timeout: options.timeout ?? 30_000,
    maxRetries: options.maxRetries ?? 2,
    backoffFactor: options.backoffFactor ?? 0.5,
    fetch: fetchImpl,
    userAgent: options.userAgent ?? `alphai-sdk-js/${VERSION}`,
  };
}
