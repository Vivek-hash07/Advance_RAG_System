import { generateAnswer } from "@/src/rag/answer/answer";
import { ragConfig } from "@/src/rag/config";
import { findRetrievableDocuments } from "@/src/rag/documents/repository";
import { optimizeQuery } from "@/src/rag/query/optimize";
import { retrieveNodes } from "@/src/rag/retrieval/retrieve";
import type { AnswerResult } from "@/src/rag/types";

export interface AskOptions {
  userId: string;
  question: string;
  /** Restrict retrieval to these documents. Defaults to all ready documents. */
  documentIds?: string[];
}

export class NoSourcesError extends Error {
  constructor() {
    super(
      "No sources are ready yet. Upload a PDF, document, text file or VTT transcript first.",
    );
    this.name = "NoSourcesError";
  }
}

/**
 * The vectorless RAG pipeline, end to end:
 *
 * 1. Optimize the query — step-back, rewriting, sub-queries and HyDE.
 * 2. Reason over each document's PageIndex tree to pick relevant sections.
 * 3. Fuse the per-document rankings with Reciprocal Rank Fusion.
 * 4. Answer strictly from the selected sections, with citations.
 *
 * No embeddings, no chunking and no vector store are involved at any stage.
 */
export async function askQuestion({
  userId,
  question,
  documentIds,
}: AskOptions): Promise<AnswerResult> {
  const available = await findRetrievableDocuments(userId, documentIds);

  if (available.length === 0) {
    throw new NoSourcesError();
  }

  // `available` is ordered newest first.
  const documents = available.slice(0, ragConfig.retrieval.maxDocumentsPerQuery);

  if (documents.length < available.length) {
    console.warn(
      `[rag] Searching ${documents.length} of ${available.length} sources; raise RETRIEVAL_MAX_DOCUMENTS to widen the search.`,
    );
  }

  const queries = await optimizeQuery(question);
  const nodes = await retrieveNodes(documents, queries);
  const { answer, citations } = await generateAnswer(queries.rewritten, nodes);

  return { answer, citations, queries };
}
