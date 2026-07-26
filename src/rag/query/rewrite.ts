import { getOpenAiClient } from "@/src/lib/openai";
import { ragConfig } from "@/src/rag/config";

export interface QueryRewritingResult {
  stepBack: string;
  rewritten: string;
  subQueries: string[];
}

const SYSTEM_PROMPT =
  "You are a query understanding assistant for a retrieval system. " +
  "Given a user's question, produce query variants that help retrieve relevant documents. " +
  "Apply three techniques: (1) step-back prompting -> one broader background question; " +
  "(2) query rewriting -> fix typos/grammar and make the query explicit and self-contained; " +
  "(3) sub-query decomposition -> break the query into exactly 3 focused sub-questions. " +
  "Respond ONLY with the structured JSON.";

const RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: {
    name: "query_rewriting",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        stepBack: {
          type: "string",
          description:
            "A broader, higher-level 'step-back' question whose answer gives useful background for the original query.",
        },
        rewritten: {
          type: "string",
          description:
            "The original query with spelling/grammar fixed and made clear and self-contained. Preserve the original intent.",
        },
        subQueries: {
          type: "array",
          description:
            "Exactly 3 focused sub-questions the original query can be decomposed into.",
          items: { type: "string" },
        },
      },
      required: ["stepBack", "rewritten", "subQueries"],
    },
  },
};

/**
 * Expand a user query into retrieval-friendly variants:
 * - `stepBack`: a broader background question (step-back prompting)
 * - `rewritten`: typos/grammar fixed and intent made explicit
 * - `subQueries`: the query decomposed into 3 focused sub-questions
 */
export async function queryRewriting(
  query: string,
): Promise<QueryRewritingResult> {
  const openai = getOpenAiClient();

  const completion = await openai.chat.completions.create({
    model: ragConfig.openai.chatModel,
    temperature: 0.2,
    response_format: RESPONSE_FORMAT,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: query },
    ],
  });

  const parsed = JSON.parse(
    completion.choices[0]?.message?.content ?? "{}",
  ) as Partial<QueryRewritingResult>;

  return {
    stepBack: parsed.stepBack ?? "",
    rewritten: parsed.rewritten ?? query,
    // Guard against the model returning more or fewer than 3.
    subQueries: Array.isArray(parsed.subQueries)
      ? parsed.subQueries.slice(0, 3)
      : [],
  };
}
