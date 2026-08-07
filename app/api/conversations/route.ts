import { NextResponse } from "next/server";
import { z } from "zod";

import { toErrorResponse } from "@/src/lib/api-error";
import { requireUserId } from "@/src/lib/session";
import {
  createConversation,
  listConversations,
} from "@/src/rag/conversations/repository";

const createSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
});

export async function GET() {
  try {
    const userId = await requireUserId();
    const conversations = await listConversations(userId);
    return NextResponse.json({ conversations });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = await request.json().catch(() => ({}));
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
        { status: 400 },
      );
    }

    const conversation = await createConversation(
      userId,
      parsed.data.title ?? "New chat",
    );

    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
