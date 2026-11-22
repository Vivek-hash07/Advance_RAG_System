import { getOpenAiClient } from "@/src/lib/openai";
import { prisma } from "@/src/lib/db";
import { ragConfig } from "@/src/rag/config";
import {
  deleteMemoryVector,
  searchMemoryVectors,
  upsertMemoryVector,
} from "@/src/rag/vector/qdrant";

export interface UserMemory {
  id: string;
  memory: string;
  createdAt?: string;
  updatedAt?: string;
}

const MAX_MEMORIES = 200;

const EXTRACT_FORMAT = {
  type: "json_schema" as const,
  json_schema: {
    name: "durable_memories",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        facts: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["facts"],
    },
  },
};

function toMemory(row: {
  id: string;
  text: string;
  createdAt: Date;
  updatedAt: Date;
}): UserMemory {
  return {
    id: row.id,
    memory: row.text,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isUnsafe(text: string): boolean {
  return /sk-[a-z0-9]|sk-or-|api[_-]?key|bearer\s+[a-z0-9._~+/-]+=*|eyJ[a-zA-Z0-9_-]{10,}|password\s*[:=]/i.test(
    text,
  );
}

/** Semantic search over memories stored in Postgres and indexed in Qdrant. */
export async function searchMemories(
  userId: string,
  query: string,
  options?: { topK?: number },
): Promise<string[]> {
  const topK = options?.topK ?? 6;

  try {
    const hits = await searchMemoryVectors(userId, query, topK);
    return hits.map((hit) => hit.text);
  } catch (error) {
    console.warn("[memory] vector search failed:", error);
  }

  const recent = await prisma.memory.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: topK,
    select: { text: true },
  });

  return recent.map((row) => row.text);
}

export async function listUserMemories(userId: string): Promise<UserMemory[]> {
  const rows = await prisma.memory.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  return rows.map(toMemory);
}

export async function updateUserMemory(
  userId: string,
  memoryId: string,
  text: string,
): Promise<UserMemory | null> {
  const trimmed = text.trim();
  if (!trimmed || isUnsafe(trimmed)) return null;

  const existing = await prisma.memory.findFirst({
    where: { id: memoryId, userId },
  });
  if (!existing) return null;

  const updated = await prisma.memory.update({
    where: { id: memoryId },
    data: { text: trimmed },
  });

  await upsertMemoryVector(updated.id, userId, trimmed);
  return toMemory(updated);
}

export async function deleteUserMemory(
  userId: string,
  memoryId: string,
): Promise<boolean> {
  const existing = await prisma.memory.findFirst({
    where: { id: memoryId, userId },
    select: { id: true },
  });
  if (!existing) return false;

  await deleteMemoryVector(memoryId);
  await prisma.memory.delete({ where: { id: memoryId } });
  return true;
}

async function extractFacts(question: string, answer: string): Promise<string[]> {
  const completion = await getOpenAiClient().chat.completions.create({
    model: ragConfig.openai.chatModel,
    temperature: 0,
    response_format: EXTRACT_FORMAT,
    messages: [
      {
        role: "system",
        content:
          "Extract up to 3 durable personal facts from this chat turn. " +
          "Keep only stable preferences, decisions, or facts about the user. " +
          "Do not store document contents, quotes, passwords, API keys, or other secrets. " +
          "Return an empty list when nothing should be remembered. Each fact is one short sentence.",
      },
      {
        role: "user",
        content: `User: ${question}\n\nAssistant: ${answer}`,
      },
    ],
  });

  const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as {
    facts?: string[];
  };

  return (parsed.facts ?? [])
    .map((fact) => fact.trim())
    .filter((fact) => fact.length > 0 && fact.length <= 500 && !isUnsafe(fact))
    .slice(0, 3);
}

/** Store new personal facts from a turn. Failures must not fail the answer. */
export async function rememberTurn(
  userId: string,
  conversationId: string,
  question: string,
  answer: string,
): Promise<void> {
  try {
    const facts = await extractFacts(question, answer);
    if (facts.length === 0) return;

    const count = await prisma.memory.count({ where: { userId } });
    if (count >= MAX_MEMORIES) return;

    for (const fact of facts) {
      const duplicate = await prisma.memory.findFirst({
        where: { userId, text: { equals: fact, mode: "insensitive" } },
        select: { id: true },
      });
      if (duplicate) continue;

      try {
        const similar = await searchMemoryVectors(userId, fact, 1);
        if (similar[0] && similar[0].score >= 0.92) continue;
      } catch (error) {
        console.warn("[memory] dedupe search failed:", error);
      }

      const created = await prisma.memory.create({
        data: { userId, conversationId, text: fact },
      });

      try {
        await upsertMemoryVector(created.id, userId, fact);
      } catch (error) {
        await prisma.memory.delete({ where: { id: created.id } }).catch(() => undefined);
        throw error;
      }
    }
  } catch (error) {
    console.warn("[memory] could not store turn:", error);
  }
}
