import { afterEach, describe, expect, it, vi } from "vitest";
import { AlphaAI, MissingAPIKeyError } from "../src";
import type { FetchLike } from "../src";
import { jsonResponse, mockFetch } from "./helpers";

const dummyFetch: FetchLike = async () => jsonResponse({});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("config & api key resolution", () => {
  it("accepts an apiKey from options", () => {
    expect(() => new AlphaAI({ apiKey: "ak_live_x", fetch: dummyFetch })).not.toThrow();
  });

  it("reads the apiKey from ALPHAI_API_KEY", () => {
    vi.stubEnv("ALPHAI_API_KEY", "ak_live_from_env");
    expect(() => new AlphaAI({ fetch: dummyFetch })).not.toThrow();
  });

  it("throws MissingAPIKeyError when no key is available", () => {
    vi.stubEnv("ALPHAI_API_KEY", "");
    expect(() => new AlphaAI({ fetch: dummyFetch })).toThrow(MissingAPIKeyError);
  });

  it("uses a custom baseURL and userAgent", async () => {
    const fetchImpl = mockFetch(() => jsonResponse([]));
    const client = new AlphaAI({
      apiKey: "ak_live_x",
      fetch: fetchImpl,
      baseURL: "https://proxy.example.com",
      userAgent: "my-app/1.0",
    });

    await client.news.trending();

    expect(new URL(fetchImpl.calls[0].url).origin).toBe("https://proxy.example.com");
    const headers = fetchImpl.calls[0].init?.headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe("my-app/1.0");
  });
});

describe("rate-limit capture", () => {
  it("starts null and updates from response headers", async () => {
    const fetchImpl = mockFetch(() =>
      jsonResponse([], {
        headers: {
          "x-ratelimit-limit": "1000",
          "x-ratelimit-remaining": "999",
          "x-ratelimit-reset": "1700000000",
        },
      }),
    );
    const client = new AlphaAI({ apiKey: "ak_live_x", fetch: fetchImpl });

    expect(client.lastRateLimit).toBeNull();
    await client.news.trending();
    expect(client.lastRateLimit).toEqual({ limit: 1000, remaining: 999, reset: 1700000000 });
  });

  it("keeps the previous snapshot when headers are absent", async () => {
    const fetchImpl = mockFetch((_url, _init, call) =>
      call === 1
        ? jsonResponse([], {
            headers: { "x-ratelimit-limit": "1000", "x-ratelimit-remaining": "500" },
          })
        : jsonResponse([]),
    );
    const client = new AlphaAI({ apiKey: "ak_live_x", fetch: fetchImpl });

    await client.news.trending();
    await client.news.trending();
    expect(client.lastRateLimit).toEqual({ limit: 1000, remaining: 500, reset: null });
  });
});
