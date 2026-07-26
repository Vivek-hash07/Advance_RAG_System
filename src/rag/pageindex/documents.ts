import { PageIndexError, type TreeNode } from "@pageindex/sdk";

import { getPageIndexClient } from "@/src/rag/pageindex/client";
import type { IngestStatus } from "@/src/rag/types";

export interface TreeState {
  status: IngestStatus;
  retrievalReady: boolean;
  tree: TreeNode[] | null;
}

/** Translate PageIndex's processing states onto our own status vocabulary. */
export function toIngestStatus(pageIndexStatus: string): IngestStatus {
  switch (pageIndexStatus) {
    case "completed":
      return "ready";
    case "failed":
      return "failed";
    case "queued":
      return "queued";
    default:
      return "processing";
  }
}

function describe(error: unknown, fallback: string): Error {
  if (error instanceof PageIndexError) {
    switch (error.code) {
      case "UNAUTHORIZED":
        return new Error("PageIndex rejected the API key. Check PAGEINDEX_API_KEY.");
      case "USAGE_LIMIT_REACHED":
        return new Error("PageIndex account usage limit reached.");
      case "RATE_LIMITED":
        return new Error("PageIndex rate limit hit. Please retry in a moment.");
      case "NOT_FOUND":
        return new Error("This document no longer exists in PageIndex.");
      default:
        return new Error(`PageIndex: ${error.message}`);
    }
  }

  return error instanceof Error ? error : new Error(fallback);
}

/** Upload a PDF and start tree generation. Returns the PageIndex document id. */
export async function submitPdf(
  pdf: Buffer,
  fileName: string,
): Promise<string> {
  try {
    const { doc_id } = await getPageIndexClient().api.submitDocument(pdf, fileName);
    return doc_id;
  } catch (error) {
    throw describe(error, "Failed to submit the document to PageIndex");
  }
}

/**
 * Fetch processing status and, once complete, the hierarchical tree.
 * Node summaries are requested because the retrieval stage reasons over them.
 */
export async function fetchTree(pageIndexDocId: string): Promise<TreeState> {
  try {
    const response = await getPageIndexClient().api.getTree(pageIndexDocId, {
      nodeSummary: true,
    });

    return {
      status: toIngestStatus(response.status),
      retrievalReady: response.retrieval_ready ?? response.status === "completed",
      tree: response.result ?? null,
    };
  } catch (error) {
    throw describe(error, "Failed to read the document tree from PageIndex");
  }
}

export async function deletePageIndexDocument(
  pageIndexDocId: string,
): Promise<void> {
  try {
    await getPageIndexClient().api.deleteDocument(pageIndexDocId);
  } catch (error) {
    if (error instanceof PageIndexError && error.code === "NOT_FOUND") {
      return;
    }
    throw describe(error, "Failed to delete the document from PageIndex");
  }
}
