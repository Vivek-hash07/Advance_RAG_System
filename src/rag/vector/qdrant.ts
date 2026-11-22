import { QdrantClient, type Schemas } from "@qdrant/js-client-rest";

import { ragConfig, requireQdrant } from "@/src/rag/config";
import { reciprocalRankFusion } from "@/src/rag/retrieval/fusion";
import { embedQuery, embedTexts } from "@/src/rag/vector/embeddings";
import { stablePointId } from "@/src/rag/vector/ids";
import type { ChunkDraft } from "@/src/rag/vector/chunk";

type Filter = Schemas["Filter"];

export interface StoredChunk {
  id: string;
  score: number;
  rrfScore: number;
  text: string;
  title: string;
  documentName: string;
  sourceKind: string;
  path: string[];
  pageIndex: number | null;
  timestamp: string | null;
  documentId: string | null;
  videoId: string | null;
  sourceUrl: string | null;
}

const ready = new Set<string>();

let client: QdrantClient | undefined;

export function getQdrantClient(): QdrantClient {
  if (!client) {
    const { url, apiKey } = requireQdrant();
    client = new QdrantClient({ url, apiKey });
  }
  return client;
}

function vectorSize(params: unknown): number | null {
  if (!params || typeof params !== "object") return null;
  if ("size" in params && typeof params.size === "number") return params.size;
  return null;
}

