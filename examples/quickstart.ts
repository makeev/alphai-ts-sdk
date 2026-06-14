/**
 * Quickstart: fetch the latest high-relevance news for a ticker.
 *
 * Run with a key in the environment:
 *   ALPHAI_API_KEY=ak_live_… npx tsx examples/quickstart.ts
 */
import { AlphaAI } from "alphai-sdk";

const client = new AlphaAI(); // reads ALPHAI_API_KEY from the environment

const page = await client.news.list({ symbol: "NVDA", minRelevance: 7 });

console.log(`Fetched ${page.results.length} articles for NVDA:\n`);
for (const article of page.results) {
  const { relevance_score, category } = article.enrichment;
  console.log(`[${relevance_score}] (${category}) ${article.original.title}`);
}

console.log("\nRate limit:", client.lastRateLimit);
