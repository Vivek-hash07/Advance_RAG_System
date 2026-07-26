import { NonRetriableError } from "inngest";

import { inngest } from "@/src/inngest/client";
import {
  playlistRefreshRequested,
  playlistRequested,
  videoRequested,
} from "@/src/inngest/events";
import { ragConfig } from "@/src/rag/config";
import * as repository from "@/src/rag/documents/repository";
import {
  listRefreshablePlaylists,
  PlaylistIngestError,
  syncPlaylist,
} from "@/src/rag/youtube/playlist-ingest";
import * as youtube from "@/src/rag/youtube/repository";

/**
 * Build a playlist's two-level index.
 *
 * The playlist-level index — one metadata row per video — is always built, and
 * it is cheap: about one quota unit per 50 videos to list them and another per
 * 50 to fetch their details, so even a 200-video playlist costs single-digit
 * quota. Transcripts are the expensive half, so only small playlists get them
 * upfront; large ones build a video's transcript the first time a question
 * actually routes to it.
 */
export const ingestYoutubePlaylist = inngest.createFunction(
  {
    id: "ingest-youtube-playlist",
    name: "Index YouTube playlist",
    triggers: { event: playlistRequested },
    concurrency: [{ key: "event.data.playlistId", limit: 1 }, { limit: 3 }],
    retries: 2,
  },
  async ({ event, step, logger }) => {
    const { playlistId, documentId } = event.data;

    logger.info("Indexing YouTube playlist", { playlistId, documentId });

    const listing = await step.run("build-playlist-index", async () => {
      try {
        return await syncPlaylist(playlistId);
      } catch (error) {
        if (error instanceof PlaylistIngestError) {
          await repository
            .updateDocumentStatus(documentId, {
              status: "failed",
              errorMessage: error.message,
            })
            .catch(() => undefined);
          throw new NonRetriableError(error.message);
        }
        throw error;
      }
    });

    logger.info("Playlist index built", {
      playlistId,
      videos: listing.videoIds.length,
      truncated: listing.truncated,
      unavailable: listing.unavailableCount,
      buildEagerly: listing.buildEagerly,
    });

    // The playlist is answerable the moment its listing exists: routing reads
    // titles and summaries, and any transcript it needs is built on demand.
    await step.run("mark-playlist-ready", () =>
      repository.updateDocumentStatus(documentId, {
        status: "ready",
        errorMessage: null,
        pageCount: listing.videoIds.length,
        name: listing.title,
      }),
    );

    if (!listing.buildEagerly) {
      logger.info(
        "Playlist is large; transcripts will be built on demand as questions route to videos",
        { playlistId, videos: listing.videoIds.length },
      );
      return {
        playlistId,
        videos: listing.videoIds.length,
        transcriptsQueued: 0,
        truncated: listing.truncated,
      };
    }

    const pending = await step.run("find-unbuilt-videos", () =>
      youtube.findUnbuiltPlaylistVideos(playlistId),
    );

    if (pending.length > 0) {
      await step.sendEvent(
        "queue-video-transcripts",
        pending.map((videoId) =>
          videoRequested.create({
            videoId,
            playlistId,
            documentId: null,
            trigger: "playlist",
          }),
        ),
      );
    }

    logger.info("Queued playlist transcripts", {
      playlistId,
      queued: pending.length,
    });

    return {
      playlistId,
      videos: listing.videoIds.length,
      transcriptsQueued: pending.length,
      truncated: listing.truncated,
    };
  },
);

/**
 * Re-list a playlist that has drifted past its refresh window.
 *
 * Playlists are mutable — channels add, remove and reorder videos — so a cached
 * listing has a shelf life. Only the structure is refreshed; transcripts of
 * videos that are still members are left alone.
 */
export const refreshYoutubePlaylist = inngest.createFunction(
  {
    id: "refresh-youtube-playlist",
    name: "Refresh YouTube playlist",
    triggers: { event: playlistRefreshRequested },
    concurrency: [{ key: "event.data.playlistId", limit: 1 }, { limit: 3 }],
    retries: 1,
  },
  async ({ event, step, logger }) => {
    const { playlistId } = event.data;

    const listing = await step.run("relist-playlist", () =>
      syncPlaylist(playlistId),
    );

    logger.info("Playlist refreshed", {
      playlistId,
      videos: listing.videoIds.length,
    });

    return { playlistId, videos: listing.videoIds.length };
  },
);

/**
 * Sweep for stale playlists and queue each for a refresh, so a playlist a user
 * keeps as a source stays in step with the channel without anyone asking.
 */
export const scheduleYoutubePlaylistRefresh = inngest.createFunction(
  {
    id: "schedule-youtube-playlist-refresh",
    name: "Sweep stale playlists",
    triggers: { cron: "0 */6 * * *" },
  },
  async ({ step, logger }) => {
    const stale = await step.run("find-stale-playlists", () =>
      listRefreshablePlaylists(),
    );

    if (stale.length === 0) {
      return { refreshed: 0 };
    }

    logger.info("Refreshing stale playlists", {
      count: stale.length,
      olderThanHours: Math.round(
        ragConfig.youtube.playlistRefreshMs / (60 * 60 * 1000),
      ),
    });

    await step.sendEvent(
      "queue-refreshes",
      stale.map((playlistId) => playlistRefreshRequested.create({ playlistId })),
    );

    return { refreshed: stale.length };
  },
);
