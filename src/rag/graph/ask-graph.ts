import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { RunnableConfig } from "@langchain/core/runnables";

import { generateAnswer } from "@/src/rag/answer/answer";
import type { ChatHistoryTurn } from "@/src/rag/answer/answer";
import { NoSourcesError } from "@/src/rag/errors";
import { ragConfig } from "@/src/rag/config";
import {
  appendAssistantMessage,
  appendUserMessage,
  ensureConversation,
  getRecentTurns,
} from "@/src/rag/conversations/repository";
import {
  findRetrievableSources,
  type RetrievalSource,
} from "@/src/rag/documents/repository";
import { rememberTurn, searchMemories } from "@/src/rag/memory/store";
import { optimizeQuery } from "@/src/rag/query/optimize";
import { retrieveNodes } from "@/src/rag/retrieval/retrieve";
import type {
  AnswerCitation,
  OptimizedQuery,
  PendingVideo,
  RetrievedNode,
} from "@/src/rag/types";

export interface AskHooks {
  onMeta?: (meta: { conversationId: string; userMessageId: string }) => void;
  onStatus?: (stage: string) => void;
  onDelta?: (text: string) => void;
}

const AskState = Annotation.Root({
  userId: Annotation<string>,
  question: Annotation<string>,
  documentIds: Annotation<string[] | null>,
  requestedConversationId: Annotation<string | null>,
  conversationId: Annotation<string>({
    reducer: (_left, right) => right,
    default: () => "",
  }),
  userMessageId: Annotation<string>({
    reducer: (_left, right) => right,
    default: () => "",
  }),
  assistantMessageId: Annotation<string>({
    reducer: (_left, right) => right,
    default: () => "",
  }),
  sources: Annotation<RetrievalSource[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  history: Annotation<ChatHistoryTurn[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  memories: Annotation<string[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  queries: Annotation<OptimizedQuery | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  nodes: Annotation<RetrievedNode[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  pendingVideos: Annotation<PendingVideo[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  answer: Annotation<string>({
    reducer: (_left, right) => right,
    default: () => "",
  }),
  citations: Annotation<AnswerCitation[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
});

function hooks(config: RunnableConfig): AskHooks {
  return (config.configurable ?? {}) as AskHooks;
}

async function prepare(
  state: typeof AskState.State,
  config: RunnableConfig,
) {
  const available = await findRetrievableSources(
    state.userId,
    state.documentIds ?? undefined,
  );

  if (available.length === 0) {
    throw new NoSourcesError();
  }

  const conversation = await ensureConversation(
    state.userId,
    state.requestedConversationId ?? undefined,
    state.question,
  );
  const history = await getRecentTurns(conversation.id, 8);
  const userMessage = await appendUserMessage(conversation.id, state.question);

  hooks(config).onMeta?.({
    conversationId: conversation.id,
    userMessageId: userMessage.id,
  });

  const sources = available.slice(0, ragConfig.retrieval.maxDocumentsPerQuery);
  if (sources.length < available.length) {
    console.warn(
      `[rag] Searching ${sources.length} of ${available.length} sources; raise RETRIEVAL_MAX_DOCUMENTS to widen the search.`,
    );
  }

  return {
    conversationId: conversation.id,
    userMessageId: userMessage.id,
    history,
    sources,
  };
}

async function recall(state: typeof AskState.State, config: RunnableConfig) {
  hooks(config).onStatus?.("remembering");
  const memories = await searchMemories(state.userId, state.question);
  return { memories };
}

async function optimize(state: typeof AskState.State, config: RunnableConfig) {
  hooks(config).onStatus?.("optimizing");
  const queries = await optimizeQuery(state.question);
  return { queries };
}

async function retrieve(state: typeof AskState.State, config: RunnableConfig) {
  hooks(config).onStatus?.("retrieving");
  if (!state.queries) {
    throw new Error("The question was not optimized before retrieval.");
  }

  const { nodes, pendingVideos } = await retrieveNodes(
    state.userId,
    state.sources,
    state.queries,
  );
  return { nodes, pendingVideos };
}

async function respond(state: typeof AskState.State, config: RunnableConfig) {
  hooks(config).onStatus?.("answering");
  const question = state.queries?.rewritten || state.question;
  const generated = await generateAnswer(question, state.nodes, {
    history: state.history,
    memories: state.memories,
    onDelta: hooks(config).onDelta,
  });
  return generated;
}

async function persist(state: typeof AskState.State) {
  if (!state.queries) {
    throw new Error("The question was not optimized before the answer was saved.");
  }

  const assistantMessage = await appendAssistantMessage(state.conversationId, {
    content: state.answer,
    citations: state.citations,
    queries: state.queries,
    pendingVideos: state.pendingVideos,
  });

  await rememberTurn(
    state.userId,
    state.conversationId,
    state.question,
    state.answer,
  );

  return { assistantMessageId: assistantMessage.id };
}

function compileAskGraph() {
  return new StateGraph(AskState)
    .addNode("prepare", prepare)
    .addNode("recall", recall)
    .addNode("optimize", optimize)
    .addNode("retrieve", retrieve)
    .addNode("respond", respond)
    .addNode("persist", persist)
    .addEdge(START, "prepare")
    .addEdge("prepare", "recall")
    .addEdge("recall", "optimize")
    .addEdge("optimize", "retrieve")
    .addEdge("retrieve", "respond")
    .addEdge("respond", "persist")
    .addEdge("persist", END)
    .compile();
}

export type AskGraph = ReturnType<typeof compileAskGraph>;

const globalForGraph = globalThis as unknown as {
  askGraph?: AskGraph;
  /** Bumped whenever the graph shape changes so a hot reload drops a stale compile. */
  askGraphRevision?: number;
};

const ASK_GRAPH_REVISION = 2;

export function getAskGraph(): AskGraph {
  if (
    !globalForGraph.askGraph ||
    globalForGraph.askGraphRevision !== ASK_GRAPH_REVISION
  ) {
    globalForGraph.askGraph = compileAskGraph();
    globalForGraph.askGraphRevision = ASK_GRAPH_REVISION;
  }
  return globalForGraph.askGraph;
}
