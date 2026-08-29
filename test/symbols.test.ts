import { describe, expect, it } from "vitest";
import earningsLatest from "./fixtures/earnings-latest.json";
import earnings from "./fixtures/earnings.json";
import insiderSummary from "./fixtures/insider-summary.json";
import sentimentSummary from "./fixtures/sentiment-summary.json";
import symbol from "./fixtures/symbol.json";
import symbols from "./fixtures/symbols.json";
import { jsonResponse, makeClient, mockFetch } from "./helpers";

describe("symbols endpoints", () => {
  it("parses the symbols list", async () => {
    const client = makeClient(mockFetch(() => jsonResponse(symbols)));

    const list = await client.symbols.list({ limit: 2 });

    expect(list).toHaveLength(4);
    expect(list[0].symbol).toBe("AAPL");
    expect(list[1].name).toBe("NVIDIA Corporation");

    // Multi-market metadata: US equities support Form 4 insider data and carry
    // no country/currency; crypto and foreign listings do the opposite.
    expect(list[0].supports_insider).toBe(true);
    expect(list[0].country).toBe("");
    const btc = list[2];
    expect(btc.asset_type).toBe("Crypto");
    expect(btc.currency).toBe("USD");
    expect(btc.supports_insider).toBe(false);
    const vod = list[3];
    expect(vod.country).toBe("GB");
    expect(vod.currency).toBe("GBP");
    expect(vod.supports_insider).toBe(false);
  });

  it("parses symbol detail including description and website", async () => {
    const client = makeClient(mockFetch(() => jsonResponse(symbol)));

    const detail = await client.symbols.get("AAPL");

    expect(detail.symbol).toBe("AAPL");
    expect(detail.website).toBe("https://www.apple.com");
    expect(detail.description).toContain("Apple");
    expect(detail.supports_insider).toBe(true);
    expect(detail.country).toBe("");
    expect(detail.tv_symbol).toBe("");
    expect(detail.next_report_date).toBe("2026-10-29");
  });

  it("parses the sentiment summary", async () => {
    const client = makeClient(mockFetch(() => jsonResponse(sentimentSummary)));

    const summary = await client.symbols.sentimentSummary("AAPL");

    expect(summary.days).toBe(7);
    expect(summary.total).toBe(42);
    expect(summary.daily[0].day).toBe("2026-06-08");
  });

  it("keeps insider money fields as decimal strings", async () => {
    const client = makeClient(mockFetch(() => jsonResponse(insiderSummary)));

    const summary = await client.symbols.insiderSummary("AAPL");

    expect(summary.days).toBe(30);
    expect(typeof summary.buy_value_usd).toBe("string");
    expect(summary.buy_value_usd).toBe("1284500.00");
    expect(typeof summary.sell_value_usd).toBe("string");
    expect(summary.top_insiders[0].net_value).toBe("-845000.00");
    expect(typeof summary.top_insiders[0].net_value).toBe("string");
  });

  it("parses a ticker's earnings history", async () => {
    const client = makeClient(mockFetch(() => jsonResponse(earnings)));

    const history = await client.symbols.earnings("AAPL");

    expect(history.ticker).toBe("AAPL");
    expect(history.reports).toHaveLength(1);
    expect(history.next_report_date).toBe("2026-10-29");

    const read = history.reports[0];
    expect(read.uid).toBe("352613cc3f6089cc");
    expect(read.source_type).toBe("sec_form8k");
    expect(read.fiscal_period).toBe("Third Quarter Fiscal 2026");

    const analysis = read.analysis;
    expect(analysis.verdict).toBe("solid");
    expect(analysis.headline).toContain("Services");
    expect(analysis.key_metrics[0].name).toBe("Revenue");
    expect(analysis.key_metrics[0].value).toBe("$95.8 billion");
    expect(analysis.segments?.[0].name).toBe("Services");
    expect(analysis.guidance?.period).toBe("Fourth Quarter Fiscal 2026");
    expect(analysis.quotes?.[0].speaker).toBe("Tim Cook");
    expect(analysis.numbers_verified_from_document).toBe(true);
  });

  it("parses an empty earnings history as a normal answer", async () => {
    const client = makeClient(
      mockFetch(() => jsonResponse({ ticker: "AAPL", reports: [], next_report_date: null })),
    );

    const history = await client.symbols.earnings("AAPL");

    expect(history.reports).toEqual([]);
    expect(history.next_report_date).toBeNull();
  });

  it("parses the latest-earnings pointer", async () => {
    const fetch = mockFetch(() => jsonResponse(earningsLatest));
    const client = makeClient(fetch);

    const pointer = await client.symbols.earningsLatest("AAPL");

    expect(pointer.uid).toBe("352613cc3f6089cc");
    expect(pointer.verdict).toBe("solid");
    expect(pointer.fiscal_period).toBe("Third Quarter Fiscal 2026");
    expect(fetch.calls[0].url).toContain("/api/symbols/AAPL/earnings/latest/");
  });
});
