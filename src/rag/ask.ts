import { generateAnswer } from "@/src/rag/answer/answer";
import { ragConfig } from "@/src/rag/config";
import { findRetrievableSources } from "@/src/rag/documents/repository";
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
      "No sources are ready yet. Upload a document or add a YouTube video or playlist first.",
    );
    this.name = "NoSourcesError";
  }
}

/**
 * The vectorless RAG pipeline, end to end:
 *
 * 1. Optimize the query — step-back, rewriting, sub-queries and HyDE.
 * 2. For playlists, reason over the playlist-level index to pick videos.
 * 3. Reason over each source's PageIndex tree to pick relevant sections.
 * 4. Fuse the per-source rankings with Reciprocal Rank Fusion.
 * 5. Answer strictly from the selected sections, with citations.
 *
 * No embeddings, no chunking and no vector store are involved at any stage —
 * every narrowing step is a reasoning step over a table of contents.
 */
export async function askQuestion({
  userId,
  question,
  documentIds,
}: AskOptions): Promise<AnswerResult> {
  const available = await findRetrievableSources(userId, documentIds);

  if (available.length === 0) {
    throw new NoSourcesError();
  }

  // `available` is ordered newest first.
  const sources = available.slice(0, ragConfig.retrieval.maxDocumentsPerQuery);

  if (sources.length < available.length) {
    console.warn(
      `[rag] Searching ${sources.length} of ${available.length} sources; raise RETRIEVAL_MAX_DOCUMENTS to widen the search.`,
    );
  }

  const queries = await optimizeQuery(question);
  const { nodes, pendingVideos } = await retrieveNodes(sources, queries);
  const { answer, citations } = await generateAnswer(queries.rewritten, nodes);

  return { answer, citations, queries, pendingVideos };
}
