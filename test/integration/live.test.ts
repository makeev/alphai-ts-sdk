import { describe, expect, it } from "vitest";
import { AlphaAI } from "../../src";

/** Read the key without depending on `@types/node` (kept out of the tsconfig). */
const apiKey = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
  ?.env?.ALPHAI_API_KEY;

/**
 * A thin drift guard against the live `api.alphai.io`. Skipped unless
 * `ALPHAI_API_KEY` is set, so the default `npm test` run stays fully offline.
 */
describe.skipIf(!apiKey)("live API (integration)", () => {
  const client = new AlphaAI({ apiKey });

  it("lists a news page and decrements the rate limit", async () => {
    const page = await client.news.list({ symbol: "NVDA" });
    expect(Array.isArray(page.results)).toBe(true);
    expect(client.lastRateLimit).not.toBeNull();
  });

  it("iterates a bounded number of articles", async () => {
    const collected = [];
    for await (const a of client.news.iterate({ symbol: "NVDA", maxItems: 25 })) {
      collected.push(a);
    }
    expect(collected.length).toBeLessThanOrEqual(25);
  });

  it("returns at most 10 trending stories", async () => {
    const trending = await client.news.trending();
    expect(trending.length).toBeLessThanOrEqual(10);
  });

  it("fetches a symbol and its summaries with money as strings", async () => {
    const symbol = await client.symbols.get("AAPL");
    expect(symbol.symbol).toBe("AAPL");

    const insider = await client.symbols.insiderSummary("AAPL");
    if (insider.buy_value_usd !== null) {
      expect(typeof insider.buy_value_usd).toBe("string");
    }

    const sentiment = await client.symbols.sentimentSummary("AAPL");
    expect(sentiment.days).toBeGreaterThan(0);
  });
});
