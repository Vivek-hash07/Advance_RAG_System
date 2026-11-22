import { extractTimestamp } from "@/src/rag/text/timestamp";
import type { FlatTreeNode } from "@/src/rag/types";
import { splitAgentically } from "@/src/rag/vector/agentic-chunk";

export interface ChunkDraft {
  key: string;
  text: string;
  title: string;
  pageIndex: number | null;
  timestamp: string | null;
  path: string[];
  documentId: string | null;
  videoId: string | null;
  userId: string | null;
  sourceKind: string;
  documentName: string;
  sourceUrl: string | null;
}

export interface ChunkOwner {
  scopeKey: string;
  documentId: string | null;
  videoId: string | null;
  userId: string | null;
  sourceKind: string;
  documentName: string;
  sourceUrl: string | null;
}

interface Section {
  title: string;
  pageIndex: number | null;
  body: string;
}

function headingTitle(text: string): string | null {
  const line = text
    .split("\n")
    .map((part) => part.trim())
    .find(Boolean);
  if (!line) return null;
  const heading = line.match(/^#{1,3}\s+(.+)$/);
  return (heading?.[1] ?? "").trim() || null;
}

function splitSections(raw: string): Section[] {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  const parts = text.split(/\n(?=## Page \d+\s*\n)/);
  if (parts.length === 1 && !/^## Page \d+/.test(text)) {
    return [{ title: "", pageIndex: null, body: text }];
  }

  return parts
    .map((part) => {
      const match = part.match(/^## Page (\d+)\s*\n+([\s\S]*)$/);
      if (!match) {
        return { title: "", pageIndex: null, body: part.trim() };
      }
      const pageIndex = Number(match[1]);
      return {
        title: `Page ${pageIndex}`,
        pageIndex,
        body: match[2].trim(),
      };
    })
    .filter((section) => section.body.length > 0);
}

function leaves(nodes: FlatTreeNode[]): FlatTreeNode[] {
  const withText = nodes.filter((node) => node.text.trim().length > 0);
  const leafNodes = withText.filter((node) => {
    const prefix = [...node.path, node.title];
    return !withText.some(
      (other) =>
        other.depth > node.depth &&
        prefix.every((part, index) => other.path[index] === part),
    );
  });

  return leafNodes.length > 0 ? leafNodes : withText;
}

function toDraft(
  owner: ChunkOwner,
  index: number,
  text: string,
  title: string,
  pageIndex: number | null,
  path: string[],
): ChunkDraft {
  return {
    key: `${owner.scopeKey}:${index}`,
    text,
    title: title || owner.documentName,
    pageIndex,
    timestamp: extractTimestamp(text),
    path,
    documentId: owner.documentId,
    videoId: owner.videoId,
    userId: owner.userId,
    sourceKind: owner.sourceKind,
    documentName: owner.documentName,
    sourceUrl: owner.sourceUrl,
  };
}

/** Split extracted source text into embeddable chunks with citation metadata. */
export async function chunkText(
  text: string,
  owner: ChunkOwner,
): Promise<ChunkDraft[]> {
  const sections = splitSections(text);
  const drafts: ChunkDraft[] = [];

  for (const section of sections) {
    const parts = await splitAgentically(section.body, section.title);
    for (const part of parts) {
      const body = part.text.trim();
      if (!body) continue;
      drafts.push(
        toDraft(
          owner,
          drafts.length,
          body,
          part.title || headingTitle(body) || section.title,
          section.pageIndex,
          section.title ? [section.title] : [],
        ),
      );
    }
  }

  return drafts;
}

/** Chunk a legacy tree, preferring leaf sections so parent text is not repeated. */
export async function chunkTree(
  nodes: FlatTreeNode[],
  owner: ChunkOwner,
): Promise<ChunkDraft[]> {
  const drafts: ChunkDraft[] = [];

  for (const node of leaves(nodes)) {
    const text = node.text.trim();
    if (!text) continue;

    const parts = await splitAgentically(text, node.title);
    for (const part of parts) {
      const body = part.text.trim();
      if (!body) continue;
      drafts.push(
        toDraft(
          owner,
          drafts.length,
          body,
          part.title || node.title,
          node.pageIndex,
          node.path,
        ),
      );
    }
  }

  return drafts;
}

export function countMarkedPages(text: string): number | null {
  const matches = text.match(/^## Page \d+\s*$/gm);
  return matches && matches.length > 0 ? matches.length : null;
}
