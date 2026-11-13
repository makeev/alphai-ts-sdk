import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BadRequestError,
  INSIDER_DECISIONS,
  INSIDER_DECISION_REASONS,
  type InsiderDecision,
  type InsiderEvent,
  type RichNewsArticle,
} from "../src";
import discretionaryFeed from "./fixtures/insider-decision-discretionary.json";
import invalidDecision400 from "./fixtures/insider-decision-invalid-400.json";
import planLikeFeed from "./fixtures/insider-decision-plan-like.json";
import unknownFeed from "./fixtures/insider-decision-unknown.json";
import insiderFeed from "./fixtures/insider-feed.json";
import { jsonResponse, makeClient, mockFetch } from "./helpers";

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
// Recorded with the label: `decision` and `decision_reason` are the last two columns.
const CSV_WITH_LABEL = fixture("insider-export-decision.csv");
// Recorded before the label: the file ends at `summary`.
const CSV_WITHOUT_LABEL = fixture("insider-export.csv");

const filteredFeeds = [
  ["discretionary", discretionaryFeed],
  ["plan_like", planLikeFeed],
  ["unknown", unknownFeed],
] as const;

// Recorded API responses. The two label fields are assigned to the public type
// without a cast: if the type drifts from the wire (a missing nullable, a closed
// union where the API sends a plain string), `npm run typecheck` fails here
// before any test runs.
const recordedLabels: Array<Pick<InsiderEvent, "decision" | "decision_reason">> = [
  ...discretionaryFeed.results,
  ...planLikeFeed.results,
  ...unknownFeed.results,
  ...insiderFeed.results,
].map((row) => row.insider);

const emptyPage = () => jsonResponse({ results: [], next_cursor: null });

function csvResponse(body: string, rows: number): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="alphai-insider-2026-11-13.csv"',
      "x-alphai-rows": String(rows),
      "x-alphai-row-cap": "500",
      "x-alphai-truncated": "false",
    },
  });
}

function label(article: RichNewsArticle): [string | undefined, unknown, unknown] {
  return [
    article.insider?.transaction_code,
    article.insider?.decision,
    article.insider?.decision_reason,
  ];
}

describe("decision filter on the insider feed", () => {
  it.each([...INSIDER_DECISIONS])("sends decision=%s", async (decision) => {
    const fetchImpl = mockFetch(emptyPage);
    await makeClient(fetchImpl).news.insider({ decision });
    const url = new URL(fetchImpl.calls[0].url);
    expect(url.pathname).toBe("/api/news/insider/");
    expect([...url.searchParams.entries()]).toEqual([["decision", decision]]);
  });

  it("omits decision by default", async () => {
    const fetchImpl = mockFetch(emptyPage);
    const client = makeClient(fetchImpl);
    await client.news.insider();
    await client.news.insider({ symbol: "NVDA", is10b5_1: false });
    for (const call of fetchImpl.calls) {
      expect(new URL(call.url).searchParams.has("decision")).toBe(false);
    }
  });

  it("combines with is10b5_1, sort: ingested and the other filters", async () => {
    const fetchImpl = mockFetch(emptyPage);
    const client = makeClient(fetchImpl);
    await client.news.insider({
      decision: "discretionary",
      is10b5_1: false,
      sort: "ingested",
      symbol: "NVDA",
      minRelevance: 6,
      pageSize: 20,
      cursor: "MjAyNi0xMS0xMw==",
    });
    await client.news.insider({
      decision: "plan_like",
      is10b5_1: true,
      fromDate: "2026-11-01",
      toDate: "2026-11-13",
    });

    const delta = new URL(fetchImpl.calls[0].url).searchParams;
    expect(delta.get("decision")).toBe("discretionary");
    expect(delta.get("is_10b5_1")).toBe("false");
    expect(delta.get("sort")).toBe("ingested");
    expect(delta.get("symbol")).toBe("NVDA");
    expect(delta.get("min_relevance")).toBe("6");
    expect(delta.get("page_size")).toBe("20");
    expect(delta.get("cursor")).toBe("MjAyNi0xMS0xMw==");

    const windowed = new URL(fetchImpl.calls[1].url).searchParams;
    expect(windowed.get("decision")).toBe("plan_like");
    expect(windowed.get("is_10b5_1")).toBe("true");
    expect(windowed.get("from_date")).toBe("2026-11-01");
    expect(windowed.get("to_date")).toBe("2026-11-13");
    expect(windowed.has("sort")).toBe(false);
  });

  it("threads the filter onto every page of iterateInsider()", async () => {
    const fetchImpl = mockFetch((_url, _init, call) =>
      jsonResponse({
        ...discretionaryFeed,
        next_cursor: call === 1 ? discretionaryFeed.next_cursor : null,
      }),
    );
    const seen: RichNewsArticle[] = [];
    for await (const a of makeClient(fetchImpl).news.iterateInsider({
      decision: "discretionary",
    })) {
      seen.push(a);
    }
    expect(seen).toHaveLength(2 * discretionaryFeed.results.length);
    expect(fetchImpl.calls).toHaveLength(2);
    for (const call of fetchImpl.calls) {
      expect(new URL(call.url).searchParams.get("decision")).toBe("discretionary");
    }
    expect(new URL(fetchImpl.calls[1].url).searchParams.get("cursor")).toBe(
      discretionaryFeed.next_cursor,
    );
  });

  it("keeps the filter while polling new filings with sort: ingested", async () => {
    // Delta mode always returns a cursor; an empty page means caught up.
    const fetchImpl = mockFetch((_url, _init, call) =>
      call === 1
        ? jsonResponse({ ...unknownFeed, next_cursor: "p1" })
        : jsonResponse({ results: [], next_cursor: "p2" }),
    );
    const seen: RichNewsArticle[] = [];
    for await (const a of makeClient(fetchImpl).news.iterateInsider({
      decision: "unknown",
      sort: "ingested",
    })) {
      seen.push(a);
    }
    expect(seen.map((a) => a.insider?.decision)).toEqual(["unknown", "unknown"]);
    expect(fetchImpl.calls).toHaveLength(2);
    for (const call of fetchImpl.calls) {
      const q = new URL(call.url).searchParams;
      expect(q.get("decision")).toBe("unknown");
      expect(q.get("sort")).toBe("ingested");
    }
  });

  it("is an insider-feed option only: news.list does not send it", async () => {
    const fetchImpl = mockFetch(emptyPage);
    await makeClient(fetchImpl).news.list({
      symbol: "NVDA",
      // @ts-expect-error `decision` is not an option of the main feed, which answers 400 for it
      decision: "discretionary",
    });
    const url = new URL(fetchImpl.calls[0].url);
    expect(url.pathname).toBe("/api/news/");
    expect([...url.searchParams.keys()]).toEqual(["symbol"]);
  });
});

