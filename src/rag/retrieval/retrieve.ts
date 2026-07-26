import { inngest } from "@/src/inngest/client";
import { videoRequested } from "@/src/inngest/events";
import { ragConfig } from "@/src/rag/config";
import type { RetrievalSource } from "@/src/rag/documents/repository";
import { indexNodesById, renderOutline } from "@/src/rag/pageindex/tree";
import { reciprocalRankFusion, type RankedList } from "@/src/rag/retrieval/fusion";
import { selectRelevantNodes } from "@/src/rag/retrieval/node-selection";
import { routeToVideos } from "@/src/rag/retrieval/video-routing";
import type {
  FlatTreeNode,
  OptimizedQuery,
  PendingVideo,
  RetrievedNode,
  SelectedNode,
  SourceKind,
} from "@/src/rag/types";
import {
  findUnbuiltPlaylistVideos,
  findVideoTrees,
  loadPlaylistIndex,
} from "@/src/rag/youtube/repository";

/**
 * One searchable unit: a document with an outline the selector can reason over.
 *
 * Files and single videos map to exactly one unit. A playlist maps to one unit
 * per video that routing picked, which is what makes the two levels — playlist
 * then section — collapse back into a single ranking.
 */
interface SearchUnit {
  /** Unique within a question; the fusion key. */
  key: string;
  documentId: string;
  /** What a citation is labelled with. */
  displayName: string;
  sourceKind: SourceKind;
  videoId: string | null;
  nodes: FlatTreeNode[];
}

export interface RetrievalOutcome {
  nodes: RetrievedNode[];
  /** Videos routing wanted but whose transcripts are still being built. */
  pendingVideos: PendingVideo[];
}

/**
 * Expand a playlist into the videos this question is actually about.
 *
 * Stage one of two: skim the playlist-level index (titles, dates, one-line
 * summaries) rather than any transcript, then read only what survives. Videos
 * that routing selected but that have never been transcribed are queued here
 * and reported back — for a large playlist this is the moment a transcript
 * first gets built, so nobody pays to transcribe videos nobody asks about.
 */
async function expandPlaylist(
  source: Extract<RetrievalSource, { type: "playlist" }>,
  queries: OptimizedQuery,
): Promise<{ units: SearchUnit[]; pending: PendingVideo[] }> {
  const entries = await loadPlaylistIndex(source.playlistId);

  if (entries.length === 0) {
    return { units: [], pending: [] };
  }

  const routed = await routeToVideos(source.name, entries, queries);
  if (routed.length === 0) {
    return { units: [], pending: [] };
  }

  const byVideoId = new Map(entries.map((entry) => [entry.videoId, entry]));
  const trees = await findVideoTrees(routed.map((video) => video.videoId));

  const units: SearchUnit[] = [];
  const pending: PendingVideo[] = [];

  for (const video of routed) {
    const entry = byVideoId.get(video.videoId);
    if (!entry) continue;

    const nodes = trees.get(video.videoId);

    if (nodes?.length) {
      units.push({
        key: `${source.documentId}:${video.videoId}`,
        documentId: source.documentId,
        displayName: `${source.name} — ${entry.title}`,
        sourceKind: "playlist",
        videoId: video.videoId,
        nodes,
      });
      continue;
    }

    // Routing already excludes videos that failed to build, so anything left
    // without a tree is genuinely still on its way.
    pending.push({ videoId: video.videoId, title: entry.title });
  }

  if (pending.length > 0) {
    await queueOnDemandBuilds(source.playlistId, pending);
  }

  return { units, pending };
}

/**
 * Ask Inngest to build the transcripts a question just asked for.
 *
 * Only videos that have never been started are queued, and the video function
 * is limited to one run per video id, so repeated questions about the same
 * unbuilt video cannot pile up duplicate work.
 */
