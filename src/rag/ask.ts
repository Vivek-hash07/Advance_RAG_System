import { getAskGraph } from "@/src/rag/graph/ask-graph";
import type { AnswerResult } from "@/src/rag/types";

export { NoSourcesError } from "@/src/rag/errors";

export interface AskOptions {
  userId: string;
  question: string;
  /** Restrict retrieval to these documents. Defaults to all ready documents. */
  documentIds?: string[];
  /** Existing conversation, or omit to create one. */
  conversationId?: string;
  onMeta?: (meta: {
    conversationId: string;
    userMessageId: string;
  }) => void;
  onStatus?: (stage: string) => void;
  onDelta?: (text: string) => void;
}

export interface AskPipelineResult extends AnswerResult {
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
}

/**
 * LangGraph RAG pipeline:
 *
 * 1. Load ready sources and persist the user turn.
 * 2. Search Postgres-backed memories (vectors live in Qdrant).
 * 3. Optimize the query — step-back, rewriting, sub-queries and HyDE.
 * 4. Embed those variants and search Qdrant, routing playlists to a few videos.
 * 5. Answer from the retrieved chunks, recent turns and memories.
 * 6. Persist the assistant turn and store any new personal facts.
 */
export async function askQuestion({
  userId,
  question,
  documentIds,
  conversationId,
  onMeta,
  onStatus,
  onDelta,
}: AskOptions): Promise<AskPipelineResult> {
  const result = await getAskGraph().invoke(
    {
      userId,
      question,
      documentIds: documentIds ?? null,
      requestedConversationId: conversationId ?? null,
    },
    { configurable: { onMeta, onStatus, onDelta } },
  );

  if (!result.queries) {
    throw new Error("The ask graph finished without an optimized query.");
  }

  return {
    answer: result.answer,
    citations: result.citations,
    queries: result.queries,
    pendingVideos: result.pendingVideos,
    conversationId: result.conversationId,
    userMessageId: result.userMessageId,
    assistantMessageId: result.assistantMessageId,
  };
}
