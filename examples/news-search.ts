/** Run with ALPHAI_API_KEY set: npx tsx examples/news-search.ts. */
import { AlphaAI } from "alphai-sdk";

const client = new AlphaAI();
const toDate = new Date();
const fromDate = new Date(toDate.getTime() - 29 * 24 * 60 * 60 * 1000);
let cursor: string | undefined;
for (let i = 0; i < 2; i++) {
  const page = await client.news.search({
    query: "Jane Street",
    fromDate,
    toDate,
    pageSize: 20,
    cursor,
  });
  console.log(page.query.mode, page.query.note);
  console.log("Window starts:", page.query.window_from, "Bounded matches:", page.matched);
  for (const article of page.results) {
    console.log(article.original.title, article.enrichment.tickers, article.original.url);
    console.log(article.search_match?.context);
  }
  if (!page.next_cursor) break;
  cursor = page.next_cursor;
}
