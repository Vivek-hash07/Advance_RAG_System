import { inngest } from "@/src/inngest/client";
import {
  documentSubmitted,
  playlistRequested,
  videoRequested,
  webpageRequested,
} from "@/src/inngest/events";
import { ragConfig } from "@/src/rag/config";
import * as repository from "@/src/rag/documents/repository";
import type { DocumentRecord } from "@/src/rag/documents/repository";
import { normalizeUpload } from "@/src/rag/ingest/normalize";
import { detectSourceKind, ACCEPTED_EXTENSIONS } from "@/src/rag/ingest/source-kind";
import { assertSafePublicUrl, SsrfError } from "@/src/rag/ingest/ssrf";
import {
  deletePageIndexDocument,
  fetchTree,
  submitPdf,
  type TreeState,
} from "@/src/rag/pageindex/documents";
import { flattenTree } from "@/src/rag/pageindex/tree";
import { fetchPlaylist, fetchVideo } from "@/src/rag/youtube/data-api";
import * as youtube from "@/src/rag/youtube/repository";
import { playlistUrl, resolveYoutubeUrl, videoUrl } from "@/src/rag/youtube/url";
import type { IngestStatus } from "@/src/rag/types";

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
 * Ingest an uploaded file: validate it, convert it to PDF if needed, hand it to
 * PageIndex for tree generation, and record it against the user.
 *
 * Returns as soon as PageIndex accepts the document. Tree generation takes
 * minutes, so an Inngest run takes over from here and the caller gets a row it
 * can show immediately.
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

  let normalized;
  try {
    normalized = await normalizeUpload(sourceKind, buffer, file.name);
  } catch (error) {
    throw new IngestError(
      error instanceof Error ? error.message : "Failed to read the uploaded file.",
    );
  }

  const pageIndexDocId = await submitPdf(normalized.pdf, normalized.pdfFileName);

  const document = await repository.createDocument({
    userId,
    name: file.name,
    sourceKind,
    pageIndexDocId,
  });

  await inngest.send(
    documentSubmitted.create({
      documentId: document.id,
      name: document.name,
      sourceKind,
    }),
  );

  return document;
}

/**
 * Queue a webpage for Scrapling scrape → PDF → PageIndex.
 *
 * SSRF checks run before the row is created so bad URLs never enter the queue.
 * The slow fetch happens in Inngest; the caller gets a queued row immediately.
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
      status: "queued",
      errorMessage: null,
    });
  }

  await inngest.send(
    webpageRequested.create({
      documentId: document.id,
      url: safeUrl.href,
    }),
  );

  return repository.findDocument(userId, document.id).then(
    (row) => row ?? document,
  );
}

/**
 * Ingest a YouTube link.
 *
 * Metadata is fetched inline — it is one cheap quota unit and it means a bad
 * link fails immediately with a useful message instead of failing silently in a
 * background run. Everything expensive (transcripts, playlist listing, tree
 * generation) is handed to Inngest.
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

  // Anything not yet ready is re-queued, so adding the link again is also how a
  // user retries a source whose run failed or was interrupted. The updated row
  // is what gets returned — the caller renders this, and the stale copy would
  // leave a re-queued source showing as failed.
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

  await inngest.send(
    videoRequested.create({
      videoId,
      documentId: document.id,
      trigger: "source",
    }),
  );

  return document;
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

  await inngest.send(
    playlistRequested.create({ playlistId, documentId: document.id }),
  );

  return document;
}

/**
 * Advance an uploaded file's PageIndex job by one poll.
 *
 * Kept idempotent and side-effect-light so an Inngest step can call it
 * repeatedly, and so the status endpoint can call it as a fallback if a run is
 * lost.
 */
export async function pollDocumentTree(
  document: DocumentRecord,
): Promise<DocumentRecord> {
  if (!document.pageIndexDocId) {
    return document;
  }

  if (document.status === "ready" && document.hasTree) {
    return document;
  }

  if (document.status === "failed") {
    return document;
  }

  let state: TreeState;
  try {
    state = await fetchTree(document.pageIndexDocId);
  } catch (error) {
    // Rate limits and transient network faults must not condemn the document.
    // Leave it pending so the next poll retries.
    console.warn(`[rag] Could not refresh document ${document.id}:`, error);
    return document;
  }

  if (state.status === "failed") {
    return repository.updateDocumentStatus(document.id, {
      status: "failed",
      errorMessage: "PageIndex could not process this document.",
    });
  }

  if (state.status !== "ready" || !state.tree) {
    // PageIndex can report completion a moment before the tree is retrievable,
    // so hold the document at "processing" until the tree actually arrives.
    const status = state.status === "ready" ? "processing" : state.status;

    return status === document.status
      ? document
      : repository.updateDocumentStatus(document.id, {
          status,
          errorMessage: null,
        });
  }

  const nodes = flattenTree(state.tree);

  if (nodes.length === 0) {
    return repository.updateDocumentStatus(document.id, {
      status: "failed",
      errorMessage: "PageIndex returned an empty document structure.",
    });
  }

  const pages = nodes
    .map((node) => node.pageIndex)
    .filter((page): page is number => page !== null);

  return repository.updateDocumentStatus(document.id, {
    status: "ready",
    errorMessage: null,
    pageCount: pages.length > 0 ? Math.max(...pages) : null,
    nodes,
  });
}

/**
 * Bring a source's status up to date.
 *
 * YouTube sources mirror the shared video or playlist records that the Inngest
 * runs write, so a lost or delayed run still surfaces correctly on refresh.
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

  return pollDocumentTree(document);
}

async function syncVideoDocument(
  document: DocumentRecord,
): Promise<DocumentRecord> {
  if (!document.youtubeVideoId) return document;

  const video = await youtube.findVideoByRowId(document.youtubeVideoId);
  if (!video) return document;

  const status: IngestStatus =
    video.transcriptStatus === "ready" && video.hasTree
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

  // A playlist is answerable as soon as its video listing exists: routing reads
  // titles and summaries, and any transcript it needs is built on demand.
  const status: IngestStatus = summary.totalVideos > 0 ? "ready" : document.status;

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

  await repository.deleteDocument(document.id);

  if (document.pageIndexDocId) {
    await deletePageIndexDocument(document.pageIndexDocId);
  }

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

  const docId = await youtube.deleteVideoByRowId(videoRowId);
  if (docId) {
    await deletePageIndexDocument(docId);
  }
}

async function releasePlaylist(playlistRowId: string): Promise<void> {
  if ((await repository.countDocumentsForPlaylist(playlistRowId)) > 0) {
    return;
  }

  const orphanedDocIds = await youtube.findOrphanedPlaylistDocIds(playlistRowId);

  await youtube.deletePlaylistByRowId(playlistRowId);

  for (const docId of orphanedDocIds) {
    await deletePageIndexDocument(docId);
  }
}
