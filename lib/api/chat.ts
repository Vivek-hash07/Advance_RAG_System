import { apiFetch } from "@/lib/api/client"
import type { OptimizedQuery, SourceCitation } from "@/components/dashboard/types"

export interface AskResponse {
  answer: string
  citations: SourceCitation[]
  queries: OptimizedQuery
}

export function askQuestion(
  question: string,
  documentIds?: string[],
): Promise<AskResponse> {
  return apiFetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, documentIds }),
  })
}
