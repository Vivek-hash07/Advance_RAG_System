import { NextResponse } from "next/server";

import { toErrorResponse } from "@/src/lib/api-error";
import { isMem0Configured, listUserMemories } from "@/src/lib/mem0";
import { requireUserId } from "@/src/lib/session";

export async function GET() {
  try {
    const userId = await requireUserId();

    if (!isMem0Configured()) {
      return NextResponse.json({
        configured: false,
        memories: [],
      });
    }

    const memories = await listUserMemories(userId);
    return NextResponse.json({ configured: true, memories });
  } catch (error) {
    return toErrorResponse(error);
  }
}
