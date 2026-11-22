import type { RetrievalSource } from "@/src/rag/documents/repository";
import {
  getDocumentContent,
  updateDocumentStatus,
} from "@/src/rag/documents/repository";
import { indexDocumentText, indexTreeNodes } from "@/src/rag/vector/index-source";
import { videoUrl } from "@/src/rag/youtube/url";
import {
  findVideosNeedingVectors,
  updateVideoTranscript,
} from "@/src/rag/youtube/repository";

/**
 * Embed sources that were stored before Qdrant was the index.
 *
 * New uploads already have chunkCount set. Older rows may still hold a
 * PageIndex tree or extracted text; the first question copies that into Qdrant.
 */
export async function ensureFileVectors(
  userId: string,
  sources: RetrievalSource[],
): Promise<void> {
  for (const source of sources) {
    if (source.type !== "file" || source.chunkCount > 0) continue;

    try {
      const content = await getDocumentContent(source.documentId);
      const indexed = content?.contentText?.trim()
        ? await indexDocumentText({
            userId,
            documentId: source.documentId,
            documentName: source.name,
            sourceKind: source.sourceKind,
            sourceUrl: source.sourceUrl,
            text: content.contentText,
          })
        : null;

      const chunkCount =
        indexed?.chunkCount ??
        (source.backfillNodes.length > 0
          ? await indexTreeNodes({
              userId,
              documentId: source.documentId,
              videoId: null,
              documentName: source.name,
              sourceKind: source.sourceKind,
              sourceUrl: source.sourceUrl,
              nodes: source.backfillNodes,
            })
          : 0);

      if (chunkCount > 0) {
        await updateDocumentStatus(source.documentId, {
          status: "ready",
          chunkCount,
          clearTree: true,
        });
        source.chunkCount = chunkCount;
      }
    } catch (error) {
      console.warn(`[rag] Could not embed source ${source.documentId}:`, error);
    }
  }
}

export async function ensureVideoVectors(videoIds: string[]): Promise<void> {
  const pending = await findVideosNeedingVectors(videoIds);

  for (const video of pending) {
    try {
      const chunkCount = await indexTreeNodes({
        userId: null,
        documentId: null,
        videoId: video.videoId,
        documentName: video.title,
        sourceKind: "youtube",
        sourceUrl: videoUrl(video.videoId),
        nodes: video.nodes,
      });

      if (chunkCount > 0) {
        await updateVideoTranscript(video.videoId, {
          transcriptStatus: "ready",
          chunkCount,
          clearTree: true,
          errorMessage: null,
        });
      }
    } catch (error) {
      console.warn(`[rag] Could not embed video ${video.videoId}:`, error);
    }
  }
}
