/** Helpers for Server-Sent Events chat responses. */

export type SsePayload =
  | { type: "meta"; conversationId: string; userMessageId: string }
  | { type: "status"; stage: string }
  | { type: "delta"; text: string }
  | {
      type: "done";
      messageId: string;
      answer: string;
      citations: unknown;
      queries: unknown;
      pendingVideos: unknown;
    }
  | { type: "error"; error: string };

export function encodeSse(payload: SsePayload): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export function createSseStream(
  run: (emit: (payload: SsePayload) => void) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (payload: SsePayload) => {
        controller.enqueue(encoder.encode(encodeSse(payload)));
      };

      try {
        await run(emit);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Something went wrong.";
        emit({ type: "error", error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
