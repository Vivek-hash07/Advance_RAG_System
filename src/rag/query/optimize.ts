import { hydeDocument } from "@/src/rag/query/hyde";
import { queryRewriting } from "@/src/rag/query/rewrite";
import type { OptimizedQuery, QueryVariant } from "@/src/rag/types";

function buildVariants(parts: {
  original: string;
  rewritten: string;
  stepBack: string;
  hyde: string;
  subQueries: string[];
}): QueryVariant[] {
  const candidates: QueryVariant[] = [
    { label: "original", text: parts.original },
    { label: "rewritten", text: parts.rewritten },
    { label: "stepBack", text: parts.stepBack },
    { label: "hyde", text: parts.hyde },
    ...parts.subQueries.map(
      (text, index): QueryVariant => ({
        label: `subQuery${index + 1}`,
        text,
      }),
    ),
  ];

  return candidates.filter((variant) => variant.text.trim().length > 0);
}

/**
 * Run the full query understanding stage: step-back prompting, rewriting,
 * sub-query decomposition and HyDE. The rewriting call and the HyDE call are
 * independent, so they run in parallel.
 */
export async function optimizeQuery(query: string): Promise<OptimizedQuery> {
  const original = query.trim();

  const [{ stepBack, rewritten, subQueries }, hyde] = await Promise.all([
    queryRewriting(original),
    hydeDocument(original),
  ]);

  return {
    original,
    rewritten,
    stepBack,
    subQueries,
    hyde,
    variants: buildVariants({ original, rewritten, stepBack, hyde, subQueries }),
  };
}
