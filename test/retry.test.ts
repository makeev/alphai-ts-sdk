import { describe, expect, it } from "vitest";
import { AlphaAIConnectionError, ServerError } from "../src";
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
});
