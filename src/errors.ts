/**
 * Error hierarchy thrown by the SDK.
 *
 * ```
 * AlphaAIError                         base
 * ├── AlphaAIConnectionError           network / timeout / abort
 * ├── AlphaAIAPIError                  any non-2xx response
 * │   ├── BadRequestError      (400)   .fields / .allowedParams for validation errors
 * │   ├── AuthenticationError  (401)
 * │   ├── PermissionDeniedError(403)
 * │   ├── NotFoundError        (404)
 * │   ├── RateLimitError       (429)   .retryAfter / .limit / .remaining / .reset
 * │   └── ServerError          (>=500)
 * └── MissingAPIKeyError               no apiKey and no ALPHAI_API_KEY
 * ```
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Base class for every error thrown by the SDK. */
export class AlphaAIError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AlphaAIError";
    // Restore the prototype chain so `instanceof` works across all build targets.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** A network failure, timeout, or aborted request (wraps the underlying error as `cause`). */
export class AlphaAIConnectionError extends AlphaAIError {
  constructor(message = "Connection error", options?: ErrorOptions) {
    super(message, options);
    this.name = "AlphaAIConnectionError";
  }
}

/** Thrown when no API key is provided and `ALPHAI_API_KEY` is not set. */
export class MissingAPIKeyError extends AlphaAIError {
  constructor(
    message = "Missing AlphaAI API key. Pass `{ apiKey }` to `new AlphaAI(...)` or set the ALPHAI_API_KEY environment variable. Create a key at https://alphai.io/account/api-keys.",
  ) {
    super(message);
    this.name = "MissingAPIKeyError";
  }
}

/** Fields used to construct an {@link AlphaAIAPIError}. */
export interface APIErrorArgs {
  status: number;
  message: string;
  /** Parsed JSON body, or the raw text when the body was not JSON. */
  body?: unknown;
  /** The `extra` object from the error envelope, if present. */
  extra?: unknown;
  retryAfter?: number | null;
  limit?: number | null;
  remaining?: number | null;
  reset?: number | null;
}

/** Base class for any non-2xx API response. */
export class AlphaAIAPIError extends AlphaAIError {
  /** HTTP status code. */
  readonly status: number;
  /** Parsed JSON body, or raw text when the body was not JSON. */
  readonly body: unknown;
  /** The `extra` object from the error envelope, if present. */
  readonly extra: unknown;

  constructor(args: APIErrorArgs) {
    super(args.message);
    this.name = "AlphaAIAPIError";
    this.status = args.status;
    this.body = args.body;
    this.extra = args.extra;
  }
}

/**
 * 400 — bad request. For validation errors, {@link BadRequestError.fields} holds
 * per-field messages and {@link BadRequestError.allowedParams} the endpoint's full
 * parameter vocabulary.
 *
 * A cursor is never rejected for age — the tokens carry no expiry. An unreadable
 * one was constructed or truncated rather than taken from a previous response's
 * `next_cursor`.
 */
export class BadRequestError extends AlphaAIAPIError {
  /**
   * Per-field validation messages from `extra.fields`, when present.
   *
   * The API sends that key in two shapes, both normalised here:
   * an **array** of validator entries (`{loc: ["skip"], msg: …}`) for an unknown
   * or ill-typed query parameter — the common case — and a **record** of
   * `{field: messages}` for a field rejected inside a view (a malformed `cursor`).
   * Releases before 0.4.1 understood only the record, so the array shape left
   * `fields` undefined.
   */
  readonly fields?: Record<string, string[]>;

  /**
   * Every query parameter this endpoint accepts, sent when the 400 was caused by
   * an unknown one. Undefined for 400s from anywhere else — never guessed.
   */
  readonly allowedParams?: string[];

  constructor(args: APIErrorArgs) {
    super(args);
    this.name = "BadRequestError";
    if (isRecord(args.extra)) {
      const raw = args.extra.fields;
      if (isRecord(raw)) {
        this.fields = raw as Record<string, string[]>;
      } else if (Array.isArray(raw)) {
        const normalised: Record<string, string[]> = {};
        for (const entry of raw) {
          if (!isRecord(entry)) continue;
          const loc = entry.loc;
          const key = Array.isArray(loc) ? loc.map(String).join(".") : "_";
          const messages = normalised[key] ?? [];
          messages.push(String(entry.msg ?? ""));
          normalised[key] = messages;
        }
        this.fields = normalised;
      }
      const allowed = args.extra.allowed_params;
      if (Array.isArray(allowed)) {
        this.allowedParams = allowed.map(String);
      }
    }
  }
}

/** 401 — the API key is missing or invalid. */
export class AuthenticationError extends AlphaAIAPIError {
  constructor(args: APIErrorArgs) {
    super(args);
    this.name = "AuthenticationError";
  }
}

/** 403 — the key is valid but not permitted to access the resource. */
export class PermissionDeniedError extends AlphaAIAPIError {
  constructor(args: APIErrorArgs) {
    super(args);
    this.name = "PermissionDeniedError";
  }
}

/** 404 — the resource does not exist. */
export class NotFoundError extends AlphaAIAPIError {
  constructor(args: APIErrorArgs) {
    super(args);
    this.name = "NotFoundError";
  }
}

/** 429 — rate limit exceeded. */
export class RateLimitError extends AlphaAIAPIError {
  /** Seconds to wait before retrying, from the `Retry-After` header. */
  readonly retryAfter: number | null;
  readonly limit: number | null;
  readonly remaining: number | null;
  readonly reset: number | null;

  constructor(args: APIErrorArgs) {
    super(args);
    this.name = "RateLimitError";
    this.retryAfter = args.retryAfter ?? null;
    this.limit = args.limit ?? null;
    this.remaining = args.remaining ?? null;
    this.reset = args.reset ?? null;
  }
}

/** 5xx — the server failed to fulfil a valid request. */
export class ServerError extends AlphaAIAPIError {
  constructor(args: APIErrorArgs) {
    super(args);
    this.name = "ServerError";
  }
}

/** Map an HTTP status code to the most specific {@link AlphaAIAPIError} subclass. */
export function createAPIError(args: APIErrorArgs): AlphaAIAPIError {
  switch (args.status) {
    case 400:
      return new BadRequestError(args);
    case 401:
      return new AuthenticationError(args);
    case 403:
      return new PermissionDeniedError(args);
    case 404:
      return new NotFoundError(args);
    case 429:
      return new RateLimitError(args);
    default:
      if (args.status >= 500) return new ServerError(args);
      return new AlphaAIAPIError(args);
  }
}
