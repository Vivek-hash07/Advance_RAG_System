/**
 * Decode a `.txt` / `.md` upload. Line structure is preserved so the PDF
 * renderer can keep paragraphs and headings on separate lines, which is what
 * PageIndex uses to infer document structure.
 */
export function parsePlainText(buffer: Buffer): string {
  return buffer
    .toString("utf8")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .trim();
}
