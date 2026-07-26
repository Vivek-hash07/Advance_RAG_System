import { ragConfig, requireYoutubeKey } from "@/src/rag/config";

const API_ROOT = "https://www.googleapis.com/youtube/v3";

/** `videos.list` and `playlistItems.list` both cap a page at 50 items. */
const PAGE_SIZE = 50;

export class YoutubeApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason?: string,
  ) {
    super(message);
    this.name = "YoutubeApiError";
  }
}

export interface YoutubeVideoMetadata {
  videoId: string;
  title: string;
  description: string;
  channelTitle: string;
  publishedAt: string;
  durationSeconds: number;
  thumbnailUrl: string | null;
  defaultLanguage: string | null;
  /** True while a stream is upcoming or live; captions are not final yet. */
  isLive: boolean;
}

export interface PlaylistMetadata {
  playlistId: string;
  title: string;
  description: string;
  channelTitle: string;
  itemCount: number;
}

export interface PlaylistEntry {
  videoId: string;
  /** Zero-based position in the playlist, which is curation order, not upload order. */
  position: number;
  title: string;
  /** `public` | `unlisted` | `private`; private entries have no fetchable content. */
  privacyStatus: string;
}

interface ApiErrorBody {
  error?: { message?: string; errors?: Array<{ reason?: string }> };
}

