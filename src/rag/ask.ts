import { generateAnswer } from "@/src/rag/answer/answer";
import {
  addConversationMemory,
  searchMemories,
} from "@/src/lib/mem0";
import { ragConfig } from "@/src/rag/config";
import {
  appendAssistantMessage,
  appendUserMessage,
  ensureConversation,
  getRecentTurns,
} from "@/src/rag/conversations/repository";
import { findRetrievableSources } from "@/src/rag/documents/repository";
import { optimizeQuery } from "@/src/rag/query/optimize";
import { retrieveNodes } from "@/src/rag/retrieval/retrieve";
import type { AnswerResult } from "@/src/rag/types";

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
 * 1. Ensure a conversation exists and load retrievable sources.
 * 2. Persist the user turn.
 * 3. Search Mem0 for durable user facts (optional).
 * 4. Optimize the query — step-back, rewriting, sub-queries and HyDE.
 * 5. For playlists, reason over the playlist-level index to pick videos.
 * 6. Reason over each source's PageIndex tree to pick relevant sections.
 * 7. Fuse the per-source rankings with Reciprocal Rank Fusion.
 * 8. Answer from sections + recent turns + memories, with citations.
 * 9. Persist the assistant turn and fire-and-forget Mem0 add.
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
  const available = await findRetrievableSources(userId, documentIds);

  if (available.length === 0) {
    throw new NoSourcesError();
  }

  const conversation = await ensureConversation(
    userId,
    conversationId,
    question,
  );

  // History before the new user turn.
  const history = await getRecentTurns(conversation.id, 8);

  const userMessage = await appendUserMessage(conversation.id, question);
  onMeta?.({
    conversationId: conversation.id,
    userMessageId: userMessage.id,
  });

  // `available` is ordered newest first.
  const sources = available.slice(0, ragConfig.retrieval.maxDocumentsPerQuery);

  if (sources.length < available.length) {
    console.warn(
      `[rag] Searching ${sources.length} of ${available.length} sources; raise RETRIEVAL_MAX_DOCUMENTS to widen the search.`,
    );
  }

  onStatus?.("remembering");
  const memories = await searchMemories(userId, question);

  onStatus?.("optimizing");
  const queries = await optimizeQuery(question);

  onStatus?.("retrieving");
  const { nodes, pendingVideos } = await retrieveNodes(sources, queries);

  onStatus?.("answering");
  const { answer, citations } = await generateAnswer(queries.rewritten, nodes, {
    history,
    memories,
    onDelta,
  });

  const assistantMessage = await appendAssistantMessage(conversation.id, {
    content: answer,
    citations,
    queries,
    pendingVideos,
  });

  void addConversationMemory(userId, conversation.id, [
    { role: "user", content: question },
    { role: "assistant", content: answer },
  ]);

  return {
    answer,
    citations,
    queries,
    pendingVideos,
    conversationId: conversation.id,
    userMessageId: userMessage.id,
    assistantMessageId: assistantMessage.id,
  };
}