describe("decision and decision_reason on the insider block", () => {
  it.each(filteredFeeds)(
    "labels every row of the %s feed with that value",
    async (decision, feed) => {
      const fetchImpl = mockFetch(() => jsonResponse(feed));
      const page = await makeClient(fetchImpl).news.insider({ decision });

      expect(new URL(fetchImpl.calls[0].url).searchParams.get("decision")).toBe(decision);
      expect(page.results).toHaveLength(2);
      for (const article of page.results) {
        expect(article.insider?.side).toBe("sell");
        expect(article.insider?.transaction_code).toBe("S");
        expect(article.insider?.decision).toBe(decision);
      }
    },
  );

  it("names what decided the label in decision_reason", async () => {
    const reasons = async (feed: unknown) => {
      const page = await makeClient(mockFetch(() => jsonResponse(feed))).news.insider();
      return page.results.map((a) => [a.insider?.is_10b5_1, a.insider?.decision_reason]);
    };

    expect(await reasons(discretionaryFeed)).toEqual([
      [false, "open_market"],
      [false, "open_market"],
    ]);
    expect(await reasons(planLikeFeed)).toEqual([
      [true, "plan_10b5_1"],
      [true, "plan_10b5_1"],
    ]);
    // Not under a 10b5-1 plan, and still not a sale the insider is known to
    // have chosen: `is10b5_1: false` is wider than `decision: "discretionary"`.
    expect(await reasons(unknownFeed)).toEqual([
      [false, "cover_ambiguous"],
      [false, "partial_vest_sale"],
    ]);
  });

  it("leaves purchases unlabelled next to labelled sales", async () => {
    const client = makeClient(mockFetch(() => jsonResponse(insiderFeed)));
    const page = await client.news.insider();

    expect(page.results.map(label)).toEqual([
      ["P", null, null],
      ["S", "discretionary", "open_market"],
      ["P", null, null],
      ["S", "discretionary", "open_market"],
    ]);
    expect(page.results.map((a) => a.insider?.side)).toEqual(["buy", "sell", "buy", "sell"]);
    // The label sits beside the fields the block already had.
    expect(page.results[1].insider).toMatchObject({
      shares: "98971",
      total_value_usd: "124103.46",
      is_10b5_1: false,
      late_filing: false,
    });
  });

  it("filters on the same field the block reports", () => {
    // The unfiltered page and the discretionary page were recorded together:
    // the second is the first without the events that hold no sale.
    const uid = (row: { original: { uid: string } }) => row.original.uid;
    const sales = insiderFeed.results.filter((row) => row.insider.decision === "discretionary");
    const unlabelled = insiderFeed.results.filter((row) => row.insider.decision === null);

    expect(sales.map(uid)).toEqual(discretionaryFeed.results.map(uid));
    expect(sales.length + unlabelled.length).toBe(insiderFeed.results.length);
    expect(unlabelled.every((row) => row.insider.transaction_code !== "S")).toBe(true);
  });

  it("carries the label on a single article", async () => {
    // The single-article lookup returns the same row shape as the feed.
    const row = planLikeFeed.results[0];
    const fetchImpl = mockFetch(() => jsonResponse(row));
    const article = await makeClient(fetchImpl).news.get(row.original.uid);

    expect(new URL(fetchImpl.calls[0].url).pathname).toBe(`/api/news/${row.original.uid}/`);
    expect(article.insider?.decision).toBe("plan_like");
    expect(article.insider?.decision_reason).toBe("plan_10b5_1");
  });

  it("tolerates a sale without a label, and a reason it does not know", async () => {
    const sale = discretionaryFeed.results[0];
    const { decision: _decision, decision_reason: _reason, ...before } = sale.insider;
    const rows = [
      { ...sale, insider: before }, // a response cached before the label existed
      { ...sale, insider: { ...sale.insider, decision: null, decision_reason: null } },
      { ...sale, insider: { ...sale.insider, decision: "unknown", decision_reason: null } },
      { ...sale, insider: { ...sale.insider, decision_reason: "a_reason_added_later" } },
    ];
    const client = makeClient(mockFetch(() => jsonResponse({ results: rows, next_cursor: null })));
    const page = await client.news.insider();

    expect(page.results[0].insider?.decision).toBeUndefined();
    expect(page.results[0].insider?.decision_reason).toBeUndefined();
    expect(label(page.results[1])).toEqual(["S", null, null]);
    expect(label(page.results[2])).toEqual(["S", "unknown", null]);
    expect(label(page.results[3])).toEqual(["S", "discretionary", "a_reason_added_later"]);

    // A reason outside the union is still a string to the compiler, so a
    // `switch` over the known reasons needs no cast, only a default branch.
    const reason = page.results[3].insider?.decision_reason;
    const known: readonly string[] = INSIDER_DECISION_REASONS;
    expect(typeof reason === "string" && !known.includes(reason)).toBe(true);
  });
});

