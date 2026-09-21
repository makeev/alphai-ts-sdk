import { describe, expect, it } from "vitest";
import { ConflictError, RateLimitError, ServerError } from "../src";
import type { RadarIterateOptions, RadarSnapshotOptions } from "../src";
import brief from "./fixtures/brief.json";
import radar from "./fixtures/radar.json";
import { jsonResponse, makeClient, mockFetch } from "./helpers";

async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const item of items) result.push(item);
  return result;
}

describe("Brief", () => {
  it("serializes explicit tickers and preserves the live response shape", async () => {
    const fetch = mockFetch(() => jsonResponse(brief));
    const client = makeClient(fetch);
    const result = await client.news.brief({
      tickers: [" nvda", "AMD", "NVDA", "BTC-USD"],
      hours: 168,
      limit: 2,
    });
    expect(Object.fromEntries(new URL(fetch.calls[0].url).searchParams)).toEqual({
      tickers: "NVDA,AMD,BTC-USD",
      hours: "168",
      limit: "2",
    });
    expect(result).toEqual(brief);
    expect(result.unknown_tickers).toEqual(["SDK-UNKNOWN"]);
    expect(result.events_truncated).toBe(true);
    expect(result.filings_truncated).toBe(true);
    expect(typeof result.upcoming_earnings[0].report_date).toBe("string");
  });

  it("does not fill empty sections or invent earnings dates", async () => {
    const body = { ...brief, events: [], filings: [], upcoming_earnings: [] };
    const client = makeClient(mockFetch(() => jsonResponse(body)));
    expect(await client.news.brief({ tickers: "SDK-UNKNOWN" })).toEqual(body);
  });

  it.each([
    { tickers: [] },
    { tickers: "" },
    { tickers: "NVDA," },
    { tickers: ["X".repeat(21)] },
    { tickers: Array.from({ length: 101 }, (_, i) => `${i}`) },
    { tickers: "NVDA", hours: 0 },
    { tickers: "NVDA", hours: 169 },
    { tickers: "NVDA", limit: 21 },
    { tickers: "NVDA", limit: 1.5 },
  ])("rejects invalid bounds without a request: %j", (options) => {
    const fetch = mockFetch(() => jsonResponse(brief));
    expect(() => makeClient(fetch).news.brief(options)).toThrow();
    expect(fetch.calls).toHaveLength(0);
  });

  it("forwards cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetch = mockFetch(() => jsonResponse(brief));
    await expect(
      makeClient(fetch).news.brief({ tickers: "NVDA", signal: controller.signal }),
    ).rejects.toThrow("aborted");
    expect(fetch.calls).toHaveLength(0);
  });
});

