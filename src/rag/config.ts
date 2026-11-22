const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

function resolveQdrantUrl(raw: string | undefined): string {
  const value = raw?.trim();
  if (!value) return "";

  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  try {
    const url = new URL(withProtocol);
    if (!url.port) url.port = "6333";
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return value;
  }
}

function resolveOpenAiBaseUrl(apiKey: string | undefined): string | undefined {
  const configured = process.env.OPENAI_BASE_URL?.trim();
  if (configured) return configured;
  // OpenRouter keys are rejected by api.openai.com; route them automatically.
  if (apiKey?.startsWith("sk-or-v1")) return OPENROUTER_BASE_URL;
  return undefined;
}

function isOpenRouter(baseURL: string | undefined): boolean {
  return Boolean(baseURL?.includes("openrouter.ai"));
}

function resolveChunkModel(baseURL: string | undefined): string {
  const configured = process.env.CHUNK_MODEL?.trim();
  if (configured) {
    return resolveModel(configured, configured, baseURL);
  }
  if (isOpenRouter(baseURL)) return "liquid/lfm-3-1.7b:free";
  return resolveModel(undefined, "gpt-4o-mini", baseURL);
}

/**
 * OpenRouter expects `provider/model` (e.g. openai/gpt-4o-mini). Plain OpenAI
 * model ids still work against api.openai.com, so only rewrite for OpenRouter.
 */
function resolveModel(
  configured: string | undefined,
  fallback: string,
  baseURL: string | undefined,
): string {
  const model = configured?.trim() || fallback;
  if (isOpenRouter(baseURL) && !model.includes("/")) {
    return `openai/${model}`;
  }
  return model;
}

const openAiApiKey = process.env.OPENAI_API_KEY;
const openAiBaseURL = resolveOpenAiBaseUrl(openAiApiKey);

export const ragConfig = {
  openai: {
    apiKey: openAiApiKey,
    /**
     * OpenAI-compatible API root. Leave unset for api.openai.com.
     * OpenRouter: https://openrouter.ai/api/v1 (also auto-detected for sk-or-v1 keys).
     */
    baseURL: openAiBaseURL,
    chatModel: resolveModel(process.env.CHAT_MODEL, "gpt-4o-mini", openAiBaseURL),
    /** Used for node selection and answer synthesis, where reasoning quality matters most. */
    reasoningModel: resolveModel(
      process.env.REASONING_MODEL,
      "gpt-4o-mini",
      openAiBaseURL,
    ),
    /** Vision / OCR for image uploads. */
    visionModel: resolveModel(
      process.env.VISION_MODEL || process.env.CHAT_MODEL,
      "gpt-4o-mini",
      openAiBaseURL,
    ),
    embeddingModel: resolveModel(
      process.env.EMBEDDING_MODEL,
      "text-embedding-3-small",
      openAiBaseURL,
    ),
    /**
     * Small model that decides topical chunk boundaries. On OpenRouter this is
     * a free 1.7B model; a direct OpenAI key uses the chat model instead.
     */
    chunkModel: resolveChunkModel(openAiBaseURL),
  },
  qdrant: {
    /**
     * Cloud cluster URL. Port 6333 is added when the endpoint has none, which
     * is how Qdrant Cloud serves the REST API.
     */
    url: resolveQdrantUrl(
      process.env.CLUSTER_ENDPOINT || process.env.QDRANT_URL,
    ),
    apiKey:
      process.env.QUDRANT_API_KEY?.trim() ||
      process.env.QDRANT_API_KEY?.trim() ||
      "",
    collection: process.env.QDRANT_COLLECTION?.trim() || "rag_chunks",
    memoryCollection:
      process.env.QDRANT_MEMORY_COLLECTION?.trim() || "user_memories",
  },
  vector: {
    dimensions: Number(process.env.EMBEDDING_DIMENSIONS) || 1536,
    chunkSize: Number(process.env.CHUNK_SIZE) || 1200,
    chunkOverlap: Number(process.env.CHUNK_OVERLAP) || 200,
    /** Turn off with AGENTIC_CHUNKING=0 to use only the character splitter. */
    agentic: process.env.AGENTIC_CHUNKING !== "0",
    /** Source characters sent to the chunk model in one call. */
    agenticWindowChars: Number(process.env.AGENTIC_WINDOW_CHARS) || 4800,
    /** Hits taken from Qdrant for each query variant before fusion. */
    candidatesPerQuery: Number(process.env.RETRIEVAL_CANDIDATES) || 8,
    maxIndexChars: Number(process.env.MAX_INDEX_CHARS) || 500_000,
  },
  ingest: {
    maxFileBytes: Number(process.env.MAX_UPLOAD_BYTES) || 25 * 1024 * 1024,
  },
  webpage: {
    /** Hard cap on how long Scrapling may spend on one page. */
    fetchTimeoutMs: Number(process.env.WEBPAGE_FETCH_TIMEOUT_MS) || 45_000,
    /** Reject pages whose extracted text exceeds this size. */
    maxTextChars: Number(process.env.WEBPAGE_MAX_TEXT_CHARS) || 400_000,
    /** Use Scrapling StealthyFetcher (browser) instead of HTTP Fetcher. */
    stealth: process.env.WEBPAGE_STEALTH === "1",
  },
  youtube: {
    apiKey: process.env.YOUTUBE_API_KEY,
    /**
     * Hard cap on playlist size. Playlists longer than this are truncated to the
     * first N videos and the user is told, rather than silently losing the tail.
     */
    maxPlaylistVideos: Number(process.env.YOUTUBE_MAX_PLAYLIST_VIDEOS) || 200,
    /**
     * Cap used by playlist video routing. The ask path searches every chunked
     * video in the sources chosen for the question.
     */
    videosPerQuery: Number(process.env.YOUTUBE_VIDEOS_PER_QUERY) || 3,
    /** How long a cached playlist listing is trusted before re-fetching it. */
    playlistRefreshMs:
      Number(process.env.YOUTUBE_PLAYLIST_REFRESH_MS) || 6 * 60 * 60 * 1000,
    /** Caption language preference, most wanted first. */
    transcriptLanguages: (process.env.YOUTUBE_TRANSCRIPT_LANGUAGES ?? "en")
      .split(",")
      .map((code) => code.trim())
      .filter(Boolean),
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

export function requireQdrant(): { url: string; apiKey: string } {
  if (!ragConfig.qdrant.url) {
    throw new Error("CLUSTER_ENDPOINT is not set");
  }
  if (!ragConfig.qdrant.apiKey) {
    throw new Error("QUDRANT_API_KEY is not set");
  }
  return { url: ragConfig.qdrant.url, apiKey: ragConfig.qdrant.apiKey };
}

export function requireYoutubeKey(): string {
  if (!ragConfig.youtube.apiKey) {
    throw new Error("YOUTUBE_API_KEY is not set");
  }
  return ragConfig.youtube.apiKey;
}
