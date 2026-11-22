import { ragConfig } from "@/src/rag/config";
import * as repository from "@/src/rag/documents/repository";
import type { DocumentRecord } from "@/src/rag/documents/repository";
import { extractUploadText } from "@/src/rag/ingest/normalize";
import { detectSourceKind, ACCEPTED_EXTENSIONS } from "@/src/rag/ingest/source-kind";
import { assertSafePublicUrl, SsrfError } from "@/src/rag/ingest/ssrf";
import { fetchPlaylist, fetchVideo } from "@/src/rag/youtube/data-api";
import * as youtube from "@/src/rag/youtube/repository";
import {
  indexPlaylistInBackground,
  playlistIndexRunning,
  PlaylistIngestError,
  scheduleCaptionRetry,
  syncPlaylist,
} from "@/src/rag/youtube/playlist-ingest";
import {
  CAPTION_RATE_LIMIT_MESSAGE,
  captionsPaused,
} from "@/src/rag/youtube/transcript";
import { playlistUrl, resolveYoutubeUrl, videoUrl } from "@/src/rag/youtube/url";
import {
  ensureVideoIndexed,
  VideoIngestError,
} from "@/src/rag/youtube/video-ingest";
import { indexDocumentText } from "@/src/rag/vector/index-source";
import { scrapeWebpage } from "@/src/rag/ingest/webpage";
import type { IngestStatus } from "@/src/rag/types";
import {
  deleteDocumentChunks,
  deleteVideoChunks,
} from "@/src/rag/vector/qdrant";
import { describePublicError } from "@/src/lib/public-error";

export class IngestError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = "IngestError";
  }
}

export { SsrfError };

/**
 * A `watch?v=X&list=Y` link, which could reasonably mean either thing. Carries
 * both options back to the caller so the user can pick.
 */
export class AmbiguousYoutubeUrlError extends Error {
  constructor(
    readonly videoId: string,
    readonly playlistId: string,
    readonly videoTitle: string,
    readonly playlistTitle: string,
    readonly playlistItemCount: number,
  ) {
    super("That link contains both a video and a playlist.");
    this.name = "AmbiguousYoutubeUrlError";
  }
}

/**
 * Ingest an uploaded file: validate it, extract its text, and embed it before
 * returning. The source is ready when this resolves.
 */
