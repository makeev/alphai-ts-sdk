import { AlphaAI } from "../src";
import type { AlphaAIOptions, FetchLike } from "../src";

export interface MockCall {
  url: string;
  init: RequestInit | undefined;
}

export type MockFetch = FetchLike & { calls: MockCall[] };

/**
 * Build a deterministic `fetch` double. `handler` receives the URL, init, and
 * the 1-based call number, and returns a `Response`. Captured calls are on
 * `.calls`.
 */
export function mockFetch(
  handler: (
    url: string,
    init: RequestInit | undefined,
    call: number,
  ) => Response | Promise<Response>,
): MockFetch {
  const calls: MockCall[] = [];
  const fn = async (input: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(input), init });
    return handler(String(input), init, calls.length);
  };
  const mock = fn as MockFetch;
  mock.calls = calls;
  return mock;
}

/** Build a JSON `Response` with optional status and extra headers. */
export function jsonResponse(
  body: unknown,
  opts: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: opts.status ?? 200,
    headers: { "content-type": "application/json", ...(opts.headers ?? {}) },
  });
}

/** Build a client wired to a mock fetch. Retries are off by default for determinism. */
export function makeClient(fetchImpl: FetchLike, options: AlphaAIOptions = {}): AlphaAI {
  return new AlphaAI({
    apiKey: "ak_live_test",
    fetch: fetchImpl,
    maxRetries: 0,
    backoffFactor: 0,
    ...options,
  });
}
