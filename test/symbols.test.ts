import { describe, expect, it } from "vitest";
import insiderSummary from "./fixtures/insider-summary.json";
import sentimentSummary from "./fixtures/sentiment-summary.json";
import symbol from "./fixtures/symbol.json";
import symbols from "./fixtures/symbols.json";
import { jsonResponse, makeClient, mockFetch } from "./helpers";

describe("symbols endpoints", () => {
  it("parses the symbols list", async () => {
    const client = makeClient(mockFetch(() => jsonResponse(symbols)));

    const list = await client.symbols.list({ limit: 2 });

    expect(list).toHaveLength(2);
    expect(list[0].symbol).toBe("AAPL");
    expect(list[1].name).toBe("NVIDIA Corporation");
  });

  it("parses symbol detail including description and website", async () => {
    const client = makeClient(mockFetch(() => jsonResponse(symbol)));

    const detail = await client.symbols.get("AAPL");

    expect(detail.symbol).toBe("AAPL");
    expect(detail.website).toBe("https://www.apple.com");
    expect(detail.description).toContain("Apple");
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
});