async function call<T>(
  resource: string,
  params: Record<string, string | number>,
): Promise<T> {
  const query = new URLSearchParams({
    ...Object.fromEntries(
      Object.entries(params).map(([key, value]) => [key, String(value)]),
    ),
    key: requireYoutubeKey(),
  });

  const response = await fetch(`${API_ROOT}/${resource}?${query}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    const reason = body.error?.errors?.[0]?.reason;

    throw new YoutubeApiError(
      describeApiFailure(response.status, reason, body.error?.message),
      response.status,
      reason,
    );
  }

  return (await response.json()) as T;
}

function describeApiFailure(
  status: number,
  reason: string | undefined,
  message: string | undefined,
): string {
  if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
    return "The YouTube API daily quota is exhausted. Try again after it resets.";
  }
  if (reason === "playlistNotFound" || status === 404) {
    return "That video or playlist does not exist, or is not public.";
  }
  if (status === 403) {
    return "YouTube rejected the API key. Check YOUTUBE_API_KEY and that the Data API v3 is enabled.";
  }
  return message ?? `YouTube API request failed with status ${status}.`;
}

/**
 * Parse an ISO 8601 duration (`PT1H2M30S`) into seconds.
 * Live streams report `P0D`, which correctly yields 0.
 */
export function parseIsoDuration(duration: string | undefined): number {
  const match = duration?.match(
    /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/,
  );
  if (!match) return 0;

  const [, days, hours, minutes, seconds] = match;

  return (
    Number(days ?? 0) * 86_400 +
    Number(hours ?? 0) * 3600 +
    Number(minutes ?? 0) * 60 +
    Number(seconds ?? 0)
  );
}

interface VideosResponse {
  items?: Array<{
    id: string;
    snippet?: {
      title?: string;
      description?: string;
      channelTitle?: string;
      publishedAt?: string;
      liveBroadcastContent?: string;
      defaultAudioLanguage?: string;
      defaultLanguage?: string;
      thumbnails?: Record<string, { url?: string }>;
    };
    contentDetails?: { duration?: string };
  }>;
}

function pickThumbnail(
  thumbnails: Record<string, { url?: string }> | undefined,
): string | null {
  if (!thumbnails) return null;

  for (const size of ["medium", "high", "standard", "default"]) {
    const url = thumbnails[size]?.url;
    if (url) return url;
  }

  return null;
}

/**
 * Fetch metadata for up to 50 videos per request.
 *
 * Batching matters: `videos.list` costs one quota unit per call no matter how
 * many ids are packed in, so a 200-video playlist costs 4 units, not 200.
 * Videos that are private or deleted are simply absent from the response, which
 * is how callers detect them.
 */
export async function fetchVideos(
  videoIds: string[],
): Promise<YoutubeVideoMetadata[]> {
  const unique = [...new Set(videoIds)];
  const results: YoutubeVideoMetadata[] = [];

  for (let offset = 0; offset < unique.length; offset += PAGE_SIZE) {
    const batch = unique.slice(offset, offset + PAGE_SIZE);

    const response = await call<VideosResponse>("videos", {
      part: "snippet,contentDetails",
      id: batch.join(","),
      maxResults: PAGE_SIZE,
    });

    for (const item of response.items ?? []) {
      const snippet = item.snippet ?? {};
      const broadcast = snippet.liveBroadcastContent ?? "none";

      results.push({
        videoId: item.id,
        title: snippet.title?.trim() || "Untitled video",
        description: snippet.description ?? "",
        channelTitle: snippet.channelTitle ?? "",
        publishedAt: snippet.publishedAt ?? new Date().toISOString(),
        durationSeconds: parseIsoDuration(item.contentDetails?.duration),
        thumbnailUrl: pickThumbnail(snippet.thumbnails),
        defaultLanguage:
          snippet.defaultAudioLanguage ?? snippet.defaultLanguage ?? null,
        isLive: broadcast === "live" || broadcast === "upcoming",
      });
    }
  }

  return results;
}

export async function fetchVideo(
  videoId: string,
): Promise<YoutubeVideoMetadata | null> {
  const [video] = await fetchVideos([videoId]);
  return video ?? null;
}

interface PlaylistsResponse {
  items?: Array<{
    id: string;
    snippet?: { title?: string; description?: string; channelTitle?: string };
    contentDetails?: { itemCount?: number };
  }>;
}

export async function fetchPlaylist(
  playlistId: string,
): Promise<PlaylistMetadata | null> {
  const response = await call<PlaylistsResponse>("playlists", {
    part: "snippet,contentDetails",
    id: playlistId,
    maxResults: 1,
  });

  const item = response.items?.[0];
  if (!item) return null;

  return {
    playlistId: item.id,
    title: item.snippet?.title?.trim() || "Untitled playlist",
    description: item.snippet?.description ?? "",
    channelTitle: item.snippet?.channelTitle ?? "",
    itemCount: item.contentDetails?.itemCount ?? 0,
  };
}

interface PlaylistItemsResponse {
  nextPageToken?: string;
  items?: Array<{
    snippet?: {
      title?: string;
      position?: number;
      resourceId?: { kind?: string; videoId?: string };
    };
    status?: { privacyStatus?: string };
  }>;
}

export interface PlaylistListing {
  entries: PlaylistEntry[];
  /** True when the playlist is longer than the configured cap. */
  truncated: boolean;
  /** Entries the API listed but that cannot be read (private/deleted). */
  unavailableCount: number;
}

/**
 * Page through a playlist's contents.
 *
 * Each call returns up to 50 items for one quota unit, so even a 200-video
 * playlist costs about 4 units. Private and deleted videos are still listed
 * here — they are counted and dropped rather than failing the whole ingest.
 */
export async function fetchPlaylistEntries(
  playlistId: string,
): Promise<PlaylistListing> {
  const cap = ragConfig.youtube.maxPlaylistVideos;
  const entries: PlaylistEntry[] = [];

  let unavailableCount = 0;
  let truncated = false;
  let pageToken: string | undefined;

  do {
    const response = await call<PlaylistItemsResponse>("playlistItems", {
      part: "snippet,status",
      playlistId,
      maxResults: PAGE_SIZE,
      ...(pageToken ? { pageToken } : {}),
    });

    for (const item of response.items ?? []) {
      const snippet = item.snippet ?? {};
      const videoId = snippet.resourceId?.videoId;
      const privacyStatus = item.status?.privacyStatus ?? "public";

      if (!videoId || snippet.resourceId?.kind !== "youtube#video") {
        continue;
      }

      // "Private video" / "Deleted video" placeholders keep their slot in the
      // listing but have no readable content.
      if (privacyStatus === "private" || snippet.title === "Deleted video") {
        unavailableCount += 1;
        continue;
      }

      if (entries.length >= cap) {
        truncated = true;
        break;
      }

      entries.push({
        videoId,
        position: snippet.position ?? entries.length,
        title: snippet.title?.trim() || "Untitled video",
        privacyStatus,
      });
    }

    pageToken = truncated ? undefined : response.nextPageToken;
  } while (pageToken);

  return { entries, truncated, unavailableCount };
}
