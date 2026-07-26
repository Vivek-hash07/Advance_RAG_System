import { NextResponse } from "next/server";
import { z } from "zod";

import { toErrorResponse } from "@/src/lib/api-error";
import { requireUserId } from "@/src/lib/session";
import { askQuestion } from "@/src/rag/ask";

const askSchema = z.object({
  question: z.string().trim().min(1, "Question must not be empty"),
  documentIds: z.array(z.string()).optional(),
});

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const parsed = askSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
        { status: 400 },
      );
    }

    const result = await askQuestion({
      userId,
      question: parsed.data.question,
      documentIds: parsed.data.documentIds,
    });

    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
