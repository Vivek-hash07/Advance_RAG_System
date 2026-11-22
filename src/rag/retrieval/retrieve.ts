import { ragConfig } from "@/src/rag/config";
import type { RetrievalSource } from "@/src/rag/documents/repository";
import { selectRelevantSources } from "@/src/rag/retrieval/source-routing";
import type {
  OptimizedQuery,
  PendingVideo,
  RetrievedNode,
  SourceKind,
} from "@/src/rag/types";
import { ensureFileVectors, ensureVideoVectors } from "@/src/rag/vector/ensure";
import { searchChunks, type StoredChunk } from "@/src/rag/vector/qdrant";
import {
  indexPlaylistInBackground,
  isPlaylistStale,
  syncPlaylist,
} from "@/src/rag/youtube/playlist-ingest";
import {
  loadPlaylistIndex,
  type PlaylistIndexEntry,
} from "@/src/rag/youtube/repository";

interface HitLabel {
  documentId: string;
  documentName: string;
  sourceKind: SourceKind;
  videoId: string | null;
  sourceUrl: string | null;
}

export interface RetrievalOutcome {
  nodes: RetrievedNode[];
  pendingVideos: PendingVideo[];
}

function playlistCatalog(
  source: Extract<RetrievalSource, { type: "playlist" }>,
  entries: PlaylistIndexEntry[],
): RetrievedNode {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const name = entry.channelTitle.trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const channel =
    [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ??
    "Unknown";

  const lines = entries.map(
    (entry) => `${entry.position + 1}. ${entry.title}`,
  );

  return {
    documentId: source.documentId,
    documentName: source.name,
    sourceKind: "playlist",
    videoId: null,
    sourceUrl: null,
    nodeId: `playlist:${source.playlistId}:catalog`,
    title: "Playlist overview",
    pageIndex: null,
    path: [],
    text: [
      `Playlist: ${source.name}`,
      `Author / channel: ${channel}`,
      `Videos in the creator's order (${entries.length}):`,
      ...lines,
    ].join("\n"),
    reason: "Playlist catalog: author and series order.",
    rrfScore: 1,
    bestRelevance: 1,
  };
}

async function expandPlaylist(
  source: Extract<RetrievalSource, { type: "playlist" }>,
  labels: Map<string, HitLabel>,
  videoIds: Set<string>,
): Promise<{ catalog: RetrievedNode | null; pending: PendingVideo[] }> {
  if (await isPlaylistStale(source.playlistId)) {
    await syncPlaylist(source.playlistId).catch((error) => {
      console.warn(`[rag] Could not refresh playlist ${source.playlistId}:`, error);
    });
  }

  const entries = await loadPlaylistIndex(source.playlistId);
  if (entries.length === 0) return { catalog: null, pending: [] };

  const pending: PendingVideo[] = [];
  const readyIds: string[] = [];

  for (const entry of entries) {
    if (entry.availability !== "available") continue;

    if (entry.transcriptStatus === "ready") {
      readyIds.push(entry.videoId);
      labels.set(`video:${entry.videoId}`, {
        documentId: source.documentId,
        documentName: `${source.name} — ${entry.title}`,
        sourceKind: "playlist",
        videoId: entry.videoId,
        sourceUrl: null,
      });
      continue;
    }

    if (entry.transcriptStatus === "failed") continue;
    pending.push({ videoId: entry.videoId, title: entry.title });
  }

  if (pending.length > 0) {
    void indexPlaylistInBackground(source.playlistId);
  }

  await ensureVideoVectors(readyIds);
  for (const videoId of readyIds) videoIds.add(videoId);

  return { catalog: playlistCatalog(source, entries), pending };
}

function labelFor(
  hit: StoredChunk,
  labels: Map<string, HitLabel>,
): HitLabel | null {
  if (hit.videoId) return labels.get(`video:${hit.videoId}`) ?? null;
  if (hit.documentId) return labels.get(`doc:${hit.documentId}`) ?? null;
  return null;
}

/**
 * Vector retrieval over the sources that match this question.
 *
 * A playlist contributes its catalog (author and video order) plus every
 * transcript that is already chunked. Query variants are fused with
 * reciprocal rank fusion.
 */
export async function retrieveNodes(
  userId: string,
  sources: RetrievalSource[],
  queries: OptimizedQuery,
): Promise<RetrievalOutcome> {
  const relevant = await selectRelevantSources(
    queries.original || queries.rewritten,
    sources,
  );
  await ensureFileVectors(userId, relevant);

  const labels = new Map<string, HitLabel>();
  const documentIds: string[] = [];
  const videoIds = new Set<string>();
  const pending: PendingVideo[] = [];

  for (const source of relevant) {
    if (source.type === "file") {
      if (source.chunkCount <= 0) continue;
      documentIds.push(source.documentId);
      labels.set(`doc:${source.documentId}`, {
        documentId: source.documentId,
        documentName: source.name,
        sourceKind: source.sourceKind,
        videoId: null,
        sourceUrl: source.sourceUrl,
      });
    }

    if (source.type === "video") {
      if (source.chunkCount <= 0 && source.backfillNodes.length > 0) {
        await ensureVideoVectors([source.videoId]);
        source.chunkCount = 1;
      }
      if (source.chunkCount <= 0 && source.backfillNodes.length === 0) continue;

      videoIds.add(source.videoId);
      labels.set(`video:${source.videoId}`, {
        documentId: source.documentId,
        documentName: source.name,
        sourceKind: "youtube",
        videoId: source.videoId,
        sourceUrl: null,
      });
    }
  }

  const playlists = await Promise.all(
    relevant
      .filter((source) => source.type === "playlist")
      .map((source) => expandPlaylist(source, labels, videoIds)),
  );
  const catalogs = playlists.flatMap((playlist) =>
    playlist.catalog ? [playlist.catalog] : [],
  );
  pending.push(...playlists.flatMap((playlist) => playlist.pending));

  const hits = await searchChunks(
    queries.variants.map((variant) => variant.text),
    { documentIds, videoIds: [...videoIds] },
  );

  const retrieved: RetrievedNode[] = [...catalogs];
  let contextChars = catalogs.reduce((total, node) => total + node.text.length, 0);

  for (const hit of hits) {
    if (retrieved.length >= ragConfig.retrieval.finalNodes) break;

    const label = labelFor(hit, labels);
    if (!label) continue;

    if (
      retrieved.length > 0 &&
      contextChars + hit.text.length > ragConfig.retrieval.maxContextChars
    ) {
      continue;
    }
    contextChars += hit.text.length;

    retrieved.push({
      documentId: label.documentId,
      documentName: label.documentName,
      sourceKind: label.sourceKind,
      videoId: label.videoId,
      sourceUrl: label.sourceUrl ?? hit.sourceUrl,
      nodeId: hit.id,
      title: hit.title,
      pageIndex: hit.pageIndex,
      path: hit.path,
      text: hit.text,
      reason: "Matched by semantic search.",
      rrfScore: hit.rrfScore,
      bestRelevance: hit.score,
    });
  }

  return { nodes: retrieved, pendingVideos: pending };
}
