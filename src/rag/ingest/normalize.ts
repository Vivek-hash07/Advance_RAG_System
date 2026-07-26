import { parseDocx } from "@/src/rag/ingest/parsers/docx";
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
  }
}

/**
 * Convert any accepted upload into a PDF that PageIndex can process.
 *
 * PDFs pass through untouched. Everything else is parsed into structured text
 * and re-rendered as a PDF, which keeps a single ingest path for all formats
 * and means citations get real page numbers regardless of the input format.
 */
export async function normalizeUpload(
  kind: FileSourceKind,
  buffer: Buffer,
  fileName: string,
): Promise<NormalizedUpload> {
  if (kind === "pdf") {
    return { pdf: buffer, pdfFileName: fileName, extractedText: null };
  }

  const text = await extractText(kind, buffer, fileName);

  if (text.trim().length === 0) {
    throw new Error(
      `No readable text found in this ${getKindLabel(kind)}. The file may be empty or corrupted.`,
    );
  }

  const pdf = await textToPdf(text, { title: titleFromFileName(fileName) });

  return {
    pdf,
    pdfFileName: toPdfFileName(fileName),
    extractedText: text,
  };
}
