import { z } from "zod";

import { toErrorResponse } from "@/src/lib/api-error";
import { requireUserId } from "@/src/lib/session";
import { createSseStream } from "@/src/lib/sse";
import { askQuestion } from "@/src/rag/ask";

const askSchema = z.object({
  question: z.string().trim().min(1, "Question must not be empty"),
  documentIds: z.array(z.string()).optional(),
  conversationId: z.string().optional(),
  stream: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const parsed = askSchema.safeParse(await request.json());

    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
        { status: 400 },
      );
    }

    const { question, documentIds, conversationId, stream } = parsed.data;

    if (stream) {
      return createSseStream(async (emit) => {
        const result = await askQuestion({
          userId,
          question,
          documentIds,
          conversationId,
          onMeta: (meta) => emit({ type: "meta", ...meta }),
          onStatus: (stage) => emit({ type: "status", stage }),
          onDelta: (text) => emit({ type: "delta", text }),
        });

        emit({
          type: "done",
          messageId: result.assistantMessageId,
          answer: result.answer,
          citations: result.citations,
          queries: result.queries,
          pendingVideos: result.pendingVideos,
        });
      });
    }

    const result = await askQuestion({
      userId,
      question,
      documentIds,
      conversationId,
    });

    return Response.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