export async function ingestUpload(
  userId: string,
  file: File,
): Promise<DocumentRecord> {
  if (file.size === 0) {
    throw new IngestError("The uploaded file is empty.");
  }

  if (file.size > ragConfig.ingest.maxFileBytes) {
    const limitMb = Math.floor(ragConfig.ingest.maxFileBytes / (1024 * 1024));
    throw new IngestError(`File is too large. The limit is ${limitMb} MB.`);
  }

  const sourceKind = detectSourceKind(file.name, file.type);
  if (!sourceKind) {
    throw new IngestError(
      `Unsupported file type. Accepted formats: ${ACCEPTED_EXTENSIONS.join(", ")}.`,
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let text: string;
  try {
    text = await extractUploadText(sourceKind, buffer, file.name);
  } catch (error) {
    throw new IngestError(
      error instanceof Error ? error.message : "Failed to read the uploaded file.",
    );
  }

  const document = await repository.createDocument({
    userId,
    name: file.name,
    sourceKind,
    contentText: text,
    status: "processing",
  });

  try {
    const indexed = await indexDocumentText({
      userId,
      documentId: document.id,
      documentName: document.name,
      sourceKind,
      sourceUrl: null,
      text,
    });

    return repository.updateDocumentStatus(document.id, {
      status: "ready",
      errorMessage: null,
      pageCount: indexed.pageCount,
      chunkCount: indexed.chunkCount,
    });
  } catch (error) {
    const message = describePublicError(error, "Failed to embed this document.");
    await repository.updateDocumentStatus(document.id, {
      status: "failed",
      errorMessage: message,
    });
    throw new IngestError(message);
  }
}

/**
 * Scrape a public webpage and embed it before returning.
 *
 * SSRF checks run before the row is created so bad URLs never enter the library.
 */
export async function ingestWebpageUrl(
  userId: string,
  rawUrl: string,
): Promise<DocumentRecord> {
  let safeUrl: URL;
  try {
    safeUrl = await assertSafePublicUrl(rawUrl);
  } catch (error) {
    throw new IngestError(
      error instanceof Error ? error.message : "Invalid webpage URL.",
    );
  }

  const existing = await repository.findDocumentBySourceUrl(
    userId,
    safeUrl.href,
    "webpage",
  );
  if (existing && existing.status !== "failed") {
    return existing;
  }

  const document =
    existing ??
    (await repository.createDocument({
      userId,
      name: safeUrl.hostname.replace(/^www\./, "") || safeUrl.href,
      sourceKind: "webpage",
      sourceUrl: safeUrl.href,
      status: "queued",
    }));

  if (existing?.status === "failed") {
    await repository.updateDocumentStatus(existing.id, {
      status: "processing",
      errorMessage: null,
    });
  }

  try {
    const { scraped } = await scrapeWebpage(safeUrl.href);
    const indexed = await indexDocumentText({
      userId,
      documentId: document.id,
      documentName: scraped.title,
      sourceKind: "webpage",
      sourceUrl: scraped.finalUrl,
      text: `# ${scraped.title}\n\nSource: ${scraped.finalUrl}\n\n${scraped.text}`,
    });

    return repository.updateDocumentStatus(document.id, {
      status: "ready",
      name: scraped.title,
      sourceUrl: scraped.finalUrl,
      errorMessage: null,
      chunkCount: indexed.chunkCount,
      pageCount: indexed.pageCount,
    });
  } catch (error) {
    const message = describePublicError(error, "Webpage scrape failed.");
    await repository.updateDocumentStatus(document.id, {
      status: "failed",
      errorMessage: message,
    });
    throw new IngestError(message);
  }
}

/**
 * Ingest a YouTube link.
 *
 * Metadata, transcripts, and playlist listings are fetched in this request, so
 * a bad link fails immediately and a good one is searchable when this returns.
 */
export async function ingestYoutubeUrl(
  userId: string,
  url: string,
  preference?: "video" | "playlist",
): Promise<DocumentRecord> {
  const target = resolveYoutubeUrl(url, preference);

  if (target.kind === "ambiguous") {
    const [video, playlist] = await Promise.all([
      fetchVideo(target.videoId),
      fetchPlaylist(target.playlistId),
    ]);

    throw new AmbiguousYoutubeUrlError(
      target.videoId,
      target.playlistId,
      video?.title ?? "this video",
      playlist?.title ?? "this playlist",
      playlist?.itemCount ?? 0,
    );
  }

  return target.kind === "video"
    ? ingestYoutubeVideo(userId, target.videoId)
    : ingestYoutubePlaylist(userId, target.playlistId);
}

async function ingestYoutubeVideo(
  userId: string,
  videoId: string,
): Promise<DocumentRecord> {
  const metadata = await fetchVideo(videoId);

  if (!metadata) {
    throw new IngestError(
      "That video does not exist, or is private or region blocked.",
      404,
    );
  }

  if (metadata.isLive) {
    throw new IngestError(
      "That is a live or upcoming stream. Add it once the broadcast has ended and its captions are final.",
    );
  }

  const video = await youtube.upsertVideo(metadata);

  const existing = await repository.findDocumentByRelation(userId, {
    youtubeVideoId: video.id,
  });

  if (existing?.status === "ready") {
    return existing;
  }

  // Adding the link again retries a source that failed. Return the updated row
  // so the sidebar does not keep showing the old failure.
  const document = existing
    ? await repository.updateDocumentStatus(existing.id, {
        status: "processing",
        errorMessage: null,
      })
    : await repository.createDocument({
        userId,
        name: metadata.title,
        sourceKind: "youtube",
        sourceUrl: videoUrl(videoId),
        youtubeVideoId: video.id,
      });

  try {
    const indexed = await ensureVideoIndexed(videoId);
    if (!indexed) {
      const videoRecord = await youtube.findVideo(videoId);
      throw new VideoIngestError(
        videoRecord?.errorMessage ?? "Could not index this video.",
      );
    }
  } catch (error) {
    const message = describePublicError(error, "Could not index this video.");
    await repository.updateDocumentStatus(document.id, {
      status: "failed",
      errorMessage: message,
    });
    throw new IngestError(message);
  }

  return repository.updateDocumentStatus(document.id, {
    status: "ready",
    errorMessage: null,
    name: metadata.title,
  });
}

async function ingestYoutubePlaylist(
  userId: string,
  playlistId: string,
): Promise<DocumentRecord> {
  const metadata = await fetchPlaylist(playlistId);

  if (!metadata) {
    throw new IngestError("That playlist does not exist or is not public.", 404);
  }

  const playlist = await youtube.upsertPlaylist({
    playlistId,
    title: metadata.title,
    description: metadata.description,
    channelTitle: metadata.channelTitle,
    itemCount: metadata.itemCount,
    truncated: false,
    unavailableCount: 0,
  });

  const existing = await repository.findDocumentByRelation(userId, {
    youtubePlaylistId: playlist.id,
  });

  // Re-adding a playlist is how a user forces a re-listing, so an existing row
  // is always re-queued rather than returned as-is.
  const document = existing
    ? await repository.updateDocumentStatus(existing.id, {
        status: "processing",
        errorMessage: null,
      })
    : await repository.createDocument({
        userId,
        name: metadata.title,
        sourceKind: "playlist",
        sourceUrl: playlistUrl(playlistId),
        youtubePlaylistId: playlist.id,
      });

  try {
    const listing = await syncPlaylist(playlistId);
    await indexPlaylistInBackground(playlistId);

    return repository.updateDocumentStatus(document.id, {
      status: "ready",
      errorMessage: null,
      pageCount: listing.videoIds.length,
      name: listing.title,
    });
  } catch (error) {
    const message =
      error instanceof PlaylistIngestError
        ? error.message
        : describePublicError(error, "Could not index this playlist.");
    await repository.updateDocumentStatus(document.id, {
      status: "failed",
      errorMessage: message,
    });
    throw new IngestError(message);
  }
}

/**
 * Bring a source's status up to date.
 *
 * File and webpage rows are finished before the upload returns. YouTube sources
 * mirror the shared video or playlist records.
 */
export async function syncDocument(
  document: DocumentRecord,
): Promise<DocumentRecord> {
  if (document.sourceKind === "youtube") {
    return syncVideoDocument(document);
  }

  if (document.sourceKind === "playlist") {
    return syncPlaylistDocument(document);
  }

  return document;
}

async function syncVideoDocument(
  document: DocumentRecord,
): Promise<DocumentRecord> {
  if (!document.youtubeVideoId) return document;

  const video = await youtube.findVideoByRowId(document.youtubeVideoId);
  if (!video) return document;

  const status: IngestStatus =
    video.transcriptStatus === "ready"
      ? "ready"
      : video.transcriptStatus === "failed"
        ? "failed"
        : "processing";

  if (status === document.status && document.name === video.title) {
    return document;
  }

  return repository.updateDocumentStatus(document.id, {
    status,
    errorMessage: status === "failed" ? video.errorMessage : null,
    name: video.title,
  });
}

async function syncPlaylistDocument(
  document: DocumentRecord,
): Promise<DocumentRecord> {
  if (!document.youtubePlaylistId) return document;

  const summary = await youtube.summarizePlaylistProgress(
    document.youtubePlaylistId,
  );

  // A 429 means stop calling YouTube. The playlist stays ready, the failed
  // videos stay listed, and one retry is scheduled after the quiet period.
  const playlist = await youtube.findPlaylistByRowId(document.youtubePlaylistId);
  const running = playlist
    ? playlistIndexRunning(playlist.playlistId)
    : false;

  if (playlist && captionsPaused()) {
    await youtube.releaseProcessingVideos(
      playlist.playlistId,
      CAPTION_RATE_LIMIT_MESSAGE,
    );
    scheduleCaptionRetry(playlist.playlistId);
  }

  const unbuilt =
    playlist && !captionsPaused() && !running
      ? await youtube.findUnbuiltPlaylistVideos(playlist.playlistId)
      : [];

  if (unbuilt.length > 0 && playlist) {
    void indexPlaylistInBackground(playlist.playlistId);
  }

  const status: IngestStatus =
    summary.totalVideos === 0
      ? document.status
      : running || unbuilt.length > 0
        ? "processing"
        : "ready";

  if (status === document.status && document.pageCount === summary.totalVideos) {
    return document;
  }

  return repository.updateDocumentStatus(document.id, {
    status,
    errorMessage: null,
    pageCount: summary.totalVideos,
  });
}

export async function listUserDocuments(
  userId: string,
): Promise<DocumentRecord[]> {
  const documents = await repository.listDocuments(userId);

  // Advance any in-flight documents so the UI reflects real progress on refresh.
  return Promise.all(
    documents.map((document) =>
      document.status === "ready" && document.sourceKind !== "playlist"
        ? document
        : document.status === "failed"
          ? document
          : syncDocument(document),
    ),
  );
}

export async function getUserDocument(
  userId: string,
  documentId: string,
): Promise<DocumentRecord | null> {
  return repository.findDocument(userId, documentId);
}

/**
 * Remove a source.
 *
 * YouTube content is cached globally, so the shared video or playlist is only
 * torn down once nothing else points at it — otherwise removing one user's copy
 * of a video would delete a transcript another user is still querying.
 */
export async function removeUserDocument(
  userId: string,
  documentId: string,
): Promise<boolean> {
  const document = await repository.findDocument(userId, documentId);
  if (!document) {
    return false;
  }

  const ownedChunks =
    document.sourceKind !== "youtube" && document.sourceKind !== "playlist";

  if (ownedChunks) {
    await deleteDocumentChunks(document.id);
  }

  await repository.deleteDocument(document.id);

  if (document.youtubeVideoId) {
    await releaseVideo(document.youtubeVideoId);
  }

  if (document.youtubePlaylistId) {
    await releasePlaylist(document.youtubePlaylistId);
  }

  return true;
}

async function releaseVideo(videoRowId: string): Promise<void> {
  const stillReferenced =
    (await repository.countDocumentsForVideo(videoRowId)) > 0 ||
    (await youtube.countPlaylistsForVideo(videoRowId)) > 0;

  if (stillReferenced) return;

  const videoId = await youtube.deleteVideoByRowId(videoRowId);
  if (videoId) {
    await deleteVideoChunks(videoId);
  }
}

async function releasePlaylist(playlistRowId: string): Promise<void> {
  if ((await repository.countDocumentsForPlaylist(playlistRowId)) > 0) {
    return;
  }

  const orphanedVideoIds = await youtube.findOrphanedPlaylistVideoIds(playlistRowId);

  await youtube.deletePlaylistByRowId(playlistRowId);

  for (const videoId of orphanedVideoIds) {
    await deleteVideoChunks(videoId);
  }
}
