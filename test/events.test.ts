import { describe, expect, it } from "vitest";
import {
  BadRequestError,
  CORPORATE_EVENT_TYPES,
  type CorporateEvent,
  type CorporateEventFact,
  type NewsPage,
  type RichNewsArticle,
} from "../src";
import eightkWithoutEvent from "./fixtures/eightk-article.json";
import eventArticle from "./fixtures/event-article.json";
import sortIngested400 from "./fixtures/event-type-sort-ingested-400.json";
import unknownType400 from "./fixtures/event-type-unknown-400.json";
import eventsFeed from "./fixtures/events-feed.json";
import pressArticle from "./fixtures/rich-article.json";
import { jsonResponse, makeClient, mockFetch } from "./helpers";

// Recorded API responses, assigned to the public types without a cast: if a
// type drifts from the wire (a number typed as a string, a missing nullable),
// `npm run typecheck` fails here before any test runs.
const feedPage: NewsPage = eventsFeed;
const articleWithEvent: RichNewsArticle = eventArticle;

const emptyPage = () => jsonResponse({ results: [], next_cursor: null });

function eventTypeParams(url: string): string[] {
  return new URL(url).searchParams.getAll("event_type");
}

function fact(
  event: Pick<CorporateEvent, "facts"> | null | undefined,
  name: string,
): CorporateEventFact | undefined {
  return event?.facts.find((f) => f.name === name);
}

describe("eventType filter (event_type)", () => {
  it("sends a single type", async () => {
    const fetchImpl = mockFetch(emptyPage);
    await makeClient(fetchImpl).news.list({ eventType: "buyback" });
    const url = new URL(fetchImpl.calls[0].url);
    expect(url.pathname).toBe("/api/news/");
    expect([...url.searchParams.entries()]).toEqual([["event_type", "buyback"]]);
  });

  it.each([
    ["an array", ["buyback", "dividend"], ["buyback", "dividend"]],
    ["a CSV string", "buyback, dividend ,m_and_a", ["buyback", "dividend", "m_and_a"]],
    ["a single value", "exec_change", ["exec_change"]],
  ])("serializes %s exactly as category is serialized", async (_label, value, wire) => {
    const fetchImpl = mockFetch(emptyPage);
    const client = makeClient(fetchImpl);
    await client.news.list({ eventType: value });
    await client.news.list({ category: value });
    expect(eventTypeParams(fetchImpl.calls[0].url)).toEqual(wire);
    expect(new URL(fetchImpl.calls[1].url).searchParams.getAll("category")).toEqual(wire);
  });

  it("omits event_type by default", async () => {
    const fetchImpl = mockFetch(emptyPage);
    const client = makeClient(fetchImpl);
    await client.news.list();
    await client.news.list({ symbol: "NVDA", sourceType: "sec_form8k" });
    for (const call of fetchImpl.calls) {
      expect(new URL(call.url).searchParams.has("event_type")).toBe(false);
    }
  });

  it("composes with the other feed filters", async () => {
    const fetchImpl = mockFetch(emptyPage);
    await makeClient(fetchImpl).news.list({
      eventType: ["dividend", "buyback"],
      symbol: "NVDA",
      sourceType: "sec_form8k",
      fromDate: "2026-11-01",
      minRelevance: 5,
      pageSize: 20,
    });
    const q = new URL(fetchImpl.calls[0].url).searchParams;
    expect(q.getAll("event_type")).toEqual(["dividend", "buyback"]);
    expect(q.get("symbol")).toBe("NVDA");
    expect(q.getAll("source_type")).toEqual(["sec_form8k"]);
    expect(q.get("from_date")).toBe("2026-11-01");
    expect(q.get("min_relevance")).toBe("5");
    expect(q.get("page_size")).toBe("20");
    expect(q.has("sort")).toBe(false);
  });

  it("threads the filter onto every page of iterate()", async () => {
    const fetchImpl = mockFetch((_url, _init, call) =>
      jsonResponse({ ...feedPage, next_cursor: call === 1 ? feedPage.next_cursor : null }),
    );
    const seen: RichNewsArticle[] = [];
    for await (const a of makeClient(fetchImpl).news.iterate({ eventType: "dividend,m_and_a" })) {
      seen.push(a);
    }
    expect(seen).toHaveLength(2 * feedPage.results.length);
    expect(fetchImpl.calls).toHaveLength(2);
    for (const call of fetchImpl.calls) {
      expect(eventTypeParams(call.url)).toEqual(["dividend", "m_and_a"]);
    }
    expect(new URL(fetchImpl.calls[1].url).searchParams.get("cursor")).toBe(feedPage.next_cursor);
  });
});

