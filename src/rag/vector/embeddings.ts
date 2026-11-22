import { OpenAIEmbeddings } from "@langchain/openai";

import { ragConfig, requireOpenAiKey } from "@/src/rag/config";

let embeddings: OpenAIEmbeddings | undefined;

export function getEmbeddings(): OpenAIEmbeddings {
  if (!embeddings) {
    const openRouter = ragConfig.openai.baseURL?.includes("openrouter.ai");
    embeddings = new OpenAIEmbeddings({
      model: ragConfig.openai.embeddingModel,
      apiKey: requireOpenAiKey(),
      dimensions: ragConfig.vector.dimensions,
      stripNewLines: false,
      configuration: {
        baseURL: ragConfig.openai.baseURL,
        defaultHeaders: openRouter
          ? {
              "HTTP-Referer":
                process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
              "X-Title": process.env.OPENROUTER_APP_NAME ?? "rag-system",
            }
          : undefined,
      },
    });
  }

  return embeddings;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const model = getEmbeddings();
  const vectors: number[][] = [];

  for (let index = 0; index < texts.length; index += model.batchSize || 64) {
    const batch = texts.slice(index, index + (model.batchSize || 64));
    vectors.push(...(await model.embedDocuments(batch)));
  }

  return vectors;
}

export async function embedQuery(text: string): Promise<number[]> {
  const vector = await getEmbeddings().embedQuery(text);
  return vector as number[];
}
