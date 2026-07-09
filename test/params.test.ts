import { describe, expect, it } from "vitest";
import { jsonResponse, makeClient, mockFetch } from "./helpers";

const emptyPage = () => jsonResponse({ results: [], next_cursor: null });

describe("query param serialization", () => {
  it("serializes a category array as repeated params", async () => {
    const fetchImpl = mockFetch(emptyPage);
    const client = makeClient(fetchImpl);

    await client.news.list({
      symbol: "NVDA",
      category: ["earnings", "insider"],
      minRelevance: 7,
      collapseStories: true,
    });

    const url = new URL(fetchImpl.calls[0].url);
    expect(url.pathname).toBe("/api/news/");
    expect(url.searchParams.getAll("category")).toEqual(["earnings", "insider"]);
    expect(url.searchParams.get("symbol")).toBe("NVDA");
    expect(url.searchParams.get("min_relevance")).toBe("7");
    expect(url.searchParams.get("collapse")).toBe("story");
  });

  it("accepts a single category", async () => {
    const fetchImpl = mockFetch(emptyPage);
    const client = makeClient(fetchImpl);

    await client.news.list({ category: "earnings" });

    const url = new URL(fetchImpl.calls[0].url);
    expect(url.searchParams.getAll("category")).toEqual(["earnings"]);
  });

  it("splits a CSV category string into repeated params", async () => {
    const fetchImpl = mockFetch(emptyPage);
    const client = makeClient(fetchImpl);

    await client.news.list({ category: "earnings, insider , crypto" });

    const url = new URL(fetchImpl.calls[0].url);
    expect(url.searchParams.getAll("category")).toEqual(["earnings", "insider", "crypto"]);
  });

  it("maps pageSize to page_size on the feed and insider routes", async () => {
    const fetchImpl = mockFetch(emptyPage);
    const client = makeClient(fetchImpl);

    await client.news.list({ pageSize: 50 });
    await client.news.insider({ pageSize: 50 });

    const feedUrl = new URL(fetchImpl.calls[0].url);
    expect(feedUrl.searchParams.get("page_size")).toBe("50");
    const insiderUrl = new URL(fetchImpl.calls[1].url);
    expect(insiderUrl.pathname).toBe("/api/news/insider/");
    expect(insiderUrl.searchParams.get("page_size")).toBe("50");
  });

  it("omits page_size when pageSize is not set", async () => {
    const fetchImpl = mockFetch(emptyPage);
    const client = makeClient(fetchImpl);

    await client.news.list({});

    const url = new URL(fetchImpl.calls[0].url);
    expect(url.searchParams.has("page_size")).toBe(false);
  });

  it("maps excludeCategories to exclude_categories", async () => {
    const fetchImpl = mockFetch(emptyPage);
    const client = makeClient(fetchImpl);

    await client.news.list({ excludeCategories: ["crypto", "other"] });

    const url = new URL(fetchImpl.calls[0].url);
    expect(url.searchParams.getAll("exclude_categories")).toEqual(["crypto", "other"]);
  });

  it("drops undefined params and omits collapse when false", async () => {
    const fetchImpl = mockFetch(emptyPage);
    const client = makeClient(fetchImpl);

    await client.news.list({ collapseStories: false });

    const url = new URL(fetchImpl.calls[0].url);
    expect(url.searchParams.has("collapse")).toBe(false);
    expect(url.searchParams.has("symbol")).toBe(false);
    expect(url.searchParams.has("min_relevance")).toBe(false);
    expect(url.searchParams.has("category")).toBe(false);
  });

  it("passes limit and offset for symbols.list", async () => {
    const fetchImpl = mockFetch(() => jsonResponse([]));
    const client = makeClient(fetchImpl);

    await client.symbols.list({ limit: 50, offset: 100 });

    const url = new URL(fetchImpl.calls[0].url);
    expect(url.pathname).toBe("/api/symbols/");
    expect(url.searchParams.get("limit")).toBe("50");
    expect(url.searchParams.get("offset")).toBe("100");
  });

  it("encodes path segments and sends the bearer token", async () => {
    const fetchImpl = mockFetch(() => jsonResponse({ symbol: "BRK.B", name: "Berkshire" }));
    const client = makeClient(fetchImpl);

    await client.symbols.get("BRK.B");

    const call = fetchImpl.calls[0];
    expect(new URL(call.url).pathname).toBe("/api/symbols/BRK.B/");
    const headers = call.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer ak_live_test");
    expect(headers.Accept).toBe("application/json");
  });
});
