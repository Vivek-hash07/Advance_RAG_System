import OpenAI from "openai";

import { requireOpenAiKey } from "@/src/rag/config";

let client: OpenAI | undefined;

export function getOpenAiClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: requireOpenAiKey() });
  }

  return client;
}
