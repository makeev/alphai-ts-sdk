/**
 * Auto-pagination with an async iterator. The SDK follows `next_cursor` for you
 * and stops at `maxItems`.
 *
 *   ALPHAI_API_KEY=ak_live_… npx tsx examples/paginate.ts
 */
import { AlphaAI } from "alphai-sdk";

const client = new AlphaAI();

let count = 0;
for await (const article of client.news.iterate({ symbol: "AAPL", maxItems: 50 })) {
  count++;
  console.log(`${count}. ${article.original.time_published} — ${article.original.title}`);
}

console.log(`\nIterated ${count} articles.`);