async function ensurePayloadIndex(
  qdrant: QdrantClient,
  collection: string,
  field: string,
): Promise<void> {
  try {
    await qdrant.createPayloadIndex(collection, {
      field_name: field,
      field_schema: "keyword",
      wait: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/already exists|exists/i.test(message)) return;
    throw error;
  }
}

export async function ensureCollection(
  collection: string,
  fields: string[],
): Promise<void> {
  if (ready.has(collection)) return;

  const qdrant = getQdrantClient();
  const size = ragConfig.vector.dimensions;
  const existing = await qdrant.getCollections();
  const found = existing.collections.some((item) => item.name === collection);

  if (!found) {
    try {
      await qdrant.createCollection(collection, {
        vectors: { size, distance: "Cosine" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/already exists|exists/i.test(message)) throw error;
    }
  } else {
    const info = await qdrant.getCollection(collection);
    const current = vectorSize(info.config?.params?.vectors);
    if (current !== null && current !== size) {
      throw new Error(
        `Qdrant collection "${collection}" uses ${current}-dimensional vectors, but the embedding model is configured for ${size}. Set QDRANT_COLLECTION to a new name or EMBEDDING_DIMENSIONS to ${current}.`,
      );
    }
  }

  for (const field of fields) {
    await ensurePayloadIndex(qdrant, collection, field);
  }

  ready.add(collection);
}

function toPayload(chunk: ChunkDraft): Record<string, unknown> {
  return {
    text: chunk.text,
    title: chunk.title,
    documentName: chunk.documentName,
    sourceKind: chunk.sourceKind,
    path: chunk.path,
    ...(chunk.pageIndex === null ? {} : { pageIndex: chunk.pageIndex }),
    ...(chunk.timestamp ? { timestamp: chunk.timestamp } : {}),
    ...(chunk.documentId ? { documentId: chunk.documentId } : {}),
    ...(chunk.videoId ? { videoId: chunk.videoId } : {}),
    ...(chunk.userId ? { userId: chunk.userId } : {}),
    ...(chunk.sourceUrl ? { sourceUrl: chunk.sourceUrl } : {}),
  };
}

async function deleteWhere(
  collection: string,
  key: string,
  value: string,
): Promise<void> {
  const qdrant = getQdrantClient();
  await qdrant.delete(collection, {
    wait: true,
    filter: { must: [{ key, match: { value } }] },
  });
}

/** Replace every chunk for one document or one shared video. */
export async function replaceChunks(
  scope: { documentId?: string; videoId?: string },
  chunks: ChunkDraft[],
): Promise<number> {
  const collection = ragConfig.qdrant.collection;
  await ensureCollection(collection, ["documentId", "videoId", "userId"]);

  if (scope.documentId) {
    await deleteWhere(collection, "documentId", scope.documentId);
  }
  if (scope.videoId) {
    await deleteWhere(collection, "videoId", scope.videoId);
  }

  if (chunks.length === 0) return 0;

  const qdrant = getQdrantClient();
  const vectors = await embedTexts(chunks.map((chunk) => chunk.text));
  const batchSize = 64;

  for (let index = 0; index < chunks.length; index += batchSize) {
    const slice = chunks.slice(index, index + batchSize);
    await qdrant.upsert(collection, {
      wait: true,
      points: slice.map((chunk, offset) => ({
        id: stablePointId(chunk.key),
        vector: vectors[index + offset],
        payload: toPayload(chunk),
      })),
    });
  }

  return chunks.length;
}

export async function deleteDocumentChunks(documentId: string): Promise<void> {
  const collection = ragConfig.qdrant.collection;
  await ensureCollection(collection, ["documentId", "videoId", "userId"]);
  await deleteWhere(collection, "documentId", documentId);
}

export async function deleteVideoChunks(videoId: string): Promise<void> {
  const collection = ragConfig.qdrant.collection;
  await ensureCollection(collection, ["documentId", "videoId", "userId"]);
  await deleteWhere(collection, "videoId", videoId);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asPath(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function readChunk(
  id: string | number,
  score: number,
  payload: Record<string, unknown> | null | undefined,
): StoredChunk | null {
  const text = asString(payload?.text);
  if (!text) return null;

  return {
    id: String(id),
    score,
    rrfScore: 0,
    text,
    title: asString(payload?.title) ?? "Section",
    documentName: asString(payload?.documentName) ?? "Source",
    sourceKind: asString(payload?.sourceKind) ?? "text",
    path: asPath(payload?.path),
    pageIndex: typeof payload?.pageIndex === "number" ? payload.pageIndex : null,
    timestamp: asString(payload?.timestamp),
    documentId: asString(payload?.documentId),
    videoId: asString(payload?.videoId),
    sourceUrl: asString(payload?.sourceUrl),
  };
}

function scopeFilter(documentIds: string[], videoIds: string[]): Filter | null {
  const should: Filter["should"] = [];
  if (documentIds.length > 0) {
    should.push({ key: "documentId", match: { any: documentIds } });
  }
  if (videoIds.length > 0) {
    should.push({ key: "videoId", match: { any: videoIds } });
  }
  if (!should || should.length === 0) return null;
  if (should.length === 1) return { must: should };
  return { should };
}

/**
 * Embed every query variant, search the user's sources, and fuse the lists
 * with reciprocal rank fusion.
 */
export async function searchChunks(
  queries: string[],
  scope: { documentIds: string[]; videoIds: string[] },
): Promise<StoredChunk[]> {
  const filter = scopeFilter(scope.documentIds, scope.videoIds);
  const uniqueQueries = [...new Set(queries.map((query) => query.trim()).filter(Boolean))];
  if (!filter || uniqueQueries.length === 0) return [];

  const collection = ragConfig.qdrant.collection;
  await ensureCollection(collection, ["documentId", "videoId", "userId"]);

  const qdrant = getQdrantClient();
  const vectors = await embedTexts(uniqueQueries);
  const limit = ragConfig.vector.candidatesPerQuery;

  const lists = await Promise.all(
    vectors.map(async (vector) => {
      const response = await qdrant.query(collection, {
        query: vector,
        filter,
        limit,
        with_payload: true,
      });

      const items = response.points
        .map((point) =>
          readChunk(
            point.id,
            point.score,
            (point.payload ?? null) as Record<string, unknown> | null,
          ),
        )
        .filter((item): item is StoredChunk => item !== null);

      return { key: "query", items };
    }),
  );

  const bestScore = new Map<string, number>();
  for (const list of lists) {
    for (const item of list.items) {
      bestScore.set(item.id, Math.max(bestScore.get(item.id) ?? 0, item.score));
    }
  }

  return reciprocalRankFusion(lists, (item) => item.id).map((entry) => ({
    ...entry.item,
    score: bestScore.get(entry.item.id) ?? entry.item.score,
    rrfScore: entry.rrfScore,
  }));
}

export async function upsertMemoryVector(
  memoryId: string,
  userId: string,
  text: string,
): Promise<void> {
  const collection = ragConfig.qdrant.memoryCollection;
  await ensureCollection(collection, ["userId", "memoryId"]);
  const [vector] = await embedTexts([text]);

  await getQdrantClient().upsert(collection, {
    wait: true,
    points: [
      {
        id: stablePointId(`memory:${memoryId}`),
        vector,
        payload: { memoryId, userId, text },
      },
    ],
  });
}

export async function deleteMemoryVector(memoryId: string): Promise<void> {
  const collection = ragConfig.qdrant.memoryCollection;
  await ensureCollection(collection, ["userId", "memoryId"]);
  await getQdrantClient().delete(collection, {
    wait: true,
    points: [stablePointId(`memory:${memoryId}`)],
  });
}

export async function searchMemoryVectors(
  userId: string,
  query: string,
  limit: number,
): Promise<Array<{ memoryId: string; text: string; score: number }>> {
  const collection = ragConfig.qdrant.memoryCollection;
  await ensureCollection(collection, ["userId", "memoryId"]);
  const vector = await embedQuery(query);
  const response = await getQdrantClient().query(collection, {
    query: vector,
    filter: { must: [{ key: "userId", match: { value: userId } }] },
    limit,
    with_payload: true,
    score_threshold: 0.3,
  });

  return response.points
    .map((point) => {
      const payload = point.payload as Record<string, unknown> | null | undefined;
      const text = asString(payload?.text);
      const memoryId = asString(payload?.memoryId);
      if (!text || !memoryId) return null;
      return { memoryId, text, score: point.score };
    })
    .filter((item): item is { memoryId: string; text: string; score: number } => item !== null);
}
