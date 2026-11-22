import { ragConfig } from "@/src/rag/config";
import type { FlatTreeNode } from "@/src/rag/types";
import {
  chunkText,
  chunkTree,
  countMarkedPages,
  type ChunkOwner,
} from "@/src/rag/vector/chunk";
import { replaceChunks } from "@/src/rag/vector/qdrant";

export interface IndexedText {
  chunkCount: number;
  pageCount: number | null;
}

function assertIndexable(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("No readable text was found to index.");
  }
  if (trimmed.length > ragConfig.vector.maxIndexChars) {
    throw new Error(
      `That source is too large to index (over ${Math.floor(ragConfig.vector.maxIndexChars / 1000)}k characters).`,
    );
  }
  return trimmed;
}

async function indexChunks(owner: ChunkOwner, chunks: Awaited<ReturnType<typeof chunkText>>): Promise<number> {
  if (chunks.length === 0) {
    throw new Error("No readable text was found to index.");
  }

  return replaceChunks(
    {
      ...(owner.documentId ? { documentId: owner.documentId } : {}),
      ...(owner.videoId ? { videoId: owner.videoId } : {}),
    },
    chunks,
  );
}

export async function indexDocumentText(input: {
  userId: string;
  documentId: string;
  documentName: string;
  sourceKind: string;
  sourceUrl: string | null;
  text: string;
}): Promise<IndexedText> {
  const text = assertIndexable(input.text);
  const owner: ChunkOwner = {
    scopeKey: `doc:${input.documentId}`,
    documentId: input.documentId,
    videoId: null,
    userId: input.userId,
    sourceKind: input.sourceKind,
    documentName: input.documentName,
    sourceUrl: input.sourceUrl,
  };

  return {
    chunkCount: await indexChunks(owner, await chunkText(text, owner)),
    pageCount: countMarkedPages(text),
  };
}

export async function indexVideoText(input: {
  videoId: string;
  title: string;
  sourceUrl: string;
  text: string;
}): Promise<IndexedText> {
  const text = assertIndexable(input.text);
  const owner: ChunkOwner = {
    scopeKey: `video:${input.videoId}`,
    documentId: null,
    videoId: input.videoId,
    userId: null,
    sourceKind: "youtube",
    documentName: input.title,
    sourceUrl: input.sourceUrl,
  };

  return {
    chunkCount: await indexChunks(owner, await chunkText(text, owner)),
    pageCount: null,
  };
}

export async function indexTreeNodes(input: {
  userId: string | null;
  documentId: string | null;
  videoId: string | null;
  documentName: string;
  sourceKind: string;
  sourceUrl: string | null;
  nodes: FlatTreeNode[];
}): Promise<number> {
  const scopeKey = input.videoId
    ? `video:${input.videoId}`
    : `doc:${input.documentId}`;
  const owner: ChunkOwner = {
    scopeKey,
    documentId: input.documentId,
    videoId: input.videoId,
    userId: input.userId,
    sourceKind: input.sourceKind,
    documentName: input.documentName,
    sourceUrl: input.sourceUrl,
  };

  return indexChunks(owner, await chunkTree(input.nodes, owner));
}
