import type { Prisma } from "@/src/generated/prisma/client";
import { prisma } from "@/src/lib/db";
import type {
  AnswerCitation,
  OptimizedQuery,
  PendingVideo,
} from "@/src/rag/types";

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: AnswerCitation[] | null;
  queries: OptimizedQuery | null;
  pendingVideos: PendingVideo[] | null;
  createdAt: string;
}

function titleFromQuestion(question: string): string {
  const trimmed = question.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 60) return trimmed || "New chat";
  return `${trimmed.slice(0, 57)}...`;
}

export async function listConversations(
  userId: string,
): Promise<ConversationSummary[]> {
  const rows = await prisma.conversation.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  });

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function createConversation(
  userId: string,
  title = "New chat",
): Promise<ConversationSummary> {
  const row = await prisma.conversation.create({
    data: { userId, title },
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  });

  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function findConversation(
  userId: string,
  conversationId: string,
): Promise<ConversationSummary | null> {
  const row = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  });

  if (!row) return null;

  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function deleteConversation(
  userId: string,
  conversationId: string,
): Promise<boolean> {
  const existing = await findConversation(userId, conversationId);
  if (!existing) return false;

  await prisma.conversation.delete({ where: { id: conversationId } });
  return true;
}

export async function listMessages(
  conversationId: string,
): Promise<ConversationMessage[]> {
  const rows = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });

  return rows.map((row) => ({
    id: row.id,
    role: row.role as "user" | "assistant",
    content: row.content,
    citations: (row.citations as AnswerCitation[] | null) ?? null,
    queries: (row.queries as OptimizedQuery | null) ?? null,
    pendingVideos: (row.pendingVideos as PendingVideo[] | null) ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** Recent turns for multi-turn grounding (oldest → newest). */
export async function getRecentTurns(
  conversationId: string,
  limit = 8,
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  const rows = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { role: true, content: true },
  });

  return rows
    .reverse()
    .map((row) => ({
      role: row.role as "user" | "assistant",
      content: row.content,
    }));
}

export async function ensureConversation(
  userId: string,
  conversationId: string | undefined,
  firstQuestion: string,
): Promise<ConversationSummary> {
  if (conversationId) {
    const existing = await findConversation(userId, conversationId);
    if (existing) return existing;
  }

  return createConversation(userId, titleFromQuestion(firstQuestion));
}

export async function appendUserMessage(
  conversationId: string,
  content: string,
): Promise<ConversationMessage> {
  const row = await prisma.message.create({
    data: {
      conversationId,
      role: "user",
      content,
    },
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  return {
    id: row.id,
    role: "user",
    content: row.content,
    citations: null,
    queries: null,
    pendingVideos: null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function appendAssistantMessage(
  conversationId: string,
  input: {
    content: string;
    citations: AnswerCitation[];
    queries: OptimizedQuery;
    pendingVideos: PendingVideo[];
  },
): Promise<ConversationMessage> {
  const row = await prisma.message.create({
    data: {
      conversationId,
      role: "assistant",
      content: input.content,
      citations: input.citations as unknown as Prisma.InputJsonValue,
      queries: input.queries as unknown as Prisma.InputJsonValue,
      pendingVideos: input.pendingVideos as unknown as Prisma.InputJsonValue,
    },
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  return {
    id: row.id,
    role: "assistant",
    content: row.content,
    citations: input.citations,
    queries: input.queries,
    pendingVideos: input.pendingVideos,
    createdAt: row.createdAt.toISOString(),
  };
}
