/** One-call activity snapshot. Run with ALPHAI_API_KEY set (npx tsx examples/radar.ts). */
import { AlphaAI } from "alphai-sdk";

const snapshot = await new AlphaAI().radar.snapshot({
  window: "24h",
  market: "us_equity",
  limit: 10,
});
console.log("Snapshot:", snapshot.snapshot_id, "as of", snapshot.as_of);
console.log("Freshness:", snapshot.freshness);
for (const reading of snapshot.results) {
  console.log(reading.ticker, reading.stories, reading.news_z, reading.sent.value);
  for (const evidence of reading.evidence) console.log(" ", evidence.title, evidence.url);
}
