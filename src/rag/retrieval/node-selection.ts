import { getOpenAiClient } from "@/src/lib/openai";
import { ragConfig } from "@/src/rag/config";
import type { FlatTreeNode, OptimizedQuery, SelectedNode } from "@/src/rag/types";

const SYSTEM_PROMPT =
  "You are the retrieval engine for a vectorless RAG system. You are given a document's " +
  "hierarchical outline (a table of contents where each entry has an id, title, page number " +
  "and short summary) plus several phrasings of one user question.\n\n" +
  "Reason about which sections would actually contain the answer, then return their ids " +
  "ranked most relevant first. Rules:\n" +
  "- Only return ids that appear verbatim in the outline.\n" +
  "- Prefer specific leaf sections over broad parent sections.\n" +
  "- Include a section if it answers the main question OR any sub-question.\n" +
  "- Return an empty list if nothing in the outline is relevant. Never guess.\n" +
  "- relevance is 0.0-1.0 for how likely the section contains the answer.\n" +
  "- reason is one short sentence explaining the match.";

const RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: {
    name: "node_selection",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        nodes: {
          type: "array",
          description: "Relevant sections, most relevant first.",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              nodeId: {
                type: "string",
                description: "The section id exactly as it appears in the outline.",
              },
              relevance: {
                type: "number",
                description: "Likelihood the section contains the answer, 0.0 to 1.0.",
              },
              reason: {
                type: "string",
                description: "One short sentence on why this section matches.",
              },
            },
            required: ["nodeId", "relevance", "reason"],
          },
        },
      },
      required: ["nodes"],
    },
  },
};

function buildUserPrompt(
  documentName: string,
  outline: string,
  queries: OptimizedQuery,
  limit: number,
): string {
  const subQueries = queries.subQueries.length
    ? queries.subQueries.map((q, i) => `  ${i + 1}. ${q}`).join("\n")
    : "  (none)";

  return [
    `Document: ${documentName}`,
    "",
    "Outline:",
    outline,
    "",
    "Question (original):",
    queries.original,
    "",
    "Question (clarified):",
    queries.rewritten,
    "",
    "Broader background question:",
    queries.stepBack || "(none)",
    "",
    "Sub-questions:",
    subQueries,
    "",
    "A hypothetical ideal answer, to indicate the vocabulary and framing the",
    "relevant sections are likely to use:",
    queries.hyde || "(none)",
    "",
    `Return at most ${limit} sections.`,
  ].join("\n");
}

/**
 * Reasoning-based retrieval for one document: the model walks the outline and
 * picks the sections worth reading, using every query variant as evidence.
 *
 * This replaces vector similarity search entirely — there are no embeddings,
 * and section selection is a reasoning step over the document's own structure.
 */
export async function selectRelevantNodes(
  documentName: string,
  nodes: FlatTreeNode[],
  outline: string,
  queries: OptimizedQuery,
): Promise<SelectedNode[]> {
  if (nodes.length === 0) {
    return [];
  }

  const limit = ragConfig.retrieval.nodesPerDocument;
  const openai = getOpenAiClient();

  const completion = await openai.chat.completions.create({
    model: ragConfig.openai.reasoningModel,
    temperature: 0,
    response_format: RESPONSE_FORMAT,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: buildUserPrompt(documentName, outline, queries, limit),
      },
    ],
  });

  const parsed = JSON.parse(
    completion.choices[0]?.message?.content ?? "{}",
  ) as { nodes?: SelectedNode[] };

  if (!Array.isArray(parsed.nodes)) {
    return [];
  }

  const known = new Set(nodes.map((node) => node.nodeId));
  const seen = new Set<string>();

  return parsed.nodes
    .filter((node) => {
      // Drop hallucinated or duplicated ids before they reach fusion.
      if (typeof node?.nodeId !== "string" || !known.has(node.nodeId)) return false;
      if (seen.has(node.nodeId)) return false;
      seen.add(node.nodeId);
      return true;
    })
    .map((node) => ({
      nodeId: node.nodeId,
      relevance:
        typeof node.relevance === "number"
          ? Math.min(1, Math.max(0, node.relevance))
          : 0,
      reason: typeof node.reason === "string" ? node.reason : "",
    }))
    .slice(0, limit);
}
