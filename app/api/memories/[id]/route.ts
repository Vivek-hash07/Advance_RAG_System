import { NextResponse } from "next/server";
import { z } from "zod";

import { toErrorResponse } from "@/src/lib/api-error";
import { deleteUserMemory, updateUserMemory } from "@/src/rag/memory/store";
import { requireUserId } from "@/src/lib/session";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const updateSchema = z.object({
  text: z.string().trim().min(1, "Memory text must not be empty"),
});

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const userId = await requireUserId();
    const { id } = await context.params;

    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
        { status: 400 },
      );
    }

    const memory = await updateUserMemory(userId, id, parsed.data.text);
    if (!memory) {
      return NextResponse.json({ error: "Memory not found." }, { status: 404 });
    }

    return NextResponse.json({ memory });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const userId = await requireUserId();
    const { id } = await context.params;
    const removed = await deleteUserMemory(userId, id);

    if (!removed) {
      return NextResponse.json({ error: "Memory not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
