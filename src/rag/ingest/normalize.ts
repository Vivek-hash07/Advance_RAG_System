import { parseDocx } from "@/src/rag/ingest/parsers/docx";
import { parseImage } from "@/src/rag/ingest/parsers/image";
import { extractPdfText } from "@/src/rag/ingest/pdf-text";
import { parsePlainText } from "@/src/rag/ingest/parsers/plain-text";
import { parseVtt } from "@/src/rag/ingest/parsers/vtt";
import { textToPdf } from "@/src/rag/ingest/text-to-pdf";
import { getKindLabel } from "@/src/rag/ingest/source-kind";
import type { FileSourceKind } from "@/src/rag/types";

export interface NormalizedUpload {
  /** A PDF, because PageIndex accepts nothing else. */
  pdf: Buffer;
  /** File name to register with PageIndex; always ends in `.pdf`. */
  pdfFileName: string;
  /** Extracted text, kept for diagnostics on conversion failures. */
  extractedText: string | null;
}

function toPdfFileName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.]+$/, "");
  const safe = withoutExtension.trim() || "document";
  return `${safe}.pdf`;
}

function titleFromFileName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
}

async function extractText(
  kind: Exclude<FileSourceKind, "pdf">,
  buffer: Buffer,
  fileName: string,
): Promise<string> {
  switch (kind) {
    case "doc": {
      if (fileName.toLowerCase().endsWith(".doc")) {
        throw new Error(
          "Legacy .doc files are not supported. Please save the file as .docx or PDF and try again.",
        );
      }
      return parseDocx(buffer);
    }
    case "text":
      return parsePlainText(buffer);
    case "vtt":
      return parseVtt(buffer);
    case "image":
      return parseImage(buffer, fileName);
  }
}

/**
 * Extract the text that will be chunked and embedded.
 *
 * PDFs are read page by page so later citations can keep a page number.
 * Every other format is parsed into structured text first.
 */
export async function extractUploadText(
  kind: FileSourceKind,
  buffer: Buffer,
  fileName: string,
): Promise<string> {
  const text =
    kind === "pdf" ? await extractPdfText(buffer) : await extractText(kind, buffer, fileName);

  if (text.trim().length === 0) {
    throw new Error(
      `No readable text found in this ${getKindLabel(kind)}. The file may be empty or corrupted.`,
    );
  }

  return text;
}

/**
 * Convert any accepted upload into a PDF.
 *
 * Kept for offline checks. Indexing itself embeds `extractUploadText` and does
 * not need the PDF.
 */
export async function normalizeUpload(
  kind: FileSourceKind,
  buffer: Buffer,
  fileName: string,
): Promise<NormalizedUpload> {
  const text = await extractUploadText(kind, buffer, fileName);

  if (kind === "pdf") {
    return { pdf: buffer, pdfFileName: fileName, extractedText: text };
  }

  const pdf = await textToPdf(text, { title: titleFromFileName(fileName) });

  return {
    pdf,
    pdfFileName: toPdfFileName(fileName),
    extractedText: text,
  };
}
