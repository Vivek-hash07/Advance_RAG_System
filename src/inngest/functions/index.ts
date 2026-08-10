import { ingestDocument } from "@/src/inngest/functions/ingest-document";
import { ingestWebpage } from "@/src/inngest/functions/ingest-webpage";
import {
  ingestYoutubePlaylist,
  refreshYoutubePlaylist,
  scheduleYoutubePlaylistRefresh,
} from "@/src/inngest/functions/ingest-youtube-playlist";
import { ingestYoutubeVideo } from "@/src/inngest/functions/ingest-youtube-video";

/** Everything served at `/api/inngest`. */
export const functions = [
  ingestDocument,
  ingestWebpage,
  ingestYoutubeVideo,
  ingestYoutubePlaylist,
  refreshYoutubePlaylist,
  scheduleYoutubePlaylistRefresh,
];

export {
  ingestDocument,
  ingestWebpage,
  ingestYoutubePlaylist,
  ingestYoutubeVideo,
  refreshYoutubePlaylist,
  scheduleYoutubePlaylistRefresh,
};
