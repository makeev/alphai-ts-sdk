import { describe, expect, it } from "vitest";
import article from "./fixtures/rich-article.json";
import { jsonResponse, makeClient, mockFetch } from "./helpers";

/** Two pages: page 1 has two items and points to "c2"; page 2 has one item and ends. */
function twoPageFetch() {
  return mockFetch((_url, _init, call) =>
    call === 1
      ? jsonResponse({ results: [article, article], next_cursor: "c2" })
      : jsonResponse({ results: [article], next_cursor: null }),
  );
}

describe("pagination", () => {
  it("follows next_cursor until null and forwards the cursor", async () => {
    const fetchImpl = twoPageFetch();
    const client = makeClient(fetchImpl);

    const collected = [];
    for await (const a of client.news.iterate()) collected.push(a);

    expect(collected).toHaveLength(3);
    expect(fetchImpl.calls).toHaveLength(2);
    expect(new URL(fetchImpl.calls[0].url).searchParams.has("cursor")).toBe(false);
    expect(new URL(fetchImpl.calls[1].url).searchParams.get("cursor")).toBe("c2");
  });

  it("honors maxItems and avoids an unnecessary fetch", async () => {
    const fetchImpl = twoPageFetch();
    const client = makeClient(fetchImpl);

    const collected = [];
    for await (const a of client.news.iterate({ maxItems: 2 })) collected.push(a);

    expect(collected).toHaveLength(2);
    expect(fetchImpl.calls).toHaveLength(1);
  });

  it("honors maxPages", async () => {
    const fetchImpl = twoPageFetch();
    const client = makeClient(fetchImpl);

    const collected = [];
    for await (const a of client.news.iterate({ maxPages: 1 })) collected.push(a);

    expect(collected).toHaveLength(2);
    expect(fetchImpl.calls).toHaveLength(1);
  });

  it("forwards filters across pages and supports the insider feed", async () => {
    const fetchImpl = twoPageFetch();
    const client = makeClient(fetchImpl);

    const collected = [];
    for await (const a of client.news.iterateInsider({ symbol: "NVDA" })) collected.push(a);

    expect(collected).toHaveLength(3);
    expect(new URL(fetchImpl.calls[0].url).pathname).toBe("/api/news/insider/");
    expect(new URL(fetchImpl.calls[1].url).searchParams.get("symbol")).toBe("NVDA");
    expect(new URL(fetchImpl.calls[1].url).searchParams.get("cursor")).toBe("c2");
  });
});
