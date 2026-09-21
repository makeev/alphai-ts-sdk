/** One-call watchlist overview. Run with ALPHAI_API_KEY set (npx tsx examples/watchlist-brief.ts). */
import { AlphaAI } from "alphai-sdk";

const client = new AlphaAI();
const brief = await client.news.brief({ tickers: ["NVDA", "AMD", "BTC-USD"] });
console.log("Publication window:", brief.window_start, brief.window_end);
for (const event of [...brief.events, ...brief.filings]) {
  console.log(event.matched_tickers.join(","), event.title, event.article_url);
}
for (const earnings of brief.upcoming_earnings) {
  console.log("Confirmed earnings:", earnings.ticker, earnings.report_date);
}
console.log("Unknown tickers:", brief.unknown_tickers);
console.log("Truncated news/filings:", brief.events_truncated, brief.filings_truncated);
