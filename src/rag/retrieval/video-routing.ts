import { getOpenAiClient } from "@/src/lib/openai";
import { ragConfig } from "@/src/rag/config";
import type { OptimizedQuery } from "@/src/rag/types";
import type { PlaylistIndexEntry } from "@/src/rag/youtube/repository";
import { formatDuration } from "@/src/rag/youtube/transcript-document";

const SYSTEM_PROMPT =
  "You route questions to videos inside a playlist. You are given the playlist's " +
  "video list — position, title, publish date, length and a one-line summary of " +
  "each — plus several phrasings of one user question.\n\n" +
  "Decide which videos would actually contain the answer, then return their ids " +
  "ranked most relevant first. Rules:\n" +
  "- Only return ids that appear verbatim in the list.\n" +
  "- Position (#1, #2, …) is the creator's curation order, NOT upload or publish order. " +
  "For questions about newest, latest, most recent, or last uploaded, sort by the " +
  "ISO publish dates shown — never by position. Example: #1 published 2020-01-01 is " +
  "older than #5 published 2024-06-01.\n" +
  "- Return an empty list if no video plausibly covers the question. Never guess.\n" +
  "- relevance is 0.0-1.0 for how likely that video contains the answer.\n" +
  "- reason is one short sentence explaining the match.";

const RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: {
    name: "video_routing",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        videos: {
          type: "array",
          description: "Relevant videos, most relevant first.",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              videoId: {
                type: "string",
                description: "The video id exactly as it appears in the list.",
              },
              relevance: {
                type: "number",
                description: "Likelihood the video contains the answer, 0.0 to 1.0.",
              },
              reason: {
                type: "string",
                description: "One short sentence on why this video matches.",
              },
            },
            required: ["videoId", "relevance", "reason"],
          },
        },
      },
      required: ["videos"],
    },
  },
};

export interface RoutedVideo {
  videoId: string;
  relevance: number;
  reason: string;
}

/**
 * Render the playlist-level index.
 *
 * Titles, dates, lengths and one-line summaries only — never transcripts. This
 * is the outer table of contents: skim the whole playlist cheaply, then open
 * only the videos worth reading.
 *
 * Whether a video's transcript has been built is deliberately left out. Routing
 * answers "which video is this about", and the caller builds whatever it picks;
 * showing build state here would steer the model towards already-indexed videos
 * and the playlist would never grow past its first few answers.
 */
function renderPlaylistIndex(entries: PlaylistIndexEntry[]): string {
  return entries
    .map((entry) => {
      const gist = entry.summary?.trim() || entry.descriptionGist;
      const detail = gist ? ` — ${gist}` : "";

      return (
        `[${entry.videoId}] #${entry.position + 1} ${entry.title} ` +
        `(published ${entry.publishedAt.slice(0, 10)}, ${formatDuration(entry.durationSeconds)})` +
        detail
      );
    })
    .join("\n");
}

function buildUserPrompt(
  playlistName: string,
  entries: PlaylistIndexEntry[],
  queries: OptimizedQuery,
  limit: number,
): string {
  const subQueries = queries.subQueries.length
    ? queries.subQueries.map((q, i) => `  ${i + 1}. ${q}`).join("\n")
    : "  (none)";

  return [
    `Playlist: ${playlistName}`,
    "",
    "Videos:",
    renderPlaylistIndex(entries),
    "",
    "Question (original):",
    queries.original,
    "",
    "Question (clarified):",
    queries.rewritten,
    "",
    "Broader background question:",
    queries.stepBack || "(none)",
    "",
    "Sub-questions:",
    subQueries,
    "",
    `Return at most ${limit} videos.`,
  ].join("\n");
}

/**
 * Stage one of playlist retrieval: which videos is this question about?
 *
 * Reasoning over the playlist index costs one small call regardless of playlist
 * size, and it is what keeps the rest of the pipeline proportional to the
 * question — the section-level search and any transcript building only ever
 * touch the handful of videos that survive this step.
 */
export async function routeToVideos(
  playlistName: string,
  entries: PlaylistIndexEntry[],
  queries: OptimizedQuery,
): Promise<RoutedVideo[]> {
  // Videos that cannot be read are dropped before the model sees them. A video
  // with no captions, or one PageIndex rejected, will never yield a section, so
  // leaving it in the running would let it consume the per-question budget on
  // every question and starve videos that could actually answer.
  const candidates = entries.filter(
    (entry) =>
      entry.availability === "available" && entry.transcriptStatus !== "failed",
  );

  if (candidates.length === 0) {
    return [];
  }

  const limit = ragConfig.youtube.videosPerQuery;

  // Nothing to route: the whole playlist already fits the per-question budget.
  if (candidates.length <= limit) {
    return candidates.map((entry) => ({
      videoId: entry.videoId,
      relevance: 0.5,
      reason: "Playlist is small enough to search in full.",
    }));
  }

  const completion = await getOpenAiClient().chat.completions.create({
    model: ragConfig.openai.reasoningModel,
    temperature: 0,
    response_format: RESPONSE_FORMAT,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: buildUserPrompt(playlistName, candidates, queries, limit),
      },
    ],
  });

  const parsed = JSON.parse(
    completion.choices[0]?.message?.content ?? "{}",
  ) as { videos?: RoutedVideo[] };

  if (!Array.isArray(parsed.videos)) {
    return [];
  }

  const known = new Set(candidates.map((entry) => entry.videoId));
  const seen = new Set<string>();

  return parsed.videos
    .filter((video) => {
      if (typeof video?.videoId !== "string" || !known.has(video.videoId)) {
        return false;
      }
      if (seen.has(video.videoId)) return false;
      seen.add(video.videoId);
      return true;
    })
    .map((video) => ({
      videoId: video.videoId,
      relevance:
        typeof video.relevance === "number"
          ? Math.min(1, Math.max(0, video.relevance))
          : 0,
      reason: typeof video.reason === "string" ? video.reason : "",
    }))
    .slice(0, limit);
}
