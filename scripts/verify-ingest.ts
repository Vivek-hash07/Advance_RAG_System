/**
 * Offline check of the ingest conversion path. Runs no network calls, so it
 * needs no API keys:  npx tsx scripts/verify-ingest.ts
 */
import { PDFDocument } from "pdf-lib";

import { htmlToStructuredText } from "../src/rag/ingest/html-to-text.ts";
import { parsePlainText } from "../src/rag/ingest/parsers/plain-text.ts";
import { parseVtt, parseVttCues } from "../src/rag/ingest/parsers/vtt.ts";
import { textToPdf } from "../src/rag/ingest/text-to-pdf.ts";
import { detectSourceKind } from "../src/rag/ingest/source-kind.ts";

const VTT = `WEBVTT

NOTE This header block should be ignored.

1
00:00:01.000 --> 00:00:04.500
<v Speaker 1>Welcome to the standup.</v>

2
00:00:04.500 --> 00:00:09.000
<v Speaker 1>We shipped the dashboard UI last week.</v>

3
00:14:32.000 --> 00:14:36.000
Speaker 2: We agreed to wire up the ingestion pipeline next.

4
00:14:36.000 --> 00:14:39.000
Speaker 2: We agreed to wire up the ingestion pipeline next.
`;

const HTML = `<h1>API Documentation</h1><p>Authentication uses session tokens.</p>
<h2>Rate limits</h2><ul><li>100 requests &amp; minute</li><li>Bursts allowed</li></ul>`;

async function main() {
  console.log("--- detectSourceKind ---");
  for (const name of ["a.pdf", "b.docx", "c.md", "d.vtt", "e.xlsx"]) {
    console.log(`${name.padEnd(8)} -> ${detectSourceKind(name, null)}`);
  }

  console.log("\n--- parseVttCues ---");
  const cues = parseVttCues(VTT);
  console.log(`${cues.length} cues`);
  console.log(cues.map((c) => `${c.start} | ${c.speaker} | ${c.text}`).join("\n"));

  console.log("\n--- parseVtt transcript ---");
  const transcript = parseVtt(Buffer.from(VTT, "utf8"));
  console.log(transcript);

  console.log("\n--- htmlToStructuredText ---");
  console.log(htmlToStructuredText(HTML));

  console.log("\n--- parsePlainText ---");
  console.log(JSON.stringify(parsePlainText(Buffer.from("\uFEFFhi\r\nthere\r\n"))));

  console.log("\n--- textToPdf ---");
  const long = Array.from(
    { length: 60 },
    (_, i) =>
      `## Section ${i + 1}\n\nParagraph ${i + 1} with “smart quotes”, an em—dash, ellipsis… and a bullet • plus a supercalifragilisticexpialidociousveryverylongunbreakabletokenhere.`,
  ).join("\n\n");

  const pdf = await textToPdf(`${transcript}\n\n${long}`, { title: "Ingest Check" });
  console.log(`pdf bytes: ${pdf.length}`);
  console.log(`starts with %PDF: ${pdf.subarray(0, 5).toString() === "%PDF-"}`);

  // Re-open the output to prove it is a readable PDF that paginated correctly.
  const reloaded = await PDFDocument.load(pdf);
  console.log(`pages: ${reloaded.getPageCount()}`);
  console.log(`title: ${reloaded.getTitle()}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
