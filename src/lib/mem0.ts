import MemoryClient from "mem0ai";

let client: MemoryClient | undefined;

export function isMem0Configured(): boolean {
  return Boolean(process.env.MEM0_API_KEY?.trim());
}

export function getMem0Client(): MemoryClient | null {
  const apiKey = process.env.MEM0_API_KEY?.trim();
  if (!apiKey) return null;

  if (!client) {
    client = new MemoryClient({ apiKey });
  }

  return client;
}

export interface UserMemory {
  id: string;
  memory: string;
  createdAt?: string;
  updatedAt?: string;
}

function normalizeMemory(entry: {
  id: string;
  memory?: string;
  data?: { memory?: string } | null;
  createdAt?: Date;
  updatedAt?: Date;
}): UserMemory | null {
  const text = entry.memory ?? entry.data?.memory;
  if (!text?.trim()) return null;

  return {
    id: entry.id,
    memory: text.trim(),
    createdAt: entry.createdAt?.toISOString?.() ?? undefined,
    updatedAt: entry.updatedAt?.toISOString?.() ?? undefined,
  };
}

/** Search durable user facts relevant to the question (never document text). */
export async function searchMemories(
  userId: string,
  query: string,
  options?: { topK?: number },
): Promise<string[]> {
  const mem0 = getMem0Client();
  if (!mem0) return [];

  try {
    const { results } = await mem0.search(query, {
      // Durable prefs are user-scoped; run_id is recorded on add for session
      // grouping but must not hide memories from other conversations.
      filters: { user_id: userId },
      topK: options?.topK ?? 6,
    });

    return results
      .map((entry) => normalizeMemory(entry)?.memory)
      .filter((text): text is string => Boolean(text));
  } catch (error) {
    console.warn("[mem0] search failed:", error);
    return [];
  }
}

/** Persist facts from a turn. Fire-and-forget from the ask path. */
export async function addConversationMemory(
  userId: string,
  conversationId: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<void> {
  const mem0 = getMem0Client();
  if (!mem0) return;

  try {
    await mem0.add(messages, {
      userId,
      runId: conversationId,
      infer: true,
    });
  } catch (error) {
    console.warn("[mem0] add failed:", error);
  }
}

export async function listUserMemories(userId: string): Promise<UserMemory[]> {
  const mem0 = getMem0Client();
  if (!mem0) return [];

  try {
    const page = await mem0.getAll({
      filters: { user_id: userId },
      page: 1,
      pageSize: 50,
    });

    return page.results
      .map((entry) => normalizeMemory(entry))
      .filter((entry): entry is UserMemory => entry !== null);
  } catch (error) {
    console.warn("[mem0] getAll failed:", error);
    return [];
  }
}

export async function updateUserMemory(
  memoryId: string,
  text: string,
): Promise<UserMemory | null> {
  const mem0 = getMem0Client();
  if (!mem0) return null;

  const updated = await mem0.update(memoryId, { text });
  const first = updated[0];
  return first ? normalizeMemory(first) : null;
}

export async function deleteUserMemory(memoryId: string): Promise<void> {
  const mem0 = getMem0Client();
  if (!mem0) return;
  await mem0.delete(memoryId);
}
