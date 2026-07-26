import type { TreeNode } from "@pageindex/sdk";

import type { FlatTreeNode } from "@/src/rag/types";

/**
 * Depth-first flatten of a PageIndex tree, recording each node's ancestor
 * titles so retrieved sections can be shown with their full breadcrumb.
 */
export function flattenTree(nodes: TreeNode[]): FlatTreeNode[] {
  const flat: FlatTreeNode[] = [];

  function walk(node: TreeNode, path: string[], depth: number) {
    flat.push({
      nodeId: node.node_id,
      title: node.title,
      pageIndex: typeof node.page_index === "number" ? node.page_index : null,
      text: node.text ?? "",
      summary: node.summary,
      path,
      depth,
    });

    for (const child of node.nodes ?? []) {
      walk(child, [...path, node.title], depth + 1);
    }
  }

  for (const node of nodes) {
    walk(node, [], 0);
  }

  return flat;
}

export function indexNodesById(
  nodes: FlatTreeNode[],
): Map<string, FlatTreeNode> {
  return new Map(nodes.map((node) => [node.nodeId, node]));
}

function truncate(input: string, limit: number): string {
  const clean = input.replace(/\s+/g, " ").trim();
  return clean.length <= limit ? clean : `${clean.slice(0, limit).trimEnd()}...`;
}

/**
 * Render the tree as a compact indented outline for the node selector.
 *
 * Only titles, page numbers and short summaries are included — never full node
 * text. This is what makes the retrieval step affordable: the model reasons
 * over a table of contents instead of the whole document.
 */
export function renderOutline(nodes: FlatTreeNode[]): string {
  return nodes
    .map((node) => {
      const indent = "  ".repeat(node.depth);
      const page = node.pageIndex === null ? "" : ` (p.${node.pageIndex})`;
      const gist = node.summary?.trim() || node.text;
      const detail = gist ? ` — ${truncate(gist, 220)}` : "";

      return `${indent}[${node.nodeId}] ${node.title}${page}${detail}`;
    })
    .join("\n");
}

/** First `[HH:MM:SS]` marker in transcript-derived text, if any. */
export function extractTimestamp(text: string): string | null {
  return text.match(/\[(\d{2}:\d{2}:\d{2})\]/)?.[1] ?? null;
}
