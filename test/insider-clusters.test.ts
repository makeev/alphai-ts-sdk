import { describe, expect, it } from "vitest";
import { PermissionDeniedError } from "../src";
import clusters from "./fixtures/insider-clusters.json";
import { jsonResponse, makeClient, mockFetch } from "./helpers";

const URL_ = "https://api.alphai.io/api/news/insider/clusters/";

function params(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

describe("news.insiderClusters", () => {
  it("parses clusters, buyers, filings and meta", async () => {
    const fetch = mockFetch(() => jsonResponse(clusters));
    const client = makeClient(fetch);

    const page = await client.news.insiderClusters();

    expect(fetch.calls[0].url).toBe(URL_); // no filter given: the server's defaults apply
    expect(page.results).toHaveLength(2);
    expect(page.next_cursor).toBeTruthy();

    const rapp = page.results[0];
    expect(rapp.ticker).toBe("RAPP");
    expect(rapp.cik).toBe(2012593);
    expect(rapp.pattern).toBe("open_market");
    expect(rapp.pattern_reasons).toEqual([]);
    expect(rapp.buyers).toBe(7);
    expect(rapp.buyers_total).toBe(7);
    expect(rapp.buyers_detail).toHaveLength(7);
    expect(rapp.officer_director_buyers).toBe(7);
    expect(rapp.total_usd).toBe("22023904.35");
    expect(rapp.value_partial).toBe(false);
    expect(rapp.window_start <= rapp.window_end).toBe(true);
    const lead = rapp.buyers_detail[0];
    expect(lead.role).toBe("independent");
    expect(lead.reason).toBeNull();
    expect(lead.duplicate_of).toBeNull();
    expect(lead.is_director).toBe(true);
    expect(lead.title).toBe("");
    expect(lead.usd).toBe("20359080.00");
    expect(lead.news_uids).toEqual(["f84212f3b1e73cd0"]);
    expect(rapp.buyers_detail[3].title).toBe("Chief Financial Officer");
    expect(rapp.filings_detail).toHaveLength(rapp.filings);
    expect(rapp.filings_detail[0].accession_number).toBe("0001193125-26-428018");
    expect(rapp.filings_detail[0].sec_url).toMatch(/^https:\/\/www\.sec\.gov\/Archives\/edgar\//);

    const accv = page.results[1];
    expect(accv.pattern).toBe("plan_or_offering");
    expect(accv.buyers).toBe(0);
    expect(accv.buyers_total).toBe(5);
    expect(accv.pattern_reasons).toContain("off_market_buyers");
    expect(new Set(accv.buyers_detail.map((b) => b.role))).toEqual(new Set(["plan_like"]));
    expect(new Set(accv.buyers_detail.map((b) => b.reason))).toEqual(new Set(["offering"]));

    expect(page.meta.coverage_since).toBe("2025-08-11");
    expect(page.meta.episode_gap_days).toBe(10);
    expect(page.meta.episode_max_days).toBe(30);
    expect(page.meta.research_only).toBe(true);
    expect(page.meta.point_in_time).toBe(false);
  });

  it("sends every filter under its wire name", async () => {
    const fetch = mockFetch(() => jsonResponse(clusters));
    await makeClient(fetch).news.insiderClusters({
      days: 90,
      minBuyers: 3,
      minUsd: 100_000,
      pattern: "all",
      symbol: "RAPP",
      sort: "value",
      cursor: "c1",
      pageSize: 20,
    });
    const q = params(fetch.calls[0].url);
    expect(q.get("days")).toBe("90");
    expect(q.get("min_buyers")).toBe("3");
    expect(q.get("min_usd")).toBe("100000");
    expect(q.get("pattern")).toBe("all");
    expect(q.get("symbol")).toBe("RAPP");
    expect(q.get("sort")).toBe("value");
    expect(q.get("cursor")).toBe("c1");
    expect(q.get("page_size")).toBe("20");
  });

  it("checks ranges locally before any request", () => {
    const fetch = mockFetch(() => jsonResponse(clusters));
    const client = makeClient(fetch);
    expect(() => client.news.insiderClusters({ days: 0 })).toThrow(RangeError);
    expect(() => client.news.insiderClusters({ days: 91 })).toThrow(RangeError);
    expect(() => client.news.insiderClusters({ minBuyers: 1 })).toThrow(RangeError);
    expect(() => client.news.insiderClusters({ minBuyers: 11 })).toThrow(RangeError);
    expect(() => client.news.insiderClusters({ minUsd: -1 })).toThrow(RangeError);
    expect(() => client.news.insiderClusters({ pageSize: 0 })).toThrow(RangeError);
    expect(() => client.news.insiderClusters({ pageSize: 51 })).toThrow(RangeError);
    expect(() => client.news.insiderClusters({ days: 2.5 })).toThrow(RangeError);
    expect(fetch.calls).toHaveLength(0);
  });

  it("iterates across pages, threading the filters and honoring caps", async () => {
    const last = { ...clusters, results: clusters.results.slice(0, 1), next_cursor: null };
    const fetch = mockFetch((_url, _init, call) => jsonResponse(call === 1 ? clusters : last));
    const client = makeClient(fetch);

    const tickers: string[] = [];
    for await (const cl of client.news.iterateInsiderClusters({ days: 60, sort: "buyers" })) {
      tickers.push(cl.ticker);
    }
    expect(tickers).toEqual(["RAPP", "ACCV", "RAPP"]);
    expect(params(fetch.calls[0].url).has("cursor")).toBe(false);
    expect(params(fetch.calls[1].url).get("cursor")).toBe(clusters.next_cursor);
    for (const call of fetch.calls) {
      expect(params(call.url).get("days")).toBe("60");
      expect(params(call.url).get("sort")).toBe("buyers");
    }

    const capped = makeClient(mockFetch(() => jsonResponse(clusters)));
    let n = 0;
    for await (const _ of capped.news.iterateInsiderClusters({ maxItems: 1 })) n++;
    expect(n).toBe(1);
    let m = 0;
    for await (const _ of capped.news.iterateInsiderClusters({ maxPages: 1 })) m++;
    expect(m).toBe(2);
  });

  it("surfaces the archive horizon as PermissionDeniedError", async () => {
    const fetch = mockFetch(() =>
      jsonResponse(
        {
          message: "Archive horizon exceeded.",
          extra: { reason: "archive_horizon", tier: "free", archive_days: 30 },
        },
        { status: 403 },
      ),
    );
    await expect(makeClient(fetch).news.insiderClusters({ days: 90 })).rejects.toBeInstanceOf(
      PermissionDeniedError,
    );
  });
});
