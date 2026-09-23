import { describe, expect, it } from "vitest";
import {
  AlphaAIConnectionError,
  BadRequestError,
  type NewsSearchOptions,
  type NewsSearchPage,
  PermissionDeniedError,
  RateLimitError,
  ServerError,
} from "../src";
import article from "./fixtures/rich-article.json";
import { jsonResponse, makeClient, mockFetch } from "./helpers";

function page(mode: NewsSearchPage["query"]["mode"] = "strict", cursor: string | null = null) {
  const empty = mode === "no_match" || mode === "no_terms";
  const results = empty
    ? []
    : [
        {
          ...article,
          search_match: {
            score: 0.87,
            terms_matched: mode === "broadened" ? 2 : null,
            context: mode === "strict" ? null : "**Jane** **Street** coverage",
          },
        },
      ];
  return {
    results,
    count: results.length,
    matched: empty ? 0 : 24,
    next_cursor: cursor,
    query: {
      mode,
      sort: "relevance",
      terms: ["jane", "street"],
      required_terms: [],
      optional_terms: [],
      window_from: "2026-09-01T00:00:00Z",
      note: "Interpretation note.",
    },
  };
}

describe("news search", () => {
  it("honors cancellation without issuing a request", async () => {
    const fetch = mockFetch(() => jsonResponse(page()));
    const controller = new AbortController();
    controller.abort();
    await expect(
      makeClient(fetch).news.search({ query: "Jane Street", signal: controller.signal }),
    ).rejects.toBeInstanceOf(AlphaAIConnectionError);
    expect(fetch.calls).toHaveLength(0);
  });
  it.each(["strict", "broadened", "no_match", "no_terms"] as const)(
    "preserves %s interpretation",
    async (mode) => {
      const fetch = mockFetch(() => jsonResponse(page(mode)));
      const result: NewsSearchPage = await makeClient(fetch).news.search({ query: "Jane Street" });
      expect(result.query.mode).toBe(mode);
      expect(result.query.note).toBe("Interpretation note.");
      expect(result.query.window_from).toBe("2026-09-01T00:00:00Z");
      const url = new URL(fetch.calls[0].url);
      expect(url.pathname).toBe("/api/news/search/");
      expect([...url.searchParams.entries()]).toEqual([["q", "Jane Street"]]);
      if (mode === "no_match" || mode === "no_terms") {
        expect(result.results).toEqual([]);
        expect(result.matched).toBe(0);
      } else {
        expect(result.results[0].search_match?.score).toBe(0.87);
        expect(result.results[0].search_match?.terms_matched).toBe(mode === "broadened" ? 2 : null);
      }
    },
  );

  it("keeps all filters fixed when continuing with an opaque cursor", async () => {
    const fetch = mockFetch((_, __, call) =>
      jsonResponse(page("strict", call === 1 ? "opaque+/=" : null)),
    );
    const client = makeClient(fetch);
    const signal = new AbortController().signal;
    const options: NewsSearchOptions = {
      query: '"going concern" -resolved OR liquidity',
      symbol: "NVDA",
      category: ["earnings", "other"],
      sourceType: ["sec_form8k", "sec_form6k"],
      minRelevance: 4,
      collapseStories: true,
      pageSize: 20,
      fromDate: "2026-09-01",
      toDate: new Date("2026-09-23T12:00:00Z"),
      signal,
    };
    const first = await client.news.search(options);
    const second = await client.news.search({ ...options, cursor: first.next_cursor ?? undefined });
    expect(second.next_cursor).toBeNull();
    const params = new URL(fetch.calls[0].url).searchParams;
    expect(params.get("q")).toBe(options.query);
    expect(params.get("symbol")).toBe("NVDA");
    expect(params.getAll("category")).toEqual(["earnings", "other"]);
    expect(params.getAll("source_type")).toEqual(["sec_form8k", "sec_form6k"]);
    expect(params.get("min_relevance")).toBe("4");
    expect(params.get("collapse")).toBe("story");
    expect(params.get("page_size")).toBe("20");
    expect(params.get("from_date")).toBe("2026-09-01");
    expect(params.get("to_date")).toBe("2026-09-23T12:00:00.000Z");
    const continued = new URL(fetch.calls[1].url).searchParams;
    expect(continued.get("cursor")).toBe("opaque+/=");
    continued.delete("cursor");
    expect([...continued.entries()]).toEqual([...params.entries()]);
    expect(fetch.calls[0].init?.signal).toBeDefined();
  });

  it("sends item and a single source with a bare end date", async () => {
    const fetch = mockFetch(() => jsonResponse(page()));
    await makeClient(fetch).news.search({
      query: "chief executive",
      item: "5.02",
      sourceType: "sec_form8k",
      toDate: "2026-09-23",
    });
    const params = new URL(fetch.calls[0].url).searchParams;
    expect(params.get("item")).toBe("5.02");
    expect(params.getAll("source_type")).toEqual(["sec_form8k"]);
    expect(params.get("to_date")).toBe("2026-09-23");
    expect(params.has("collapse")).toBe(false);
    expect(params.has("sort")).toBe(false);
  });

  it.each([
    [400, BadRequestError, "invalid_cursor"],
    [403, PermissionDeniedError, "archive_horizon"],
    [429, RateLimitError, "rate_limited"],
    [503, ServerError, "search_unavailable"],
  ] as const)(
    "surfaces HTTP %s rather than an empty result",
    async (status, ErrorClass, reason) => {
      const fetch = mockFetch(() =>
        jsonResponse({ message: "Search failed", extra: { reason } }, { status }),
      );
      const promise = makeClient(fetch).news.search({ query: "Jane Street", cursor: "invalid" });
      await expect(promise).rejects.toBeInstanceOf(ErrorClass);
      await expect(promise).rejects.toHaveProperty("extra.reason", reason);
      expect(fetch.calls).toHaveLength(1);
    },
  );
});
