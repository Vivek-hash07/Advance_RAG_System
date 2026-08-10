import { eventType } from "inngest";
import { z } from "zod";

/**
 * Every ingest event the app emits.
 *
 * Each carries only identifiers, never file contents or transcripts: payloads
 * are persisted in the Inngest run history, so keeping them small keeps traces
 * readable and avoids storing megabytes of document text in the event log.
 */

/** A file has been handed to PageIndex and its tree needs collecting. */
export const documentSubmitted = eventType("rag/document.submitted", {
  schema: z.object({
    documentId: z.string(),
    /** Included purely so runs are searchable by source name in the dashboard. */
    name: z.string(),
    sourceKind: z.string(),
  }),
});

/** A single YouTube video should be transcribed and indexed. */
export const videoRequested = eventType("rag/youtube.video.requested", {
  schema: z.object({
    videoId: z.string(),
    /** Set when a user source is waiting on this video; absent for playlist fan-out. */
    documentId: z.string().nullish(),
    /** Playlist that pulled this video in, for trace context. */
    playlistId: z.string().nullish(),
    /** Where the request came from, so on-demand builds are recognisable in traces. */
    trigger: z.enum(["source", "playlist", "query"]),
  }),
});

/** A playlist should be listed and its playlist-level index built. */
export const playlistRequested = eventType("rag/youtube.playlist.requested", {
  schema: z.object({
    playlistId: z.string(),
    documentId: z.string(),
  }),
});

/** Periodic re-listing, because playlists gain, lose and reorder videos. */
export const playlistRefreshRequested = eventType(
  "rag/youtube.playlist.refresh",
  { schema: z.object({ playlistId: z.string() }) },
);

/** A webpage URL should be scraped (Scrapling) and submitted to PageIndex. */
export const webpageRequested = eventType("rag/webpage.requested", {
  schema: z.object({
    documentId: z.string(),
    url: z.string(),
  }),
});