describe("event block on news rows", () => {
  it("types the main event of a feed row: role, stage, counterparty, facts", async () => {
    const client = makeClient(mockFetch(() => jsonResponse(feedPage)));
    const page = await client.news.list({ eventType: ["dividend", "m_and_a"] });
    const deal = page.results.find((a) => a.event?.type === "m_and_a")?.event;

    expect(deal?.stage).toBe("announced");
    expect(deal?.role).toBe("acquirer");
    expect(deal?.counterparty).toBe("80 Mile plc");
    expect(deal?.verified).toBe(true);
    expect(fact(deal, "consideration")?.value).toBe("stock");
    // The quote stays as the document words it; the number is parsed beside it.
    expect(fact(deal, "premium_pct")).toEqual({
      name: "premium_pct",
      value: "approximately 71%",
      number: 71,
      number_high: null,
      unit: "percent",
      scale: null,
    });
  });

  it("keeps a fact's quote as a string and its parsed number as a number", async () => {
    const client = makeClient(mockFetch(() => jsonResponse(feedPage)));
    const page = await client.news.list({ eventType: "dividend" });
    const dividend = page.results.find((a) => a.event?.type === "dividend")?.event;

    const amount = fact(dividend, "amount_per_share");
    expect(amount?.value).toBe("$0.19 per share");
    expect(amount?.number).toBe(0.19);
    expect(typeof amount?.number).toBe("number");
    expect(amount?.number_high).toBeNull();
    expect(amount?.unit).toBe("USD");
    expect(amount?.scale).toBeNull(); // null scale: `number` is the full figure
    expect(fact(dividend, "change_pct")?.number).toBe(11.8);
    expect(fact(dividend, "change_pct")?.unit).toBe("percent");

    // Dates and enumerated facts carry no number.
    const recordDate = fact(dividend, "record_date");
    expect(recordDate?.value).toBe("November 27, 2026");
    expect(recordDate?.number).toBeNull();
    expect(fact(dividend, "kind")?.value).toBe("increase");
    expect(dividend?.stage).toBeNull();
    expect(dividend?.counterparty).toBeNull();
    expect(dividend?.also).toEqual([]);
  });

  it("types the secondary events in `also`, the ones eventType matches too", async () => {
    const client = makeClient(mockFetch(() => jsonResponse(feedPage)));
    const page = await client.news.list({ eventType: "dividend" });

    // An earnings release that also declares a dividend: matched through `also`.
    const release = page.results.find((a) => a.event?.type === "earnings");
    expect(release?.event?.facts).toEqual([]);
    expect(release?.event?.verified).toBe(true);
    expect(release?.event?.also.map((e) => e.type)).toEqual(["dividend"]);
    expect(fact(release?.event?.also[0], "payable_date")?.value).toBe("November 23, 2026");

    // A stated multiplier travels in `scale`, the currency in `unit`.
    const deal = page.results.find((a) => a.event?.type === "m_and_a")?.event;
    expect(deal?.also[0]?.type).toBe("debt_financing");
    expect(fact(deal?.also[0], "amount")).toMatchObject({
      value: "£3 million",
      number: 3,
      unit: "GBP",
      scale: "millions",
    });
  });

  it("sits next to the filing block on an 8-K row", async () => {
    const client = makeClient(mockFetch(() => jsonResponse(feedPage)));
    const page = await client.news.list({ sourceType: "sec_form8k", eventType: "dividend" });
    for (const a of page.results) {
      expect(a.filing?.accession_number).toMatch(/^\d{10}-\d{2}-\d{6}$/);
      expect(a.event).not.toBeNull();
      expect(a.insider).toBeNull();
    }
  });

  it("carries the event on a single article, with verified: false when a fact was withheld", async () => {
    const fetchImpl = mockFetch(() => jsonResponse(articleWithEvent));
    const a = await makeClient(fetchImpl).news.get("a3bec214ddb5205c");

    expect(new URL(fetchImpl.calls[0].url).pathname).toBe("/api/news/a3bec214ddb5205c/");
    expect(a.event?.type).toBe("dividend");
    expect(a.event?.role).toBe("issuer");
    expect(a.event?.verified).toBe(false);
    expect(a.event?.facts.map((f) => f.name)).toEqual([
      "frequency",
      "kind",
      "payable_date",
      "record_date",
    ]);
    expect(a.event?.facts.every((f) => f.number === null && f.number_high === null)).toBe(true);
    expect(a.event?.also).toEqual([]);
  });

  it("carries the event on search results", async () => {
    const fetchImpl = mockFetch(() =>
      jsonResponse({
        results: feedPage.results.map((row) => ({
          ...row,
          search_match: { score: 0.91, terms_matched: null, context: null },
        })),
        count: feedPage.results.length,
        matched: feedPage.results.length,
        next_cursor: null,
        query: { mode: "strict", sort: "relevance", terms: ["dividend"] },
      }),
    );
    const page = await makeClient(fetchImpl).news.search({ query: "dividend" });

    expect(new URL(fetchImpl.calls[0].url).pathname).toBe("/api/news/search/");
    expect(page.results.map((a) => a.event?.type)).toEqual(["earnings", "dividend", "m_and_a"]);
    expect(page.results[0].search_match?.score).toBe(0.91);
  });

  it("is null or absent on rows without an event", async () => {
    const rows = [pressArticle, { ...pressArticle, event: null }, eightkWithoutEvent];
    const client = makeClient(mockFetch(() => jsonResponse({ results: rows, next_cursor: null })));
    const page = await client.news.list();

    expect(page.results[0].event).toBeUndefined(); // a press row recorded before events existed
    expect(page.results[1].event).toBeNull(); // press, Form 4, or a document not read yet
    expect(page.results[2].event).toBeUndefined();
    expect(page.results[2].filing?.items).toEqual(["1.01", "3.02", "7.01"]);
  });
});

