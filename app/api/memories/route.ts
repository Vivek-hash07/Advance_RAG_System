import { NextResponse } from "next/server";

import { toErrorResponse } from "@/src/lib/api-error";
import { listUserMemories } from "@/src/rag/memory/store";
import { requireUserId } from "@/src/lib/session";

export async function GET() {
  try {
    const userId = await requireUserId();
    const memories = await listUserMemories(userId);
    return NextResponse.json({ configured: true, memories });
  } catch (error) {
    return toErrorResponse(error);
  }
}
