import { NextResponse } from "next/server";
import { z } from "zod";

import { toErrorResponse } from "@/src/lib/api-error";
import {
  deleteUserMemory,
  isMem0Configured,
  updateUserMemory,
} from "@/src/lib/mem0";
import { requireUserId } from "@/src/lib/session";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const updateSchema = z.object({
  text: z.string().trim().min(1, "Memory text must not be empty"),
});

export async function PATCH(request: Request, context: RouteContext) {
  try {
    await requireUserId();
    const { id } = await context.params;

    if (!isMem0Configured()) {
      return NextResponse.json(
        { error: "MEM0_API_KEY is not set." },
        { status: 503 },
      );
    }

    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
        { status: 400 },
      );
    }

    const memory = await updateUserMemory(id, parsed.data.text);
    return NextResponse.json({ memory });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    await requireUserId();
    const { id } = await context.params;

    if (!isMem0Configured()) {
      return NextResponse.json(
        { error: "MEM0_API_KEY is not set." },
        { status: 503 },
      );
    }

    await deleteUserMemory(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
