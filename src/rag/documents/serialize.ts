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
  createdAt: string;
}

export function toPublicSource(record: DocumentRecord): PublicSource {
  return {
    id: record.id,
    name: record.name,
    sourceKind: record.sourceKind,
    status: record.status,
    errorMessage: record.errorMessage,
    pageCount: record.pageCount,
    createdAt: record.createdAt,
  };
}
