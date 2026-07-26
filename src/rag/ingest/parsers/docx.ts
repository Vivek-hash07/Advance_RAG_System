import mammoth from "mammoth";

import { htmlToStructuredText } from "@/src/rag/ingest/html-to-text";

/**
 * Extract structured text from a Word document.
 *
 * Mammoth's HTML output is used rather than its raw-text output because it maps
 * Word heading styles onto `<h1>`-`<h6>`, letting us keep the document's
 * section structure through the conversion to PDF.
 *
 * Only `.docx` is supported by mammoth; legacy `.doc` binaries will throw.
 */
export async function parseDocx(buffer: Buffer): Promise<string> {
  const { value } = await mammoth.convertToHtml({ buffer });

  return htmlToStructuredText(value).replace(/\n{3,}/g, "\n\n").trim();
}
