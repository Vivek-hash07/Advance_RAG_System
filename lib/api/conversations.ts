import { apiFetch } from "@/lib/api/client"
import type {
  OptimizedQuery,
  PendingVideo,
  SourceCitation,
} from "@/components/dashboard/types"

export interface ConversationSummary {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface ConversationMessage {
  id: string
  role: "user" | "assistant"
  content: string
  citations: SourceCitation[] | null
  queries: OptimizedQuery | null
  pendingVideos: PendingVideo[] | null
  createdAt: string
}

export function fetchConversations(): Promise<{
  conversations: ConversationSummary[]
}> {
  return apiFetch("/api/conversations")
}

export function createConversation(title?: string): Promise<{
  conversation: ConversationSummary
}> {
  return apiFetch("/api/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(title ? { title } : {}),
  })
}

export function fetchConversation(id: string): Promise<{
  conversation: ConversationSummary
  messages: ConversationMessage[]
}> {
  return apiFetch(`/api/conversations/${id}`)
}

export function deleteConversation(id: string): Promise<{ ok: true }> {
  return apiFetch(`/api/conversations/${id}`, { method: "DELETE" })
}
