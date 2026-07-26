import { ragConfig } from "@/src/rag/config";
import * as repository from "@/src/rag/documents/repository";
import type { DocumentRecord } from "@/src/rag/documents/repository";
import { normalizeUpload } from "@/src/rag/ingest/normalize";
import { detectSourceKind, ACCEPTED_EXTENSIONS } from "@/src/rag/ingest/source-kind";
import {
  deletePageIndexDocument,
  fetchTree,
  submitPdf,
  type TreeState,
} from "@/src/rag/pageindex/documents";
import { flattenTree } from "@/src/rag/pageindex/tree";

export class IngestError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = "IngestError";
  }
}

/**
 * Ingest an uploaded file: validate it, convert it to PDF if needed, hand it to
 * PageIndex for tree generation, and record it against the user.
 *
 * Returns as soon as PageIndex accepts the document — tree generation is
 * asynchronous, so the caller polls `syncDocument` for readiness.
 */
export async function ingestUpload(
  userId: string,
  file: File,
): Promise<DocumentRecord> {
  if (file.size === 0) {
    throw new IngestError("The uploaded file is empty.");
  }

  if (file.size > ragConfig.ingest.maxFileBytes) {
    const limitMb = Math.floor(ragConfig.ingest.maxFileBytes / (1024 * 1024));
    throw new IngestError(`File is too large. The limit is ${limitMb} MB.`);
  }

  const sourceKind = detectSourceKind(file.name, file.type);
  if (!sourceKind) {
    throw new IngestError(
      `Unsupported file type. Accepted formats: ${ACCEPTED_EXTENSIONS.join(", ")}.`,
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let normalized;
  try {
    normalized = await normalizeUpload(sourceKind, buffer, file.name);
  } catch (error) {
    throw new IngestError(
      error instanceof Error ? error.message : "Failed to read the uploaded file.",
    );
  }

  const pageIndexDocId = await submitPdf(normalized.pdf, normalized.pdfFileName);

  return repository.createDocument({
    userId,
    name: file.name,
    sourceKind,
    pageIndexDocId,
  });
}

/**
 * Refresh a document's ingest status from PageIndex. Once processing completes
 * the flattened tree is cached locally so retrieval never has to refetch it.
 */
export async function syncDocument(
  document: DocumentRecord,
): Promise<DocumentRecord> {
  if (document.status === "ready" && document.hasTree) {
    return document;
  }

  if (document.status === "failed") {
    return document;
  }

  let state: TreeState;
  try {
    state = await fetchTree(document.pageIndexDocId);
  } catch (error) {
    // Rate limits and transient network faults must not condemn the document.
    // Leave it pending so the next poll retries.
    console.warn(`[rag] Could not refresh document ${document.id}:`, error);
    return document;
  }

  if (state.status === "failed") {
    return repository.updateDocumentStatus(document.id, {
      status: "failed",
      errorMessage: "PageIndex could not process this document.",
    });
  }

  if (state.status !== "ready" || !state.tree) {
    // PageIndex can report completion a moment before the tree is retrievable,
    // so hold the document at "processing" until the tree actually arrives.
    const status = state.status === "ready" ? "processing" : state.status;

    return status === document.status
      ? document
      : repository.updateDocumentStatus(document.id, {
          status,
          errorMessage: null,
        });
  }

  const nodes = flattenTree(state.tree);

  if (nodes.length === 0) {
    return repository.updateDocumentStatus(document.id, {
      status: "failed",
      errorMessage: "PageIndex returned an empty document structure.",
    });
  }

  const pages = nodes
    .map((node) => node.pageIndex)
    .filter((page): page is number => page !== null);

  return repository.updateDocumentStatus(document.id, {
    status: "ready",
    errorMessage: null,
    pageCount: pages.length > 0 ? Math.max(...pages) : null,
    nodes,
  });
}

export async function listUserDocuments(
  userId: string,
): Promise<DocumentRecord[]> {
  const documents = await repository.listDocuments(userId);

  // Advance any in-flight documents so the UI reflects real progress on refresh.
  return Promise.all(
    documents.map((document) =>
      document.status === "ready" || document.status === "failed"
        ? document
        : syncDocument(document),
    ),
  );
}

export async function getUserDocument(
  userId: string,
  documentId: string,
): Promise<DocumentRecord | null> {
  return repository.findDocument(userId, documentId);
}

export async function removeUserDocument(
  userId: string,
  documentId: string,
): Promise<boolean> {
  const document = await repository.findDocument(userId, documentId);
  if (!document) {
    return false;
  }

  await deletePageIndexDocument(document.pageIndexDocId);
  await repository.deleteDocument(document.id);

  return true;
}
