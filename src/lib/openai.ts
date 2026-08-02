import OpenAI from "openai";

import { ragConfig, requireOpenAiKey } from "@/src/rag/config";

let client: OpenAI | undefined;

export function getOpenAiClient(): OpenAI {
  if (!client) {
    const apiKey = requireOpenAiKey();
    client = new OpenAI({
      apiKey,
      baseURL: ragConfig.openai.baseURL,
      // OpenRouter ranking / attribution; ignored by api.openai.com.
      defaultHeaders: ragConfig.openai.baseURL?.includes("openrouter.ai")
        ? {
            "HTTP-Referer":
              process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
            "X-Title": process.env.OPENROUTER_APP_NAME ?? "rag-system",
          }
        : undefined,
    });
  }

  return client;
}
