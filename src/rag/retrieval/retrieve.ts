import { ragConfig } from "@/src/rag/config";
import { indexNodesById, renderOutline } from "@/src/rag/pageindex/tree";
import { reciprocalRankFusion, type RankedList } from "@/src/rag/retrieval/fusion";
import { selectRelevantNodes } from "@/src/rag/retrieval/node-selection";
import type {
  FlatTreeNode,
  OptimizedQuery,
  RetrievedNode,
  SelectedNode,
  SourceKind,
} from "@/src/rag/types";

/** A ready document with its cached, flattened PageIndex tree. */
export interface RetrievalDocument {
  id: string;
  name: string;
  sourceKind: SourceKind;
  nodes: FlatTreeNode[];
}

/**
 * Select the document sections that should answer the question.
 *
 * Each document is searched independently by reasoning over its outline, then
 * the per-document rankings are fused with RRF and trimmed to a context budget.
 */
export async function retrieveNodes(
  documents: RetrievalDocument[],
  queries: OptimizedQuery,
): Promise<RetrievedNode[]> {
  const searchable = documents.filter((document) => document.nodes.length > 0);
  if (searchable.length === 0) {
    return [];
  }

  const selections = await Promise.all(
    searchable.map(async (document): Promise<RankedList<SelectedNode>> => {
      const items = await selectRelevantNodes(
        document.name,
        document.nodes,
        renderOutline(document.nodes),
        queries,
      );

      return { key: document.id, items };
    }),
  );

  const fused = reciprocalRankFusion(selections, (node) => node.nodeId);

  const documentsById = new Map(
    searchable.map((document) => [
      document.id,
      { document, nodesById: indexNodesById(document.nodes) },
    ]),
  );

  const retrieved: RetrievedNode[] = [];
  let contextChars = 0;

  for (const entry of fused) {
    if (retrieved.length >= ragConfig.retrieval.finalNodes) break;

    const bucket = documentsById.get(entry.sourceKey);
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
      documentId: bucket.document.id,
      documentName: bucket.document.name,
      sourceKind: bucket.document.sourceKind,
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

  return retrieved;
}
