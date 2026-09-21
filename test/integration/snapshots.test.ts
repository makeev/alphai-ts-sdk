import { describe, expect, it } from "vitest";
import { AlphaAI, ConflictError } from "../../src";

const apiKey = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
  ?.env?.ALPHAI_API_KEY;

describe.skipIf(!apiKey)("live Brief/Radar contract", () => {
  it("reads a Brief and follows a pinned Radar snapshot", async () => {
    const client = new AlphaAI({ apiKey, maxRetries: 0 });
    const brief = await client.news.brief({
      tickers: ["NVDA", "BTC-USD", "SDK-UNKNOWN"],
      hours: 168,
      limit: 2,
    });
    expect(brief.unknown_tickers).toEqual(["SDK-UNKNOWN"]);
    expect(brief.tickers).toContain("NVDA");
    expect(brief.events.length).toBeLessThanOrEqual(2);
    expect(brief.filings.length).toBeLessThanOrEqual(2);
    const page = await client.radar.snapshot({ limit: 2 });
    expect(page.freshness.mode).toBe("live");
    expect(page.freshness.effective_delay_seconds).toBeGreaterThanOrEqual(
      page.access.delay_seconds,
    );
    if (page.next_cursor) {
      const second = await client.radar.snapshot({ limit: 2, cursor: page.next_cursor });
      expect(second.snapshot_id).toBe(page.snapshot_id);
      expect(second.as_of).toBe(page.as_of);
      expect(second.offset).toBe(2);
      await expect(
        client.radar.snapshot({ limit: 3, cursor: page.next_cursor }),
      ).rejects.toBeInstanceOf(ConflictError);
    }
    const saved = await client.radar.snapshot({ scope: "watchlist", limit: 2 });
    expect(saved.access.scope).toBe("watchlist");
    expect(saved.watchlist_coverage).not.toBeNull();
    if (saved.access.watchlist_count === 0) expect(saved.results).toEqual([]);
  });
});
