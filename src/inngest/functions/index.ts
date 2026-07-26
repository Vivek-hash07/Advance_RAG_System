import { ingestDocument } from "@/src/inngest/functions/ingest-document";
import {
  ingestYoutubePlaylist,
  refreshYoutubePlaylist,
  scheduleYoutubePlaylistRefresh,
} from "@/src/inngest/functions/ingest-youtube-playlist";
import { ingestYoutubeVideo } from "@/src/inngest/functions/ingest-youtube-video";

/** Everything served at `/api/inngest`. */
export const functions = [
  ingestDocument,
  ingestYoutubeVideo,
  ingestYoutubePlaylist,
  refreshYoutubePlaylist,
  scheduleYoutubePlaylistRefresh,
];

export {
  ingestDocument,
  ingestYoutubePlaylist,
  ingestYoutubeVideo,
  refreshYoutubePlaylist,
  scheduleYoutubePlaylistRefresh,
};
