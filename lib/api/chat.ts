import { apiFetch } from "@/lib/api/client"
import type {
  OptimizedQuery,
  PendingVideo,
  SourceCitation,
} from "@/components/dashboard/types"

export interface AskResponse {
  answer: string
  citations: SourceCitation[]
  queries: OptimizedQuery
  pendingVideos: PendingVideo[]
  conversationId: string
  userMessageId: string
  assistantMessageId: string
}

export type ChatStreamEvent =
  | { type: "meta"; conversationId: string; userMessageId: string }
  | { type: "status"; stage: string }
  | { type: "delta"; text: string }
  | {
      type: "done"
      messageId: string
      answer: string
      citations: SourceCitation[]
      queries: OptimizedQuery
      pendingVideos: PendingVideo[]
    }
  | { type: "error"; error: string }

export function askQuestion(
  question: string,
  options?: {
    documentIds?: string[]
    conversationId?: string | null
  },
): Promise<AskResponse> {
  return apiFetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      documentIds: options?.documentIds,
      conversationId: options?.conversationId ?? undefined,
    }),
  })
}

/** Stream an ask turn over SSE. */
export async function askQuestionStream(
  question: string,
  options: {
    documentIds?: string[]
    conversationId?: string | null
    onEvent: (event: ChatStreamEvent) => void
  },
): Promise<void> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      documentIds: options.documentIds,
      conversationId: options.conversationId ?? undefined,
      stream: true,
    }),
  })

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`
    try {
      const body = (await response.json()) as { error?: string }
      if (body?.error) message = body.error
    } catch {
      // ignore
    }
    throw new Error(message)
  }

  if (!response.body) {
    throw new Error("Streaming response body was empty.")
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split("\n\n")
    buffer = chunks.pop() ?? ""

    for (const chunk of chunks) {
      const line = chunk
        .split("\n")
        .find((entry) => entry.startsWith("data: "))
      if (!line) continue

      const payload = JSON.parse(line.slice(6)) as ChatStreamEvent
      options.onEvent(payload)
      if (payload.type === "error") {
        throw new Error(payload.error)
      }
    }
  }
}
