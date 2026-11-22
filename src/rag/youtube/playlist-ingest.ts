import { prisma } from "@/src/lib/db";
import { ragConfig } from "@/src/rag/config";
import {
  fetchPlaylist,
  fetchPlaylistEntries,
  fetchVideos,
} from "@/src/rag/youtube/data-api";
import * as youtube from "@/src/rag/youtube/repository";
import {
  captionPauseRemainingMs,
  captionsPaused,
} from "@/src/rag/youtube/transcript";
import {
  ensureVideoIndexed,
  isVideoIndexed,
} from "@/src/rag/youtube/video-ingest";

export class PlaylistIngestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlaylistIngestError";
  }
}

export interface PlaylistSyncResult {
  playlistRowId: string;
  playlistId: string;
  title: string;
  /** Ids of every ingestable video, in playlist order. */
  videoIds: string[];
  truncated: boolean;
  unavailableCount: number;
}

/**
 * Build the playlist-level index: the playlist's own details plus one metadata
 * row per video, in curation order.
 *
 * Transcripts for every listed video are embedded after this returns. The
 * listing itself is what a question about the author or the series order uses.
 */
export async function syncPlaylist(
  playlistId: string,
): Promise<PlaylistSyncResult> {
  const metadata = await fetchPlaylist(playlistId);

  if (!metadata) {
    throw new PlaylistIngestError(
      "That playlist does not exist or is not public.",
    );
  }

  const listing = await fetchPlaylistEntries(playlistId);

  if (listing.entries.length === 0) {
    throw new PlaylistIngestError(
      "That playlist has no videos we can read. All of its entries are private or deleted.",
    );
  }

  const fetched = await fetchVideos(listing.entries.map((entry) => entry.videoId));
  const byVideoId = new Map(fetched.map((video) => [video.videoId, video]));

  const rows: Array<{ videoRowId: string; position: number; videoId: string }> = [];
  let unavailableCount = listing.unavailableCount;

  for (const entry of listing.entries) {
    const video = byVideoId.get(entry.videoId);

    // Listed but absent from videos.list means private, deleted or blocked.
    // Record it so the playlist stays complete and the gap is visible.
    const record = video
      ? await youtube.upsertVideo(video)
      : await youtube.markVideoUnavailable(entry.videoId, entry.title);

    if (!video) {
      unavailableCount += 1;
    }

    rows.push({
      videoRowId: record.id,
      position: entry.position,
      videoId: entry.videoId,
    });
  }

  const playlist = await youtube.upsertPlaylist({
    playlistId,
    title: metadata.title,
    description: metadata.description,
    channelTitle: metadata.channelTitle,
    itemCount: metadata.itemCount,
    truncated: listing.truncated,
    unavailableCount,
  });

  await youtube.replacePlaylistItems(
    playlist.id,
    rows.map(({ videoRowId, position }) => ({ videoRowId, position })),
  );

  const ingestable = rows
    .filter(({ videoId }) => byVideoId.has(videoId))
    .map(({ videoId }) => videoId);

  return {
    playlistRowId: playlist.id,
    playlistId,
    title: metadata.title,
    videoIds: ingestable,
    truncated: listing.truncated,
    unavailableCount,
  };
}

async function mapPool<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<unknown>,
): Promise<void> {
  let cursor = 0;

  async function next(): Promise<void> {
    const index = cursor;
    cursor += 1;
    if (index >= items.length) return;
    await worker(items[index]);
    await next();
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => next()),
  );
}

const playlistJobs = new Map<string, Promise<void>>();
const resumeTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** True when this process is already embedding the playlist. */
export function playlistIndexRunning(playlistId: string): boolean {
  return playlistJobs.has(playlistId);
}

/** Try the rate-limited videos again once YouTube's quiet period has elapsed. */
export function scheduleCaptionRetry(playlistId: string): void {
  if (resumeTimers.has(playlistId) || playlistJobs.has(playlistId)) return;

  const wait = Math.max(1_000, captionPauseRemainingMs() + 2_000);
  const timer = setTimeout(() => {
    resumeTimers.delete(playlistId);
    void indexPlaylistInBackground(playlistId);
  }, wait);
  resumeTimers.set(playlistId, timer);
}

/**
 * Chunk every video in the playlist that does not have vectors yet.
 *
 * Repeated calls for the same playlist share one run. Per-video failures stay
 * on the video row and do not stop the rest of the playlist.
 */
export function indexPlaylistInBackground(playlistId: string): Promise<void> {
  const current = playlistJobs.get(playlistId);
  if (current) return current;
  if (captionsPaused()) return Promise.resolve();

  const run = (async () => {
    const ids = await youtube.findUnbuiltPlaylistVideos(playlistId);
    if (ids.length === 0) return;
    await indexPlaylistTranscripts(ids);
  })().finally(() => {
    if (playlistJobs.get(playlistId) === run) {
      playlistJobs.delete(playlistId);
    }
  });

  playlistJobs.set(playlistId, run);
  return run;
}

/** Embed transcripts for videos that are not indexed yet. Failures stay on the video row. */
export async function indexPlaylistTranscripts(videoIds: string[]): Promise<void> {
  const pending: string[] = [];

  for (const videoId of videoIds) {
    if (!(await isVideoIndexed(videoId))) pending.push(videoId);
  }

  await mapPool(pending, 1, (videoId) => ensureVideoIndexed(videoId));
}

/**
 * Whether a cached playlist is stale enough to re-list.
 *
 * Playlists are mutable — channels add, remove and reorder videos — so the
 * structure is re-checked on a timer rather than trusted forever.
 */
export async function isPlaylistStale(playlistId: string): Promise<boolean> {
  const playlist = await youtube.findPlaylist(playlistId);
  if (!playlist) return true;

  const age = Date.now() - new Date(playlist.lastSyncedAt).getTime();
  return age > ragConfig.youtube.playlistRefreshMs;
}

/** Playlists that still have sources pointing at them, for scheduled refresh. */
export async function listRefreshablePlaylists(): Promise<string[]> {
  const cutoff = new Date(Date.now() - ragConfig.youtube.playlistRefreshMs);

  const rows = await prisma.youtubePlaylist.findMany({
    where: { lastSyncedAt: { lt: cutoff }, documents: { some: {} } },
    select: { playlistId: true },
  });

  return rows.map((row) => row.playlistId);
}
