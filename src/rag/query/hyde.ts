import { getOpenAiClient } from "@/src/lib/openai";
import { ragConfig } from "@/src/rag/config";

const SYSTEM_PROMPT =
  "You are an expert writer. Write a concise, factual passage (3-5 sentences) that directly answers " +
  "the user's question, as if it were an excerpt from a relevant reference document. " +
  "Write confidently in a neutral, encyclopedic tone. Do not add disclaimers or say you are unsure.";

/**
 * HyDE (Hypothetical Document Embeddings): draft a plausible answer passage and
 * use it as a retrieval probe. In a vectorless pipeline there is no embedding
 * step, but the hypothetical passage still helps — it supplies the vocabulary
 * and phrasing an answering section would actually use, which makes the
 * tree-node selector far better at spotting the right sections.
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