describe("INSIDER_DECISIONS and INSIDER_DECISION_REASONS", () => {
  it("lists the decisions the API names in its own 400", () => {
    const expected = invalidDecision400.extra.fields[0].ctx.expected;
    const allowed = [...expected.matchAll(/'([^']+)'/g)].map((m) => m[1]);

    expect(allowed).toHaveLength(3);
    expect([...INSIDER_DECISIONS]).toEqual(allowed);
  });

  it("lists the twelve reasons, each once", () => {
    expect(INSIDER_DECISION_REASONS).toHaveLength(12);
    expect(new Set<string>(INSIDER_DECISION_REASONS).size).toBe(12);
    // Grouped as documented: plan_like, then discretionary, then unknown.
    expect(INSIDER_DECISION_REASONS.slice(0, 4)).toContain("tax_withholding");
    expect(INSIDER_DECISION_REASONS.slice(4, 7)).toContain("open_market");
    expect(INSIDER_DECISION_REASONS.slice(7)).toContain("cover_ambiguous");
  });

  it("covers every label in the recorded responses", () => {
    const decisions: readonly string[] = INSIDER_DECISIONS;
    const reasons: readonly string[] = INSIDER_DECISION_REASONS;
    const labelled = recordedLabels.filter((block) => block.decision != null);

    expect(recordedLabels).toHaveLength(10);
    expect(labelled).toHaveLength(8);
    for (const block of labelled) {
      expect(decisions).toContain(block.decision);
      expect(reasons).toContain(block.decision_reason);
    }
    expect(new Set(labelled.map((block) => block.decision)).size).toBe(3);
  });
});

