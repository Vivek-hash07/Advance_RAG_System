import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";

const PAGE_WIDTH = 595.28; // A4 at 72 dpi
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const BODY_SIZE = 11;
const LINE_HEIGHT = 15.5;
const PARAGRAPH_GAP = 8;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

/**
 * The standard PDF fonts are WinAnsi-encoded, so pdf-lib throws on characters
 * outside Latin-1. Map the punctuation that realistically shows up in
 * documents and transcripts, then drop anything still unencodable.
 */
const CHARACTER_REPLACEMENTS: Array<[RegExp, string]> = [
  [/[\u2018\u2019\u201A\u201B\u2032]/g, "'"],
  [/[\u201C\u201D\u201E\u201F\u2033]/g, '"'],
  [/[\u2013\u2014\u2015]/g, "-"],
  [/[\u2026]/g, "..."],
  [/[\u00A0\u2007\u202F]/g, " "],
  [/[\u2022\u25CF\u25AA]/g, "-"],
  [/[\u2192]/g, "->"],
  [/[\u2190]/g, "<-"],
  [/[\u2264]/g, "<="],
  [/[\u2265]/g, ">="],
  [/[\u00D7]/g, "x"],
  [/\t/g, "    "],
];

function toWinAnsi(input: string): string {
  let output = input;

  for (const [pattern, replacement] of CHARACTER_REPLACEMENTS) {
    output = output.replace(pattern, replacement);
  }

  return output.replace(/[^\x09\x0A\x20-\xFF]/g, "");
}

interface Line {
  text: string;
  size: number;
  font: PDFFont;
  gapAfter: number;
}

function wrapLine(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;

    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
    }

    // A single word wider than the column has to be broken by character.
    if (font.widthOfTextAtSize(word, size) > maxWidth) {
      let chunk = "";
      for (const char of word) {
        if (font.widthOfTextAtSize(chunk + char, size) > maxWidth) {
          lines.push(chunk);
          chunk = char;
        } else {
          chunk += char;
        }
      }
      current = chunk;
    } else {
      current = word;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

/**
 * Render normalized document text into a PDF.
 *
 * PageIndex only accepts PDFs, so every non-PDF source is converted here.
 * Markdown-style headings are drawn in bold at a larger size and paragraph
 * breaks are preserved — those visual cues are what PageIndex reads when it
 * builds the document's hierarchical tree, so keeping them intact directly
 * improves retrieval quality.
 */
export async function textToPdf(
  text: string,
  options: { title?: string } = {},
): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const body = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  if (options.title) {
    pdf.setTitle(options.title);
  }

  const lines: Line[] = [];

  if (options.title) {
    for (const wrapped of wrapLine(toWinAnsi(options.title), bold, 18, CONTENT_WIDTH)) {
      lines.push({ text: wrapped, size: 18, font: bold, gapAfter: 0 });
    }
    lines[lines.length - 1].gapAfter = PARAGRAPH_GAP * 2;
  }

  const blocks = toWinAnsi(text).split(/\n{2,}/);

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const headingMatch = trimmed.match(/^(#{1,6})\s+([\s\S]*)$/);
    const isHeading = headingMatch !== null;
    const content = isHeading ? headingMatch[2].trim() : trimmed;
    const level = isHeading ? headingMatch[1].length : 0;

    const size = isHeading ? Math.max(12, 19 - level * 1.5) : BODY_SIZE;
    const font = isHeading ? bold : body;

    // Inside a paragraph, single newlines are meaningful for transcripts and
    // lists, so each source line wraps independently.
    for (const sourceLine of content.split("\n")) {
      for (const wrapped of wrapLine(sourceLine, font, size, CONTENT_WIDTH)) {
        lines.push({ text: wrapped, size, font, gapAfter: 0 });
      }
    }

    if (lines.length > 0) {
      lines[lines.length - 1].gapAfter = isHeading
        ? PARAGRAPH_GAP
        : PARAGRAPH_GAP * 1.5;
    }
  }

  if (lines.length === 0) {
    throw new Error("Cannot build a PDF from empty text");
  }

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let cursorY = PAGE_HEIGHT - MARGIN;

  for (const line of lines) {
    const advance = Math.max(LINE_HEIGHT, line.size * 1.4);

    if (cursorY - advance < MARGIN) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      cursorY = PAGE_HEIGHT - MARGIN;
    }

    cursorY -= advance;

    if (line.text) {
      page.drawText(line.text, {
        x: MARGIN,
        y: cursorY,
        size: line.size,
        font: line.font,
      });
    }

    cursorY -= line.gapAfter;
  }

  return Buffer.from(await pdf.save());
}
