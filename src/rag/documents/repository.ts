import { Prisma } from "@/src/generated/prisma/client";
import { prisma } from "@/src/lib/db";
import type { FlatTreeNode, IngestStatus, SourceKind } from "@/src/rag/types";
import {
  listFailedPlaylistVideos,
  type FailedPlaylistVideo,
} from "@/src/rag/youtube/repository";

/** Playlist honesty fields surfaced to the UI. */
export interface PlaylistHonesty {
  truncated: boolean;
  unavailableCount: number;
  failedCount: number;
  failedVideos: FailedPlaylistVideo[];
}

/** A document as the API and UI consume it, with stored strings narrowed. */
export interface DocumentRecord {
  id: string;
  name: string;
  sourceKind: SourceKind;
  pageIndexDocId: string | null;
  sourceUrl: string | null;
  status: IngestStatus;
  errorMessage: string | null;
  pageCount: number | null;
  chunkCount: number;
  hasTree: boolean;
  youtubeVideoId: string | null;
  youtubePlaylistId: string | null;
  playlistHonesty: PlaylistHonesty | null;
  createdAt: string;
}

type DocumentRow = {
  id: string;
  name: string;
  sourceKind: string;
  pageIndexDocId: string | null;
  sourceUrl: string | null;
  status: string;
  errorMessage: string | null;
  pageCount: number | null;
  chunkCount: number;
  tree: Prisma.JsonValue | null;
  youtubeVideoId: string | null;
  youtubePlaylistId: string | null;
  createdAt: Date;
  youtubePlaylist?: {
    truncated: boolean;
    unavailableCount: number;
  } | null;
};

const SELECT = {
  id: true,
  name: true,
  sourceKind: true,
  pageIndexDocId: true,
  sourceUrl: true,
  status: true,
  errorMessage: true,
  pageCount: true,
  chunkCount: true,
  tree: true,
  youtubeVideoId: true,
  youtubePlaylistId: true,
  createdAt: true,
  youtubePlaylist: {
    select: {
      truncated: true,
      unavailableCount: true,
    },
  },
} as const;

function toRecord(
  row: DocumentRow,
  playlistHonesty: PlaylistHonesty | null = null,
): DocumentRecord {
  return {
    id: row.id,
    name: row.name,
    sourceKind: row.sourceKind as SourceKind,
    pageIndexDocId: row.pageIndexDocId,
    sourceUrl: row.sourceUrl,
    status: row.status as IngestStatus,
    errorMessage: row.errorMessage,
    pageCount: row.pageCount,
    chunkCount: row.chunkCount,
    hasTree: row.chunkCount > 0 || row.tree !== null,
    youtubeVideoId: row.youtubeVideoId,
    youtubePlaylistId: row.youtubePlaylistId,
    playlistHonesty,
    createdAt: row.createdAt.toISOString(),
  };
}

async function withPlaylistHonesty(
  rows: DocumentRow[],
): Promise<DocumentRecord[]> {
  return Promise.all(
    rows.map(async (row) => {
      if (!row.youtubePlaylistId || !row.youtubePlaylist) {
        return toRecord(row, null);
      }

      const failedVideos = await listFailedPlaylistVideos(row.youtubePlaylistId);
      return toRecord(row, {
        truncated: row.youtubePlaylist.truncated,
        unavailableCount: row.youtubePlaylist.unavailableCount,
        failedCount: failedVideos.length,
        failedVideos,
      });
    }),
  );
}

export async function createDocument(input: {
  userId: string;
  name: string;
  sourceKind: SourceKind;
  pageIndexDocId?: string | null;
  sourceUrl?: string | null;
  youtubeVideoId?: string | null;
  youtubePlaylistId?: string | null;
  contentText?: string | null;
  status?: IngestStatus;
}): Promise<DocumentRecord> {
  const { status = "processing", ...rest } = input;

  const row = await prisma.document.create({
    data: { ...rest, status },
    select: SELECT,
  });

  const [record] = await withPlaylistHonesty([row]);
  return record;
}

/**
 * Find an existing source for the same link so re-adding a video or playlist
 * reuses the row instead of stacking duplicates in the sidebar.
 */
export async function findDocumentByRelation(
  userId: string,
  relation: { youtubeVideoId?: string; youtubePlaylistId?: string },
): Promise<DocumentRecord | null> {
  const row = await prisma.document.findFirst({
    where: { userId, ...relation },
    select: SELECT,
  });

  if (!row) return null;
  const [record] = await withPlaylistHonesty([row]);
  return record;
}

/** Reuse a webpage source when the user pastes the same URL again. */
export async function findDocumentBySourceUrl(
  userId: string,
  sourceUrl: string,
  sourceKind: SourceKind,
): Promise<DocumentRecord | null> {
  const row = await prisma.document.findFirst({
    where: { userId, sourceUrl, sourceKind },
    select: SELECT,
  });

  if (!row) return null;
  const [record] = await withPlaylistHonesty([row]);
  return record;
}

export async function listDocuments(userId: string): Promise<DocumentRecord[]> {
  const rows = await prisma.document.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: SELECT,
  });

  return withPlaylistHonesty(rows);
}

export async function findDocument(
  userId: string,
  documentId: string,
): Promise<DocumentRecord | null> {
  const row = await prisma.document.findFirst({
    where: { id: documentId, userId },
    select: SELECT,
  });

  if (!row) return null;
  const [record] = await withPlaylistHonesty([row]);
  return record;
}

