/**
 * Offline webpage scrape check — Scrapling only, no PageIndex submit.
 *
 *   npm run verify:webpage
 *   npm run verify:webpage -- https://example.com
 */
import { assertSafePublicUrl } from "../src/rag/ingest/ssrf.ts";
import { scrapeWebpage } from "../src/rag/ingest/webpage.ts";

const url = process.argv[2] ?? "https://example.com";

async function main() {
  console.log(`SSRF check: ${url}`);
  const safe = await assertSafePublicUrl(url);
  console.log(`  ok → ${safe.href}`);

  console.log("Scrapling fetch + PDF render (no PageIndex)...");
  const { scraped, pdf } = await scrapeWebpage(url);
  console.log(`  title: ${scraped.title}`);
  console.log(`  finalUrl: ${scraped.finalUrl}`);
  console.log(`  text chars: ${scraped.text.length}`);
  console.log(`  pdf bytes: ${pdf.length}`);
  console.log("PASS");
}

main().catch((error) => {
  console.error("FAIL", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
