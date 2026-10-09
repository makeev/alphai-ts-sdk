import { describe, expect, it, vi } from "vitest";
import { AlphaAI, AlphaAIConnectionError, RateLimitError, ServerError } from "../src";
import { jsonResponse, makeClient, mockFetch } from "./helpers";

describe("retry policy", () => {
  it("retries a 429 then succeeds, honoring Retry-After", async () => {
    const fetchImpl = mockFetch((_url, _init, call) =>
      call === 1
        ? jsonResponse({ message: "slow down" }, { status: 429, headers: { "retry-after": "0" } })
        : jsonResponse([]),
    );
    const client = makeClient(fetchImpl, { maxRetries: 2, backoffFactor: 0 });

    await expect(client.news.trending()).resolves.toEqual([]);
    expect(fetchImpl.calls).toHaveLength(2);
  });

  it("retries a 5xx then succeeds", async () => {
    const fetchImpl = mockFetch((_url, _init, call) =>
      call === 1 ? jsonResponse({ message: "boom" }, { status: 500 }) : jsonResponse([]),
    );
    const client = makeClient(fetchImpl, { maxRetries: 2, backoffFactor: 0 });

    await expect(client.news.trending()).resolves.toEqual([]);
    expect(fetchImpl.calls).toHaveLength(2);
  });

  it("throws after exhausting retries", async () => {
    const fetchImpl = mockFetch(() => jsonResponse({ message: "boom" }, { status: 500 }));
    const client = makeClient(fetchImpl, { maxRetries: 2, backoffFactor: 0 });

    await expect(client.news.trending()).rejects.toBeInstanceOf(ServerError);
    expect(fetchImpl.calls).toHaveLength(3); // 1 initial + 2 retries
  });

  it("retries a network error then succeeds", async () => {
    const fetchImpl = mockFetch((_url, _init, call) => {
      if (call === 1) throw new TypeError("fetch failed");
      return jsonResponse([]);
    });
    const client = makeClient(fetchImpl, { maxRetries: 2, backoffFactor: 0 });

    await expect(client.news.trending()).resolves.toEqual([]);
    expect(fetchImpl.calls).toHaveLength(2);
  });

  it("wraps an exhausted network error in AlphaAIConnectionError", async () => {
    const fetchImpl = mockFetch(() => {
      throw new TypeError("fetch failed");
    });
    const client = makeClient(fetchImpl, { maxRetries: 2, backoffFactor: 0 });

    const err = await client.news.trending().catch((e) => e);
    expect(err).toBeInstanceOf(AlphaAIConnectionError);
    expect((err as Error).cause).toBeInstanceOf(TypeError);
    expect(fetchImpl.calls).toHaveLength(3);
  });

  it("does not retry when maxRetries is 0", async () => {
    const fetchImpl = mockFetch(() => jsonResponse({ message: "boom" }, { status: 500 }));
    const client = makeClient(fetchImpl, { maxRetries: 0 });

    await expect(client.news.trending()).rejects.toBeInstanceOf(ServerError);
    expect(fetchImpl.calls).toHaveLength(1);
  });

  it("caps a Retry-After above maxRetryAfter", async () => {
    const fetchImpl = mockFetch((_url, _init, call) =>
      call === 1
        ? jsonResponse(
            { message: "slow down" },
            { status: 429, headers: { "retry-after": "3600" } },
          )
        : jsonResponse([]),
    );
    const client = makeClient(fetchImpl, { maxRetries: 1, backoffFactor: 0, maxRetryAfter: 0 });

    await expect(client.news.trending()).resolves.toEqual([]);
    expect(fetchImpl.calls).toHaveLength(2);
  });
});

