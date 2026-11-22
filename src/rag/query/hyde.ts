import { getOpenAiClient } from "@/src/lib/openai";
import { ragConfig } from "@/src/rag/config";

const SYSTEM_PROMPT =
  "You are an expert writer. Write a concise, factual passage (3-5 sentences) that directly answers " +
  "the user's question, as if it were an excerpt from a relevant reference document. " +
  "Write confidently in a neutral, encyclopedic tone. Do not add disclaimers or say you are unsure.";

/**
 * HyDE (Hypothetical Document Embeddings): draft a plausible answer passage and
 * use it as a retrieval probe. The passage is embedded alongside the question
 * so Qdrant can match the wording an answering chunk would actually use.
 */
export async function hydeDocument(query: string): Promise<string> {
  const openai = getOpenAiClient();

  const completion = await openai.chat.completions.create({
    model: ragConfig.openai.chatModel,
    temperature: 0.3,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: query },
    ],
  });

  return completion.choices[0]?.message?.content?.trim() ?? "";
}
