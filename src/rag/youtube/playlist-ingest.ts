import { prisma } from "@/src/lib/db";
import { ragConfig } from "@/src/rag/config";
import {
  fetchPlaylist,
  fetchPlaylistEntries,
  fetchVideos,
} from "@/src/rag/youtube/data-api";
import * as youtube from "@/src/rag/youtube/repository";

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
  /** True when the playlist is small enough to transcribe in full upfront. */
  buildEagerly: boolean;
}

/** Small playlists are processed in full; large ones wait to be asked about. */
export function shouldBuildEagerly(videoCount: number): boolean {
  return videoCount <= ragConfig.youtube.eagerBuildMaxVideos;
}

/**
 * Build the playlist-level index: the playlist's own details plus one metadata
 * row per video, in curation order.
 *
 * This is the cheap half of playlist ingest — roughly one quota unit per 50
 * videos for the listing and another per 50 for the metadata — and it is all
 * that routing needs. Transcripts are built separately, and for large playlists
 * only for videos someone actually asks about.
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
    buildEagerly: shouldBuildEagerly(ingestable.length),
  };
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