describe("CORPORATE_EVENT_TYPES", () => {
  it("matches the allowed values the API lists in its own 400", () => {
    const message = unknownType400.extra.fields[0].msg;
    const allowed = /Allowed: (.+)$/.exec(message)?.[1].split(", ");

    expect(allowed).toHaveLength(17);
    expect([...CORPORATE_EVENT_TYPES]).toEqual(allowed);
  });

  it("covers every type in the recorded responses, main and secondary", () => {
    const known: readonly string[] = CORPORATE_EVENT_TYPES;
    const events = [...feedPage.results, articleWithEvent].map((a) => a.event);
    const seen = events.flatMap((e) => (e ? [e.type, ...e.also.map((s) => s.type)] : []));

    expect(seen.length).toBeGreaterThan(events.length);
    for (const type of seen) expect(known).toContain(type);
  });
});

describe("event_type validation errors", () => {
  it("raises BadRequestError for an unknown type, keyed by the parameter", async () => {
    const fetchImpl = mockFetch(() => jsonResponse(unknownType400, { status: 400 }));
    const err = await makeClient(fetchImpl, { maxRetries: 2 })
      .news.list({ eventType: "bogus" })
      .catch((e) => e);

    expect(err).toBeInstanceOf(BadRequestError);
    const bad = err as BadRequestError;
    expect(bad.status).toBe(400);
    expect(bad.message).toBe("Validation error");
    expect(Object.keys(bad.fields ?? {})).toEqual(["event_type"]);
    expect(bad.fields?.event_type).toHaveLength(1);
    expect(bad.fields?.event_type[0]).toContain("unknown event_type: bogus. Allowed: earnings,");
    expect(bad.allowedParams).toContain("event_type");
    expect(bad.extra).toMatchObject({ docs: "https://alphai.io/developers" });
    expect(bad.body).toEqual(unknownType400);
    expect(fetchImpl.calls).toHaveLength(1); // a 400 is never retried
  });

  it("raises BadRequestError for eventType with sort: ingested, filed under `_`", async () => {
    // The rule spans two parameters, so the API names neither: `loc` is empty.
    expect(sortIngested400.extra.fields[0].loc).toEqual([]);
    const fetchImpl = mockFetch(() => jsonResponse(sortIngested400, { status: 400 }));
    const err = await makeClient(fetchImpl, { maxRetries: 2 })
      .news.list({ eventType: "buyback", sort: "ingested" })
      .catch((e) => e);

    const q = new URL(fetchImpl.calls[0].url).searchParams;
    expect(q.getAll("event_type")).toEqual(["buyback"]);
    expect(q.get("sort")).toBe("ingested"); // sent as asked: the server is the judge

    expect(err).toBeInstanceOf(BadRequestError);
    const bad = err as BadRequestError;
    expect(bad.status).toBe(400);
    expect(bad.message).toBe("Validation error");
    expect(Object.keys(bad.fields ?? {})).toEqual(["_"]);
    expect(bad.fields?._).toHaveLength(1);
    expect(bad.fields?._[0]).toContain("event_type cannot be combined with sort=ingested");
    expect(bad.fields?._[0]).toContain("Poll sort=published with from_date");
    expect(bad.allowedParams).toContain("event_type");
    expect(fetchImpl.calls).toHaveLength(1);
  });

  it("rejects iterate() on the first page instead of yielding nothing", async () => {
    const fetchImpl = mockFetch(() => jsonResponse(sortIngested400, { status: 400 }));
    const drain = async () => {
      for await (const _ of makeClient(fetchImpl).news.iterate({
        eventType: "buyback",
        sort: "ingested",
      })) {
        // never reached
      }
    };
    await expect(drain()).rejects.toBeInstanceOf(BadRequestError);
    expect(fetchImpl.calls).toHaveLength(1);
  });
});
