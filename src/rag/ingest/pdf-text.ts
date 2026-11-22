import { extractText, getDocumentProxy } from "unpdf";

/** Pull per-page text out of a PDF so citations can keep page numbers. */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const extracted = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(extracted.text) ? extracted.text : [extracted.text];

  const parts = pages
    .map((page, index) => {
      const body = page.replace(/[ \t]+\n/g, "\n").trim();
      if (!body) return "";
      return `## Page ${index + 1}\n\n${body}`;
    })
    .filter(Boolean);

  if (parts.length === 0) {
    throw new Error(
      "No readable text found in this PDF. It may be a scan without a text layer.",
    );
  }

  return parts.join("\n\n");
}
