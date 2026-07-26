export const ragConfig = {
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    chatModel: process.env.CHAT_MODEL ?? "gpt-4o-mini",
    /** Used for node selection and answer synthesis, where reasoning quality matters most. */
    reasoningModel: process.env.REASONING_MODEL ?? "gpt-4o-mini",
  },
  pageIndex: {
    apiKey: process.env.PAGEINDEX_API_KEY,
  },
  ingest: {
    maxFileBytes: Number(process.env.MAX_UPLOAD_BYTES) || 25 * 1024 * 1024,
  },
  retrieval: {
    /**
     * Documents searched per question. Each one costs a section-selection call,
     * so this bounds the fan-out; the most recently added documents win.
     */
    maxDocumentsPerQuery: Number(process.env.RETRIEVAL_MAX_DOCUMENTS) || 10,
    /** Candidate nodes the selector may return per document. */
    nodesPerDocument: Number(process.env.RETRIEVAL_NODES_PER_DOC) || 6,
    /** Reciprocal Rank Fusion constant. */
    rrfK: Number(process.env.RRF_K) || 60,
    /** Nodes kept after fusion and handed to the answer model. */
    finalNodes: Number(process.env.RETRIEVAL_FINAL_NODES) || 8,
    /** Hard cap on characters of context sent to the answer model. */
    maxContextChars: Number(process.env.RETRIEVAL_MAX_CONTEXT_CHARS) || 24_000,
  },
} as const;

export function requireOpenAiKey(): string {
  if (!ragConfig.openai.apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  return ragConfig.openai.apiKey;
}

export function requirePageIndexKey(): string {
  if (!ragConfig.pageIndex.apiKey) {
    throw new Error("PAGEINDEX_API_KEY is not set");
  }
  return ragConfig.pageIndex.apiKey;
}
