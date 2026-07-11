import { describe, expect, it } from "vitest";
import article from "./fixtures/rich-article.json";
import { jsonResponse, makeClient, mockFetch } from "./helpers";

describe("news endpoints", () => {
  it("parses a news page and preserves wire field names", async () => {
    const client = makeClient(
      mockFetch(() => jsonResponse({ results: [article], next_cursor: "c2" })),
    );

    const page = await client.news.list({ symbol: "NVDA" });

    expect(page.next_cursor).toBe("c2");
    expect(page.results).toHaveLength(1);
    const a = page.results[0];
    expect(a.original.uid).toBe("a1b2c3d4e5f60718");
    expect(a.enrichment.relevance_score).toBe(9);
    expect(a.enrichment.category).toBe("earnings");
    expect(a.enrichment.ai_trading_insights?.ticker_analysis[0].ticker).toBe("NVDA");
  });

  it("fetches a single article by uid", async () => {
    const fetchImpl = mockFetch(() => jsonResponse(article));
    const client = makeClient(fetchImpl);

    const a = await client.news.get("a1b2c3d4e5f60718");

    expect(new URL(fetchImpl.calls[0].url).pathname).toBe("/api/news/a1b2c3d4e5f60718/");
    expect(a.original.title).toContain("NVIDIA");
  });

  it("returns trending as a bare array", async () => {
    const client = makeClient(mockFetch(() => jsonResponse([article, article])));

    const trending = await client.news.trending();

    expect(Array.isArray(trending)).toBe(true);
    expect(trending).toHaveLength(2);
  });

  it("unwraps related results into an array", async () => {
    const fetchImpl = mockFetch(() => jsonResponse({ results: [article] }));
    const client = makeClient(fetchImpl);

    const related = await client.news.related("a1b2c3d4e5f60718");

    expect(new URL(fetchImpl.calls[0].url).pathname).toBe("/api/news/a1b2c3d4e5f60718/related/");
    expect(Array.isArray(related)).toBe(true);
    expect(related).toHaveLength(1);
  });

  it("rejects an empty uid synchronously", () => {
    const client = makeClient(mockFetch(() => jsonResponse({})));
    expect(() => client.news.get("")).toThrow(TypeError);
  });
});

describe("insider feed structured block", () => {
  const insiderItem = {
    original: { uid: "f4abc12345678901", title: "Insider sale" },
    enrichment: { category: "insider", tickers: ["CRWV"], relevance_score: 6 },
    insider: {
      side: "sell",
      transaction_code: "S",
      shares: "4000",
      avg_price_usd: "175",
      total_value_usd: "700000",
      is_10b5_1: true,
      insider_name: "STEVENS MARK A",
      insider_title: "Director",
      is_officer: false,
      is_director: true,
      is_ten_percent_owner: false,
      transaction_date: "2026-07-09",
    },
  };

  it("sends min_relevance and preserves the insider block's decimal strings", async () => {
    const fetchImpl = mockFetch(() => jsonResponse({ results: [insiderItem], next_cursor: null }));
    const client = makeClient(fetchImpl);

    const page = await client.news.insider({ symbol: "CRWV", minRelevance: 7 });

    const url = new URL(fetchImpl.calls[0].url);
    expect(url.pathname).toBe("/api/news/insider/");
    expect(url.searchParams.get("min_relevance")).toBe("7");
    const block = page.results[0].insider;
    expect(block?.side).toBe("sell");
    expect(block?.shares).toBe("4000");
    expect(block?.avg_price_usd).toBe("175");
    expect(block?.transaction_date).toBe("2026-07-09");
  });

  it("tolerates items without the insider block", async () => {
    const client = makeClient(
      mockFetch(() => jsonResponse({ results: [article], next_cursor: null })),
    );

    const page = await client.news.insider();

    expect(page.results[0].insider).toBeUndefined();
  });
});