/** An uploaded file or webpage, searched through its Qdrant chunks. */
export interface FileSource {
  type: "file";
  documentId: string;
  name: string;
  sourceKind: SourceKind;
  sourceUrl: string | null;
  chunkCount: number;
  /** Legacy tree, present only until those nodes have been embedded. */
  backfillNodes: FlatTreeNode[];
}

/** A single YouTube video, whose chunks live on the shared video record. */
export interface VideoSource {
  type: "video";
  documentId: string;
  name: string;
  videoId: string;
  chunkCount: number;
  backfillNodes: FlatTreeNode[];
}

/**
 * A playlist. No tree of its own: retrieval routes to videos first, then reads
 * the selected videos' trees.
 */
export interface PlaylistSource {
  type: "playlist";
  documentId: string;
  name: string;
  playlistId: string;
}

export type RetrievalSource = FileSource | VideoSource | PlaylistSource;

function toNodes(tree: Prisma.JsonValue | null): FlatTreeNode[] {
  return Array.isArray(tree) ? (tree as unknown as FlatTreeNode[]) : [];
}

/**
 * Everything the user can be asked questions about, newest first.
 *
 * Files, webpages and single videos are searchable once they are ready.
 * Playlists arrive as a pointer, because which of their videos to read is a
 * decision the retrieval stage makes per question.
 */
export async function findRetrievableSources(
  userId: string,
  documentIds?: string[],
): Promise<RetrievalSource[]> {
  const rows = await prisma.document.findMany({
    where: {
      userId,
      status: "ready",
      ...(documentIds?.length ? { id: { in: documentIds } } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      sourceKind: true,
      sourceUrl: true,
      chunkCount: true,
      tree: true,
      youtubeVideo: {
        select: {
          videoId: true,
          tree: true,
          transcriptStatus: true,
          chunkCount: true,
        },
      },
      youtubePlaylist: { select: { playlistId: true } },
    },
  });

  const sources: RetrievalSource[] = [];

  for (const row of rows) {
    if (row.youtubePlaylist) {
      sources.push({
        type: "playlist",
        documentId: row.id,
        name: row.name,
        playlistId: row.youtubePlaylist.playlistId,
      });
      continue;
    }

    if (row.youtubeVideo) {
      if (row.youtubeVideo.transcriptStatus !== "ready") continue;

      const chunkCount = row.youtubeVideo.chunkCount;
      sources.push({
        type: "video",
        documentId: row.id,
        name: row.name,
        videoId: row.youtubeVideo.videoId,
        chunkCount,
        backfillNodes: chunkCount > 0 ? [] : toNodes(row.youtubeVideo.tree),
      });
      continue;
    }

    sources.push({
      type: "file",
      documentId: row.id,
      name: row.name,
      sourceKind: row.sourceKind as SourceKind,
      sourceUrl: row.sourceUrl,
      chunkCount: row.chunkCount,
      backfillNodes: row.chunkCount > 0 ? [] : toNodes(row.tree),
    });
  }

  return sources;
}

export async function updateDocumentStatus(
  documentId: string,
  data: {
    status: IngestStatus;
    errorMessage?: string | null;
    pageCount?: number | null;
    chunkCount?: number;
    nodes?: FlatTreeNode[];
    clearTree?: boolean;
    name?: string;
    pageIndexDocId?: string | null;
    sourceUrl?: string | null;
  },
): Promise<DocumentRecord> {
  const row = await prisma.document.update({
    where: { id: documentId },
    data: {
      status: data.status,
      errorMessage: data.errorMessage ?? null,
      ...(data.name === undefined ? {} : { name: data.name }),
      ...(data.pageCount === undefined ? {} : { pageCount: data.pageCount }),
      ...(data.chunkCount === undefined ? {} : { chunkCount: data.chunkCount }),
      ...(data.pageIndexDocId === undefined
        ? {}
        : { pageIndexDocId: data.pageIndexDocId }),
      ...(data.sourceUrl === undefined ? {} : { sourceUrl: data.sourceUrl }),
      ...(data.clearTree ? { tree: Prisma.DbNull } : {}),
      ...(data.nodes === undefined || data.clearTree
        ? {}
        : { tree: data.nodes as unknown as Prisma.InputJsonValue }),
    },
    select: SELECT,
  });

  const [record] = await withPlaylistHonesty([row]);
  return record;
}

export async function findDocumentById(
  documentId: string,
): Promise<DocumentRecord | null> {
  const row = await prisma.document.findUnique({
    where: { id: documentId },
    select: SELECT,
  });

  if (!row) return null;
  const [record] = await withPlaylistHonesty([row]);
  return record;
}

export async function getDocumentContent(documentId: string): Promise<{
  id: string;
  userId: string;
  name: string;
  sourceKind: SourceKind;
  sourceUrl: string | null;
  contentText: string | null;
  chunkCount: number;
} | null> {
  return prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      userId: true,
      name: true,
      sourceKind: true,
      sourceUrl: true,
      contentText: true,
      chunkCount: true,
    },
  }) as Promise<{
    id: string;
    userId: string;
    name: string;
    sourceKind: SourceKind;
    sourceUrl: string | null;
    contentText: string | null;
    chunkCount: number;
  } | null>;
}

export async function deleteDocument(documentId: string): Promise<void> {
  await prisma.document.delete({ where: { id: documentId } });
}

/** True once nothing references the playlist, so its cache can be dropped. */
export async function countDocumentsForPlaylist(
  playlistRowId: string,
): Promise<number> {
  return prisma.document.count({ where: { youtubePlaylistId: playlistRowId } });
}

export async function countDocumentsForVideo(
  videoRowId: string,
): Promise<number> {
  return prisma.document.count({ where: { youtubeVideoId: videoRowId } });
}
