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
