import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AlphaAIError, BadRequestError, type Coverage, RateLimitError, ServerError } from "../src";
import coverage from "./fixtures/coverage.json";
import earnings from "./fixtures/earnings.json";
import eightk from "./fixtures/eightk-article.json";
import article from "./fixtures/rich-article.json";
import { jsonResponse, makeClient, mockFetch } from "./helpers";

const CSV_BODY = readFileSync(new URL("./fixtures/insider-export.csv", import.meta.url), "utf8");

function params(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

function csvResponse(
  opts: { body?: string; truncated?: string; rows?: string; nextCursor?: string } = {},
): Response {
  const headers: Record<string, string> = {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": 'attachment; filename="alphai-insider-2026-10-09.csv"',
    "x-alphai-rows": opts.rows ?? "3",
    "x-alphai-row-cap": "500",
    "x-alphai-truncated": opts.truncated ?? "false",
  };
  if (opts.nextCursor) headers["x-alphai-next-cursor"] = opts.nextCursor;
  return new Response(opts.body ?? CSV_BODY, { status: 200, headers });
}

describe("feed source filters (source_type / item)", () => {
  it("sends a single source type", async () => {
    const fetchImpl = mockFetch(() => jsonResponse({ results: [], next_cursor: null }));
    await makeClient(fetchImpl).news.list({ sourceType: "sec_form8k" });
    expect(params(fetchImpl.calls[0].url).getAll("source_type")).toEqual(["sec_form8k"]);
  });

  it("sends an array or CSV string as repeated params", async () => {
    const fetchImpl = mockFetch(() => jsonResponse({ results: [], next_cursor: null }));
    const client = makeClient(fetchImpl);
    await client.news.list({ sourceType: ["sec_form8k", "sec_form6k"] });
    await client.news.list({ sourceType: "gdelt,sec_form4" });
    expect(params(fetchImpl.calls[0].url).getAll("source_type")).toEqual([
      "sec_form8k",
      "sec_form6k",
    ]);
    expect(params(fetchImpl.calls[1].url).getAll("source_type")).toEqual(["gdelt", "sec_form4"]);
  });

  it("sends item without inventing a source type, and omits both by default", async () => {
    const fetchImpl = mockFetch(() => jsonResponse({ results: [], next_cursor: null }));
    const client = makeClient(fetchImpl);
    await client.news.list({ item: "5.02" });
    await client.news.list({ symbol: "NVDA" });
    expect(params(fetchImpl.calls[0].url).get("item")).toBe("5.02");
    expect(params(fetchImpl.calls[0].url).has("source_type")).toBe(false);
    expect(params(fetchImpl.calls[1].url).has("item")).toBe(false);
    expect(params(fetchImpl.calls[1].url).has("source_type")).toBe(false);
  });

  it("threads the filters onto every page of iterate()", async () => {
    const fetchImpl = mockFetch((_url, _init, call) =>
      jsonResponse({ results: [eightk], next_cursor: call === 1 ? "c2" : null }),
    );
    const seen = [];
    for await (const a of makeClient(fetchImpl).news.iterate({
      sourceType: "sec_form8k",
      item: "1.01",
    })) {
      seen.push(a);
    }
    expect(seen).toHaveLength(2);
    for (const call of fetchImpl.calls) {
      expect(params(call.url).getAll("source_type")).toEqual(["sec_form8k"]);
      expect(params(call.url).get("item")).toBe("1.01");
    }
    expect(params(fetchImpl.calls[1].url).get("cursor")).toBe("c2");
  });
});

describe("structured blocks on articles", () => {
  it("types the 8-K filing block", async () => {
    const client = makeClient(
      mockFetch(() => jsonResponse({ results: [eightk], next_cursor: null })),
    );
    const a = (await client.news.list({ sourceType: "sec_form8k" })).results[0];
    expect(a.filing?.items).toEqual(["1.01", "3.02", "7.01"]);
    expect(a.filing?.primary_item).toBe("1.01");
    expect(a.filing?.accession_number).toBe("0001213900-26-108077");
    expect(a.filing?.filed_at).toBe("2026-10-08T21:27:01Z"); // timestamps stay strings
    expect(a.filing?.event_date).toBeNull();
    expect(a.filing?.exhibit_url).toMatch(/ex99-1\.htm$/);
    expect(a.insider).toBeNull();
    expect(a.earnings).toBeNull();
  });

  it("carries the article-level earnings read only when present", async () => {
    const read = earnings.reports[0].analysis;
    const client = makeClient(mockFetch(() => jsonResponse({ ...article, earnings: read })));
    const a = await client.news.get("a1b2c3d4e5f60718");
    expect(a.earnings?.key_metrics.length).toBeGreaterThan(0);
    expect((article as { earnings?: unknown }).earnings).toBeUndefined();
  });

  it("surfaces symbol_note on a feed page", async () => {
    const note = "'BTC' is Grayscale Bitcoin Mini Trust ETF. Request BTC-USD for coin news.";
    const client = makeClient(
      mockFetch(() => jsonResponse({ results: [], next_cursor: null, symbol_note: note })),
    );
    expect((await client.news.list({ symbol: "BTC" })).symbol_note).toBe(note);
  });
});

describe("insider is_10b5_1 filter", () => {
  it.each([
    [false, "false"],
    [true, "true"],
  ])("sends is10b5_1=%s as %s", async (value, wire) => {
    const fetchImpl = mockFetch(() => jsonResponse({ results: [], next_cursor: null }));
    await makeClient(fetchImpl).news.insider({ symbol: "NVDA", is10b5_1: value });
    expect(params(fetchImpl.calls[0].url).get("is_10b5_1")).toBe(wire);
  });

  it("omits it by default and threads it through iterateInsider()", async () => {
    const fetchImpl = mockFetch(() => jsonResponse({ results: [], next_cursor: null }));
    const client = makeClient(fetchImpl);
    await client.news.insider();
    for await (const _ of client.news.iterateInsider({ is10b5_1: false })) {
      // empty
    }
    expect(params(fetchImpl.calls[0].url).has("is_10b5_1")).toBe(false);
    expect(params(fetchImpl.calls[1].url).get("is_10b5_1")).toBe("false");
  });
});

describe("coverage()", () => {
  it("returns the passport as wire JSON", async () => {
    const fetchImpl = mockFetch(() => jsonResponse(coverage));
    const cov: Coverage = await makeClient(fetchImpl).coverage();
    expect(new URL(fetchImpl.calls[0].url).pathname).toBe("/api/coverage/");
    expect(cov.research_only).toBe(true);
    expect(cov.sources.map((s) => s.source)).toEqual([
      "publisher_news",
      "sec_form4",
      "sec_form8k",
      "sec_form6k",
      "earnings_reads",
      "earnings_schedule",
      "economic_calendar",
    ]);
    const news = cov.sources[0];
    expect(news.archive_days).toEqual({ free: 30, basic: 90, pro: 180 });
    expect(news.channels?.map((c) => c.channel)).toEqual(["gkg", "rss"]);
    expect(cov.sources.find((s) => s.source === "earnings_reads")?.archive_days).toBeNull();
  });

  it("waits out a cold-cache 503 by its Retry-After", async () => {
    const logged: string[] = [];
    const fetchImpl = mockFetch((_url, _init, call) =>
      call === 1
        ? jsonResponse(
            { message: "busy", extra: { reason: "coverage_unavailable" } },
            { status: 503, headers: { "retry-after": "0" } },
          )
        : jsonResponse(coverage),
    );
    // A backoff this large would stall the test: only an honored Retry-After passes.
    const client = makeClient(fetchImpl, {
      maxRetries: 1,
      backoffFactor: 1000,
      logger: { warn: (m) => logged.push(m) },
    });
    expect((await client.coverage()).sources).toHaveLength(7);
    expect(fetchImpl.calls).toHaveLength(2);
    expect(logged[0]).toContain("HTTP 503 (server error) on GET /api/coverage/");
    expect(logged[0]).toContain("waiting 0.0s");
  });

  it("raises ServerError with the reason once retries are spent", async () => {
    const fetchImpl = mockFetch(() =>
      jsonResponse(
        { message: "busy", extra: { reason: "coverage_unavailable" } },
        { status: 503, headers: { "retry-after": "0" } },
      ),
    );
    const err = await makeClient(fetchImpl)
      .coverage()
      .catch((e) => e);
    expect(err).toBeInstanceOf(ServerError);
    expect((err as ServerError).extra).toMatchObject({ reason: "coverage_unavailable" });
  });
});

describe("insiderCsv()", () => {
  it("asks for CSV with the feed's filters", async () => {
    const fetchImpl = mockFetch(() => csvResponse());
    await makeClient(fetchImpl).news.insiderCsv({
      symbol: "NVDA",
      minRelevance: 6,
      is10b5_1: false,
      fromDate: "2026-09-01",
      toDate: "2026-09-30",
    });
    const call = fetchImpl.calls[0];
    const q = params(call.url);
    expect(new URL(call.url).pathname).toBe("/api/news/insider/");
    expect(q.get("format")).toBe("csv");
    expect(q.get("symbol")).toBe("NVDA");
    expect(q.get("min_relevance")).toBe("6");
    expect(q.get("is_10b5_1")).toBe("false");
    expect(q.get("from_date")).toBe("2026-09-01");
    expect(q.get("to_date")).toBe("2026-09-30");
    expect(q.has("page_size")).toBe(false);
    // format=csv next to a JSON-only Accept is a 406 on the API.
    const headers = call.init?.headers as Record<string, string>;
    expect(headers.Accept.startsWith("text/csv")).toBe(true);
  });

  it("keeps the JSON Accept on the JSON feed", async () => {
    const fetchImpl = mockFetch(() => jsonResponse({ results: [], next_cursor: null }));
    await makeClient(fetchImpl).news.insider();
    expect((fetchImpl.calls[0].init?.headers as Record<string, string>).Accept).toBe(
      "application/json",
    );
  });

  it("reads a complete file and its headers", async () => {
    const exp = await makeClient(mockFetch(() => csvResponse())).news.insiderCsv({
      symbol: "NVDA",
    });
    expect(exp.text).toBe(CSV_BODY);
    expect(exp.rows).toBe(3);
    expect(exp.row_cap).toBe(500);
    expect(exp.truncated).toBeNull();
    expect(exp.next_cursor).toBeNull();
    expect(exp.filename).toBe("alphai-insider-2026-10-09.csv");
    const lines = exp.text.trimEnd().split("\n");
    expect(lines[0].startsWith("uid,time_published,tickers,title")).toBe(true);
    expect(lines).toHaveLength(1 + (exp.rows ?? 0));
  });

  it.each(["row_cap", "archive_horizon"])(
    "reports truncated=%s with the cursor",
    async (reason) => {
      const exp = await makeClient(
        mockFetch(() => csvResponse({ truncated: reason, nextCursor: "MjAyNi0wOS0xOA==" })),
      ).news.insiderCsv();
      expect(exp.truncated).toBe(reason);
      expect(exp.next_cursor).toBe("MjAyNi0wOS0xOA==");
    },
  );

  it("maps a validation error to the JSON 400", async () => {
    const fetchImpl = mockFetch(() =>
      jsonResponse(
        {
          message: "Validation error",
          extra: { fields: { from_date: ["cannot be combined with sort=ingested"] } },
        },
        { status: 400 },
      ),
    );
    const err = await makeClient(fetchImpl)
      .news.insiderCsv({ sort: "ingested", fromDate: "2026-09-01" })
      .catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestError);
  });

  it("retries a 429 and gives up with RateLimitError", async () => {
    const throttled = () =>
      jsonResponse({ message: "throttled" }, { status: 429, headers: { "retry-after": "0" } });
    const ok = mockFetch((_u, _i, call) => (call === 1 ? throttled() : csvResponse()));
    const retried = await makeClient(ok, { maxRetries: 1, logger: null }).news.insiderCsv();
    expect(retried.rows).toBe(3);

    const err = await makeClient(mockFetch(throttled))
      .news.insiderCsv()
      .catch((e) => e);
    expect(err).toBeInstanceOf(RateLimitError);
  });

  it("rejects a non-CSV success body", async () => {
    const err = await makeClient(mockFetch(() => jsonResponse({ results: [], next_cursor: null })))
      .news.insiderCsv()
      .catch((e) => e);
    expect(err).toBeInstanceOf(AlphaAIError);
    expect((err as Error).message).toContain("text/csv");
  });

  it("leaves missing headers null", async () => {
    const res = new Response(CSV_BODY, { headers: { "content-type": "text/csv" } });
    const exp = await makeClient(mockFetch(() => res)).news.insiderCsv();
    expect([exp.rows, exp.row_cap, exp.truncated, exp.next_cursor, exp.filename]).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
  });
});