describe("decision validation error", () => {
  // A value that reaches the SDK untyped, from user input or plain JavaScript.
  const fromUserInput = "bogus" as string as InsiderDecision;

  it("raises BadRequestError for a value outside the three, keyed by the parameter", async () => {
    const fetchImpl = mockFetch(() => jsonResponse(invalidDecision400, { status: 400 }));
    const err = await makeClient(fetchImpl, { maxRetries: 2 })
      .news.insider({ decision: fromUserInput })
      .catch((e) => e);

    expect(new URL(fetchImpl.calls[0].url).searchParams.get("decision")).toBe("bogus");
    expect(err).toBeInstanceOf(BadRequestError);
    const bad = err as BadRequestError;
    expect(bad.status).toBe(400);
    expect(bad.message).toBe("Validation error");
    expect(bad.fields).toEqual({
      decision: ["Input should be 'discretionary', 'plan_like' or 'unknown'"],
    });
    expect(bad.allowedParams).toContain("decision");
    expect(bad.allowedParams).toContain("is_10b5_1");
    expect(bad.extra).toMatchObject({ docs: "https://alphai.io/developers" });
    expect(bad.body).toEqual(invalidDecision400);
    expect(fetchImpl.calls).toHaveLength(1); // a 400 is never retried
  });

  it("rejects iterateInsider() on the first page instead of yielding nothing", async () => {
    const fetchImpl = mockFetch(() => jsonResponse(invalidDecision400, { status: 400 }));
    const drain = async () => {
      for await (const _ of makeClient(fetchImpl).news.iterateInsider({
        decision: fromUserInput,
      })) {
        // never reached
      }
    };
    await expect(drain()).rejects.toBeInstanceOf(BadRequestError);
    expect(fetchImpl.calls).toHaveLength(1);
  });

  it("raises the same 400 from the CSV export, before any row", async () => {
    const fetchImpl = mockFetch(() => jsonResponse(invalidDecision400, { status: 400 }));
    const err = await makeClient(fetchImpl)
      .news.insiderCsv({ decision: fromUserInput })
      .catch((e) => e);

    expect(err).toBeInstanceOf(BadRequestError);
    expect((err as BadRequestError).fields?.decision).toHaveLength(1);
    expect((err as BadRequestError).allowedParams).toContain("format");
  });
});

describe("insider CSV export with the sale label", () => {
  it("sends decision with the export's other filters", async () => {
    const fetchImpl = mockFetch(() => csvResponse(CSV_WITH_LABEL, 4));
    await makeClient(fetchImpl).news.insiderCsv({ decision: "discretionary", is10b5_1: false });
    const q = new URL(fetchImpl.calls[0].url).searchParams;

    expect(q.get("format")).toBe("csv");
    expect(q.get("decision")).toBe("discretionary");
    expect(q.get("is_10b5_1")).toBe("false");
    expect(q.has("page_size")).toBe(false);
  });

  it("returns the file with decision and decision_reason as the last two columns", async () => {
    const client = makeClient(mockFetch(() => csvResponse(CSV_WITH_LABEL, 4)));
    const exp = await client.news.insiderCsv();
    const lines = exp.text.trimEnd().split("\n");

    expect(exp.text).toBe(CSV_WITH_LABEL);
    expect(lines).toHaveLength(1 + (exp.rows ?? 0));
    const header = lines[0].split(",");
    expect(header).toHaveLength(24);
    expect(header.slice(-3)).toEqual(["summary", "decision", "decision_reason"]);
  });

  it("writes the block's label into the cells, empty for an event without a sale", async () => {
    const client = makeClient(mockFetch(() => csvResponse(CSV_WITH_LABEL, 4)));
    const lines = (await client.news.insiderCsv()).text.trimEnd().split("\n").slice(1);

    // The same four events as the recorded JSON page, in the same order.
    expect(lines).toHaveLength(insiderFeed.results.length);
    insiderFeed.results.forEach((row, i) => {
      const { decision, decision_reason } = row.insider;
      expect(lines[i].startsWith(`${row.original.uid},`)).toBe(true);
      expect(lines[i].endsWith(`,${decision ?? ""},${decision_reason ?? ""}`)).toBe(true);
    });
    expect(lines[0].endsWith('.",,')).toBe(true); // a purchase: both cells empty
    expect(lines[1].endsWith('.",discretionary,open_market')).toBe(true);
  });

  it("returns a file without the two columns as it is", async () => {
    const client = makeClient(mockFetch(() => csvResponse(CSV_WITHOUT_LABEL, 3)));
    const exp = await client.news.insiderCsv({ symbol: "NVDA" });
    const header = exp.text.split("\n")[0].split(",");

    expect(exp.text).toBe(CSV_WITHOUT_LABEL);
    expect(exp.rows).toBe(3);
    expect(header).toHaveLength(22);
    expect(header.at(-1)).toBe("summary");
    expect(header).not.toContain("decision");
  });
});