describe("Radar", () => {
  it("serializes filters as single parameters and preserves nullable metrics", async () => {
    const body = {
      ...radar,
      results: radar.results.map((reading) => ({ ...reading, news_z: null })),
    };
    const fetch = mockFetch(() => jsonResponse(body));
    const page = await makeClient(fetch).radar.snapshot({
      window: "4h",
      scope: "market",
      market: "us_equity",
      tickers: [" nvda", "AMD", "NVDA"],
      search: "n",
      sort: "sentiment_change",
      order: "asc",
      sentiment: "mixed",
      minZ: 0,
      limit: 2,
      offset: 0,
      cursor: "opaque-signed-token",
    });
    expect(Object.fromEntries(new URL(fetch.calls[0].url).searchParams)).toEqual({
      window: "4h",
      scope: "market",
      market: "us_equity",
      tickers: "NVDA,AMD",
      search: "N",
      sort: "sentiment_change",
      order: "asc",
      sentiment: "mixed",
      min_z: "0",
      limit: "2",
      offset: "0",
      cursor: "opaque-signed-token",
    });
    expect(page.results[0].news_z).toBeNull();
    expect(page.preview_reference_at).toBeNull();
    expect(page.access.delay_seconds).toBe(3600);
    expect(page.freshness.mode).toBe("live");
    expect(typeof page.as_of).toBe("string");
  });

  it("preserves an empty saved watchlist and exact ticker selection", async () => {
    const body = {
      ...radar,
      results: [],
      total: 0,
      next_cursor: null,
      next_offset: null,
      access: { ...radar.access, scope: "watchlist", watchlist_count: 0 },
      watchlist_coverage: { no_recent_news: [], not_in_snapshot: [] },
    };
    const fetch = mockFetch(() => jsonResponse(body));
    const page = await makeClient(fetch).radar.snapshot({
      scope: "watchlist",
      ticker: " btc-usd ",
    });
    expect(page.results).toEqual([]);
    expect(page.access.watchlist_count).toBe(0);
    expect(new URL(fetch.calls[0].url).searchParams.get("ticker")).toBe("BTC-USD");
  });

  it.each([
    { tickers: [] },
    { ticker: "A", tickers: ["B"] },
    { ticker: " " },
    { offset: 1, cursor: "x" },
    { minZ: Number.NaN },
    { minZ: Number.POSITIVE_INFINITY },
    { minZ: 9 },
    { limit: 101 },
    { limit: 1.5 },
    { offset: -1 },
    { window: "1h" },
    { tickers: ["X".repeat(33)] },
    { tickers: Array.from({ length: 500 }, (_, i) => `${i}`.padStart(32, "0")) },
    { cursor: "x".repeat(4097) },
  ])("rejects invalid filters without a request: %j", (options) => {
    const fetch = mockFetch(() => jsonResponse(radar));
    expect(() => makeClient(fetch).radar.snapshot(options as RadarSnapshotOptions)).toThrow();
    expect(fetch.calls).toHaveLength(0);
  });

  it("pins filters, copies ticker arrays and drops the initial offset on subsequent pages", async () => {
    const tickers = ["NVDA", "AMD"];
    const fetch = mockFetch((_, __, call) =>
      jsonResponse({ ...radar, next_cursor: call === 1 ? "next" : null }),
    );
    const iterator = makeClient(fetch).radar.iterate({ tickers, limit: 2, offset: 1 });
    await iterator.next();
    tickers.push("TSLA");
    expect(await collect(iterator)).toHaveLength(3);
    const requests = fetch.calls.map((call) => new URL(call.url).searchParams);
    expect(requests[0].get("offset")).toBe("1");
    expect(requests[1].has("offset")).toBe(false);
    expect(requests[1].get("cursor")).toBe("next");
    for (const params of requests) {
      expect(params.get("tickers")).toBe("NVDA,AMD");
      expect(params.get("limit")).toBe("2");
    }
  });

  it("surfaces 409 without retrying or silently restarting the scan", async () => {
    const fetch = mockFetch((_, __, call) =>
      call === 1
        ? jsonResponse(radar)
        : jsonResponse({ detail: "Snapshot expired" }, { status: 409 }),
    );
    const client = makeClient(fetch, { maxRetries: 2 });
    await expect(collect(client.radar.iterate())).rejects.toBeInstanceOf(ConflictError);
    expect(fetch.calls).toHaveLength(2);
  });

  it.each([true, false])(
    "rejects snapshot switches and cursor cycles (changed=%s)",
    async (changed) => {
      const fetch = mockFetch((_, __, call) =>
        jsonResponse({
          ...radar,
          snapshot_id: changed && call > 1 ? "different" : radar.snapshot_id,
        }),
      );
      await expect(collect(makeClient(fetch).radar.iterate())).rejects.toThrow(/changed|repeated/);
    },
  );

  it.each([
    [{ maxItems: 0 }, 0, 0],
    [{ maxPages: 0 }, 0, 0],
    [{ maxItems: 1 }, 1, 1],
    [{ maxPages: 1 }, 1, 2],
  ] as [RadarIterateOptions, number, number][])(
    "honors caps: %j",
    async (options, calls, items) => {
      const fetch = mockFetch(() => jsonResponse(radar));
      expect(await collect(makeClient(fetch).radar.iterate(options))).toHaveLength(items);
      expect(fetch.calls).toHaveLength(calls);
    },
  );

  it.each([
    [503, ServerError],
    [429, RateLimitError],
  ] as const)("keeps bounded retries for %s", async (status, error) => {
    const fetch = mockFetch(() =>
      jsonResponse({ message: "Try later" }, { status, headers: { "Retry-After": "0" } }),
    );
    await expect(makeClient(fetch, { maxRetries: 2 }).radar.snapshot()).rejects.toBeInstanceOf(
      error,
    );
    expect(fetch.calls).toHaveLength(3);
  });

  it("forwards cancellation through iteration", async () => {
    const controller = new AbortController();
    const fetch = mockFetch(() => jsonResponse(radar));
    const iterator = makeClient(fetch).radar.iterate({ signal: controller.signal });
    await iterator.next();
    controller.abort();
    await expect(collect(iterator)).rejects.toThrow("aborted");
    expect(fetch.calls).toHaveLength(1);
  });
});
