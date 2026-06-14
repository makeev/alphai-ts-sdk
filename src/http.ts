import type { ResolvedConfig } from "./config";
import { AlphaAIConnectionError, AlphaAIError, createAPIError } from "./errors";
import type { RateLimit } from "./models/types";

/** A query parameter value. Arrays are serialized as repeated params. */
export type QueryValue = string | number | boolean | Array<string | number> | null | undefined;
export type QueryParams = Record<string, QueryValue>;

export interface RequestConfig {
  query?: QueryParams;
  signal?: AbortSignal;
}

/**
 * Thin `fetch` wrapper: builds URLs and headers, captures rate-limit headers,
 * retries idempotent GETs on 429/5xx/network errors with exponential backoff,
 * and maps non-2xx responses to typed errors.
 */
export class HttpClient {
  /** Rate-limit snapshot from the most recent response carrying the headers. */
  lastRateLimit: RateLimit | null = null;

  private readonly cfg: ResolvedConfig;

  constructor(cfg: ResolvedConfig) {
    this.cfg = cfg;
  }

  async request<T>(path: string, config: RequestConfig = {}): Promise<T> {
    const url = buildURL(this.cfg.baseURL, path, config.query);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.cfg.apiKey}`,
      Accept: "application/json",
      "User-Agent": this.cfg.userAgent,
    };
    const { fetch: fetchImpl, maxRetries, timeout, backoffFactor } = this.cfg;
    const userSignal = config.signal;

    let attempt = 0;
    while (true) {
      if (userSignal?.aborted) {
        throw new AlphaAIConnectionError("Request aborted", { cause: userSignal.reason });
      }

      const timeoutController = new AbortController();
      const state = { timedOut: false };
      const timer = setTimeout(() => {
        state.timedOut = true;
        timeoutController.abort();
      }, timeout);
      const signal = combineSignals(timeoutController.signal, userSignal);

      let response: Response;
      try {
        response = await fetchImpl(url, { method: "GET", headers, signal });
      } catch (err) {
        clearTimeout(timer);
        // A user-initiated abort is final — never retry it.
        if (userSignal?.aborted) {
          throw new AlphaAIConnectionError("Request aborted", { cause: userSignal.reason });
        }
        if (attempt < maxRetries) {
          await sleep(backoffDelay(attempt, backoffFactor));
          attempt++;
          continue;
        }
        const reason = state.timedOut
          ? `Request timed out after ${timeout}ms`
          : "Network request failed";
        throw new AlphaAIConnectionError(reason, { cause: err });
      }
      clearTimeout(timer);

      const rateLimit = parseRateLimit(response.headers);
      if (rateLimit) this.lastRateLimit = rateLimit;

      if (response.ok) {
        return (await parseBody(response)) as T;
      }

      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < maxRetries) {
        const retryAfter = parseRetryAfter(response.headers);
        const delay =
          response.status === 429 && retryAfter !== null
            ? retryAfter * 1000
            : backoffDelay(attempt, backoffFactor);
        drain(response);
        await sleep(delay);
        attempt++;
        continue;
      }

      throw await buildError(response, rateLimit);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildURL(baseURL: string, path: string, query?: QueryParams): string {
  const base = baseURL.endsWith("/") ? baseURL : `${baseURL}/`;
  const rel = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(rel, base);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item === undefined || item === null) continue;
          url.searchParams.append(key, String(item));
        }
      } else {
        url.searchParams.append(key, String(value));
      }
    }
  }

  return url.toString();
}

function toInt(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseRateLimit(headers: Headers): RateLimit | null {
  const limit = toInt(headers.get("x-ratelimit-limit"));
  const remaining = toInt(headers.get("x-ratelimit-remaining"));
  const reset = toInt(headers.get("x-ratelimit-reset"));
  if (limit === null && remaining === null && reset === null) return null;
  return { limit, remaining, reset };
}

function parseRetryAfter(headers: Headers): number | null {
  const raw = headers.get("retry-after");
  if (raw === null) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, seconds);
  const date = Date.parse(raw);
  if (!Number.isNaN(date)) return Math.max(0, (date - Date.now()) / 1000);
  return null;
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new AlphaAIError("Failed to parse response body as JSON", { cause: err });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickMessage(parsed: unknown, text: string, response: Response): string {
  if (isRecord(parsed)) {
    if (typeof parsed.message === "string" && parsed.message) return parsed.message;
    if (typeof parsed.detail === "string" && parsed.detail) return parsed.detail;
  }
  if (text) return text;
  if (response.statusText) return response.statusText;
  return `HTTP ${response.status}`;
}

async function buildError(response: Response, rateLimit: RateLimit | null) {
  let text = "";
  try {
    text = await response.text();
  } catch {
    text = "";
  }
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = undefined;
  }

  return createAPIError({
    status: response.status,
    message: pickMessage(parsed, text, response),
    body: parsed ?? (text || undefined),
    extra: isRecord(parsed) ? parsed.extra : undefined,
    retryAfter: parseRetryAfter(response.headers),
    limit: rateLimit?.limit ?? null,
    remaining: rateLimit?.remaining ?? null,
    reset: rateLimit?.reset ?? null,
  });
}

/** Discard an unread response body so the socket can be reused before a retry. */
function drain(response: Response): void {
  const body = response.body;
  if (body) {
    void body.cancel().catch(() => {});
  }
}

/** Combine the timeout signal with an optional user signal (Node 18 compatible). */
function combineSignals(primary: AbortSignal, secondary?: AbortSignal): AbortSignal {
  if (!secondary) return primary;
  const controller = new AbortController();
  if (primary.aborted) {
    controller.abort(primary.reason);
    return controller.signal;
  }
  if (secondary.aborted) {
    controller.abort(secondary.reason);
    return controller.signal;
  }
  primary.addEventListener("abort", () => controller.abort(primary.reason), { once: true });
  secondary.addEventListener("abort", () => controller.abort(secondary.reason), { once: true });
  return controller.signal;
}

/** Exponential backoff with full jitter, in milliseconds. */
function backoffDelay(attempt: number, backoffFactor: number): number {
  const base = backoffFactor * 2 ** attempt; // seconds
  return Math.random() * base * 1000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
