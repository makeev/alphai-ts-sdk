/**
 * A small "ticker dashboard" that composes several real endpoints in parallel:
 * symbol detail, 7-day sentiment, 30-day insider activity, and recent news.
 *
 *   ALPHAI_API_KEY=ak_live_… npx tsx examples/ticker-dashboard.ts
 */
import { AlphaAI } from "alphai-sdk";

const ticker = "AAPL"; // change me
const client = new AlphaAI();

const [detail, sentiment, insider, news] = await Promise.all([
  client.symbols.get(ticker),
  client.symbols.sentimentSummary(ticker),
  client.symbols.insiderSummary(ticker),
  client.news.list({ symbol: ticker, minRelevance: 7 }),
]);

console.log(`# ${detail.name} (${detail.symbol}) — ${detail.exchange ?? "n/a"}`);
console.log(`Sector: ${detail.sector ?? "n/a"} / ${detail.industry ?? "n/a"}`);

console.log(
  `\n7-day sentiment: ${sentiment.bullish} bullish · ${sentiment.neutral} neutral · ` +
    `${sentiment.bearish} bearish (n=${sentiment.total})`,
);

console.log(
  `30-day insider: buys $${insider.buy_value_usd ?? "0"} / sells $${insider.sell_value_usd ?? "0"} ` +
    `(${insider.pct_10b5_1}% under 10b5-1 plans)`,
);

console.log("\nTop recent articles:");
for (const article of news.results.slice(0, 5)) {
  console.log(`  [${article.enrichment.relevance_score}] ${article.original.title}`);
}
