import type { Prisma } from "@/src/generated/prisma/client";
import { prisma } from "@/src/lib/db";
import type { FlatTreeNode, IngestStatus, SourceKind } from "@/src/rag/types";

/** A document as the API and UI consume it, with stored strings narrowed. */
export interface DocumentRecord {
  id: string;
  name: string;
  sourceKind: SourceKind;
  pageIndexDocId: string;
  status: IngestStatus;
  errorMessage: string | null;
  pageCount: number | null;
  hasTree: boolean;
  createdAt: string;
}

type DocumentRow = {
  id: string;
  name: string;
  sourceKind: string;
  pageIndexDocId: string;
  status: string;
  errorMessage: string | null;
  pageCount: number | null;
  tree: Prisma.JsonValue | null;
  createdAt: Date;
};

const SELECT = {
  id: true,
  name: true,
  sourceKind: true,
  pageIndexDocId: true,
  status: true,
  errorMessage: true,
  pageCount: true,
  tree: true,
  createdAt: true,
} as const;

function toRecord(row: DocumentRow): DocumentRecord {
  return {
    id: row.id,
    name: row.name,
    sourceKind: row.sourceKind as SourceKind,
    pageIndexDocId: row.pageIndexDocId,
    status: row.status as IngestStatus,
    errorMessage: row.errorMessage,
    pageCount: row.pageCount,
    hasTree: row.tree !== null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createDocument(input: {
  userId: string;
  name: string;
  sourceKind: SourceKind;
  pageIndexDocId: string;
}): Promise<DocumentRecord> {
  const row = await prisma.document.create({
    data: { ...input, status: "processing" },
    select: SELECT,
  });

  return toRecord(row);
}

export async function listDocuments(userId: string): Promise<DocumentRecord[]> {
  const rows = await prisma.document.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: SELECT,
  });

  return rows.map(toRecord);
}

export async function findDocument(
  userId: string,
  documentId: string,
): Promise<DocumentRecord | null> {
  const row = await prisma.document.findFirst({
    where: { id: documentId, userId },
    select: SELECT,
  });

  return row ? toRecord(row) : null;
}

/** Ready documents with their cached trees, for the retrieval stage. */
export async function findRetrievableDocuments(
  userId: string,
  documentIds?: string[],
): Promise<
  Array<{
    id: string;
    name: string;
    sourceKind: SourceKind;
    nodes: FlatTreeNode[];
  }>
> {
  const rows = await prisma.document.findMany({
    where: {
      userId,
      // The tree is written in the same update that flips status to "ready",
      // so a ready document always has a cached tree.
      status: "ready",
      ...(documentIds?.length ? { id: { in: documentIds } } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, sourceKind: true, tree: true },
  });

  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      sourceKind: row.sourceKind as SourceKind,
      nodes: Array.isArray(row.tree) ? (row.tree as unknown as FlatTreeNode[]) : [],
    }))
    .filter((document) => document.nodes.length > 0);
}

export async function updateDocumentStatus(
  documentId: string,
  data: {
    status: IngestStatus;
    errorMessage?: string | null;
    pageCount?: number | null;
    nodes?: FlatTreeNode[];
  },
): Promise<DocumentRecord> {
  const row = await prisma.document.update({
    where: { id: documentId },
    data: {
      status: data.status,
      errorMessage: data.errorMessage ?? null,
      ...(data.pageCount === undefined ? {} : { pageCount: data.pageCount }),
      ...(data.nodes === undefined
        ? {}
        : { tree: data.nodes as unknown as Prisma.InputJsonValue }),
    },
    select: SELECT,
  });

  return toRecord(row);
}

export async function deleteDocument(documentId: string): Promise<void> {
  await prisma.document.delete({ where: { id: documentId } });
}
