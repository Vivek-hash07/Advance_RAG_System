import { ragConfig } from "@/src/rag/config";

export interface RankedList<T> {
  /** Where this ranking came from, e.g. a document id. */
  key: string;
  items: T[];
}

export interface FusedItem<T> {
  item: T;
  sourceKey: string;
  rrfScore: number;
}

/**
 * Reciprocal Rank Fusion over several ranked lists. An item at 1-based rank `r`
 * contributes `1 / (k + r)` to its score, so items ranked highly by more than
 * one list rise to the top and no single list can dominate.
 *
 * Vector pipelines use RRF to merge per-query hit lists. Here it merges the
 * per-document section rankings into one global ordering, which keeps a single
 * document with many plausible sections from crowding out a short document that
 * holds the actual answer.
 */
export function reciprocalRankFusion<T>(
  lists: Array<RankedList<T>>,
  identify: (item: T) => string,
  k: number = ragConfig.retrieval.rrfK,
): Array<FusedItem<T>> {
  const fused = new Map<string, FusedItem<T>>();

  for (const list of lists) {
    list.items.forEach((item, index) => {
      const rank = index + 1;
      const contribution = 1 / (k + rank);
      const id = `${list.key}::${identify(item)}`;
      const existing = fused.get(id);

      if (existing) {
        existing.rrfScore += contribution;
        return;
      }

      fused.set(id, { item, sourceKey: list.key, rrfScore: contribution });
    });
  }

  return [...fused.values()].sort((a, b) => b.rrfScore - a.rrfScore);
}
