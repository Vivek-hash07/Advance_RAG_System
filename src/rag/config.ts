const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

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
  },
  pageIndex: {
    apiKey: process.env.PAGEINDEX_API_KEY,
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
     * Playlists at or below this size get every transcript built at ingest time.
     * Larger ones only index metadata upfront and build transcripts on demand,
     * so nobody pays to transcribe videos that are never asked about.
     */
    eagerBuildMaxVideos: Number(process.env.YOUTUBE_EAGER_BUILD_MAX) || 20,
    /** Videos a single playlist may contribute to one question, after routing. */
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

export function requirePageIndexKey(): string {
  if (!ragConfig.pageIndex.apiKey) {
    throw new Error("PAGEINDEX_API_KEY is not set");
  }
  return ragConfig.pageIndex.apiKey;
}

export function requireYoutubeKey(): string {
  if (!ragConfig.youtube.apiKey) {
    throw new Error("YOUTUBE_API_KEY is not set");
  }
  return ragConfig.youtube.apiKey;
}
