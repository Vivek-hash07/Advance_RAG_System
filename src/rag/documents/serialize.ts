import type { DocumentRecord } from "@/src/rag/documents/repository";
import type { IngestStatus, SourceKind } from "@/src/rag/types";

/** A source as exposed to the browser. Internal PageIndex ids stay server-side. */
export interface PublicSource {
  id: string;
  name: string;
  sourceKind: SourceKind;
  status: IngestStatus;
  errorMessage: string | null;
  pageCount: number | null;
  sourceUrl: string | null;
  /** Human-readable size of the source: pages for files, videos for playlists. */
  detail: string | null;
  createdAt: string;
}

function describeSize(record: DocumentRecord): string | null {
  if (record.sourceKind === "playlist") {
    if (record.pageCount === null) return null;
    return `${record.pageCount} ${record.pageCount === 1 ? "video" : "videos"}`;
  }

  if (record.sourceKind === "youtube") {
    return "Transcript indexed";
  }

  if (record.pageCount === null) return null;
  return `${record.pageCount} ${record.pageCount === 1 ? "page" : "pages"}`;
}

export function toPublicSource(record: DocumentRecord): PublicSource {
  return {
    id: record.id,
    name: record.name,
    sourceKind: record.sourceKind,
    status: record.status,
    errorMessage: record.errorMessage,
    pageCount: record.pageCount,
    sourceUrl: record.sourceUrl,
    detail: record.status === "ready" ? describeSize(record) : null,
    createdAt: record.createdAt,
  };
}