async function queueOnDemandBuilds(
  playlistId: string,
  pending: PendingVideo[],
): Promise<void> {
  try {
    const unbuilt = new Set(await findUnbuiltPlaylistVideos(playlistId));
    const toQueue = pending.filter((video) => unbuilt.has(video.videoId));

    if (toQueue.length === 0) return;

    await inngest.send(
      toQueue.map((video) =>
        videoRequested.create({
          videoId: video.videoId,
          playlistId,
          documentId: null,
          trigger: "query",
        }),
      ),
    );
  } catch (error) {
    // A failed dispatch must not fail the answer; the user simply gets the
    // sources that were already built.
    console.warn("[rag] Could not queue on-demand transcripts:", error);
  }
}

async function toSearchUnits(
  sources: RetrievalSource[],
  queries: OptimizedQuery,
): Promise<{ units: SearchUnit[]; pending: PendingVideo[] }> {
  const units: SearchUnit[] = [];
  const pending: PendingVideo[] = [];

  const playlistExpansions = await Promise.all(
    sources
      .filter((source) => source.type === "playlist")
      .map((source) => expandPlaylist(source, queries)),
  );

  for (const source of sources) {
    if (source.type === "file") {
      units.push({
        key: source.documentId,
        documentId: source.documentId,
        displayName: source.name,
        sourceKind: source.sourceKind,
        videoId: null,
        nodes: source.nodes,
      });
    }

    if (source.type === "video") {
      units.push({
        key: source.documentId,
        documentId: source.documentId,
        displayName: source.name,
        sourceKind: "youtube",
        videoId: source.videoId,
        nodes: source.nodes,
      });
    }
  }

  for (const expansion of playlistExpansions) {
    units.push(...expansion.units);
    pending.push(...expansion.pending);
  }

  return { units, pending };
}

/**
 * Select the document sections that should answer the question.
 *
 * Playlists are expanded to their relevant videos first, then every unit —
 * file, standalone video or playlist video — is searched independently by
 * reasoning over its outline. The per-unit rankings are fused with RRF and
 * trimmed to a context budget, so a playlist video competes with a PDF on equal
 * footing.
 */
export async function retrieveNodes(
  sources: RetrievalSource[],
  queries: OptimizedQuery,
): Promise<RetrievalOutcome> {
  const { units, pending } = await toSearchUnits(sources, queries);

  const searchable = units.filter((unit) => unit.nodes.length > 0);
  if (searchable.length === 0) {
    return { nodes: [], pendingVideos: pending };
  }

  const selections = await Promise.all(
    searchable.map(async (unit): Promise<RankedList<SelectedNode>> => {
      const items = await selectRelevantNodes(
        unit.displayName,
        unit.nodes,
        renderOutline(unit.nodes),
        queries,
      );

      return { key: unit.key, items };
    }),
  );

  const fused = reciprocalRankFusion(selections, (node) => node.nodeId);

  const unitsByKey = new Map(
    searchable.map((unit) => [
      unit.key,
      { unit, nodesById: indexNodesById(unit.nodes) },
    ]),
  );

  const retrieved: RetrievedNode[] = [];
  let contextChars = 0;

  for (const entry of fused) {
    if (retrieved.length >= ragConfig.retrieval.finalNodes) break;

    const bucket = unitsByKey.get(entry.sourceKey);
    const node = bucket?.nodesById.get(entry.item.nodeId);
    if (!bucket || !node) continue;

    const text = node.text.trim();
    if (!text) continue;

    // Stop once the context budget is spent, but always keep the top section.
    if (
      retrieved.length > 0 &&
      contextChars + text.length > ragConfig.retrieval.maxContextChars
    ) {
      continue;
    }
    contextChars += text.length;

    retrieved.push({
      documentId: bucket.unit.documentId,
      documentName: bucket.unit.displayName,
      sourceKind: bucket.unit.sourceKind,
      videoId: bucket.unit.videoId,
      nodeId: node.nodeId,
      title: node.title,
      pageIndex: node.pageIndex,
      path: node.path,
      text,
      reason: entry.item.reason,
      rrfScore: entry.rrfScore,
      bestRelevance: entry.item.relevance,
    });
  }

  return { nodes: retrieved, pendingVideos: pending };
}