describe("retry wait logging", () => {
  it("logs a 429 wait with Retry-After and the daily budget", async () => {
    const logged: string[] = [];
    const fetchImpl = mockFetch((_url, _init, call) =>
      call === 1
        ? jsonResponse(
            { message: "slow down" },
            {
              status: 429,
              headers: {
                "retry-after": "0",
                "x-ratelimit-limit": "100",
                "x-ratelimit-remaining": "87",
                "x-ratelimit-reset": "1791590400",
              },
            },
          )
        : jsonResponse([]),
    );
    const client = makeClient(fetchImpl, {
      maxRetries: 2,
      logger: { warn: (m) => logged.push(m) },
    });

    await client.news.trending();

    expect(logged).toEqual([
      "alphai: HTTP 429 (rate limited) on GET /api/news/trending/; waiting 0.0s before retry 1 of 2 (Retry-After: 0s; daily budget 87/100 left)",
    ]);
  });

  it("logs every wait: 5xx and network errors too", async () => {
    const logged: string[] = [];
    const fetchImpl = mockFetch((_url, _init, call) => {
      if (call === 1) return jsonResponse({ message: "boom" }, { status: 502 });
      if (call === 2) throw new TypeError("fetch failed");
      return jsonResponse([]);
    });
    const client = makeClient(fetchImpl, {
      maxRetries: 2,
      backoffFactor: 0,
      logger: { warn: (m) => logged.push(m) },
    });

    await client.news.trending();

    expect(logged).toHaveLength(2);
    expect(logged[0]).toContain("HTTP 502 (server error) on GET /api/news/trending/");
    expect(logged[0]).toContain("retry 1 of 2");
    expect(logged[0]).not.toContain("daily budget");
    expect(logged[1]).toContain("connection error (Network request failed)");
    expect(logged[1]).toContain("retry 2 of 2");
  });

  it("logs nothing when no wait happens", async () => {
    const logged: string[] = [];
    const fetchImpl = mockFetch(() =>
      jsonResponse({ message: "slow down" }, { status: 429, headers: { "retry-after": "0" } }),
    );
    const client = makeClient(fetchImpl, {
      maxRetries: 0,
      logger: { warn: (m) => logged.push(m) },
    });

    await expect(client.news.trending()).rejects.toBeInstanceOf(RateLimitError);
    expect(logged).toEqual([]);
  });

  it("logs the capped wait, not the raw Retry-After", async () => {
    const logged: string[] = [];
    const fetchImpl = mockFetch((_url, _init, call) =>
      call === 1
        ? jsonResponse({ message: "day cap" }, { status: 429, headers: { "retry-after": "3600" } })
        : jsonResponse([]),
    );
    const client = makeClient(fetchImpl, {
      maxRetries: 1,
      maxRetryAfter: 0,
      logger: { warn: (m) => logged.push(m) },
    });

    await client.news.trending();
    expect(logged[0]).toContain("waiting 0.0s");
    expect(logged[0]).toContain("Retry-After: 3600s");
  });

  it("defaults to console.warn and is silenced by logger: null", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const throttledOnce = () =>
        mockFetch((_url, _init, call) =>
          call === 1
            ? jsonResponse(
                { message: "slow down" },
                { status: 429, headers: { "retry-after": "0" } },
              )
            : jsonResponse([]),
        );
      await new AlphaAI({ apiKey: "ak_live_test", fetch: throttledOnce() }).news.trending();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(String(spy.mock.calls[0][0])).toContain("HTTP 429 (rate limited)");

      spy.mockClear();
      await new AlphaAI({
        apiKey: "ak_live_test",
        fetch: throttledOnce(),
        logger: null,
      }).news.trending();
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

describe("a failing logger", () => {
  it("never fails the request it reports on", async () => {
    const fetchImpl = mockFetch((_url, _init, call) =>
      call === 1
        ? jsonResponse({ message: "slow down" }, { status: 429, headers: { "retry-after": "0" } })
        : jsonResponse([]),
    );
    const client = makeClient(fetchImpl, {
      maxRetries: 1,
      logger: {
        warn: () => {
          throw new Error("logger down");
        },
      },
    });
    await expect(client.news.trending()).resolves.toEqual([]);
  });
});
