import { apiFetch } from "@/lib/api/client"
import type { KnowledgeSource } from "@/components/dashboard/types"

export function fetchSources(): Promise<{ documents: KnowledgeSource[] }> {
  return apiFetch("/api/sources", { cache: "no-store" })
}

export function uploadSource(file: File): Promise<{ document: KnowledgeSource }> {
  const body = new FormData()
  body.append("file", file)

  return apiFetch("/api/sources", { method: "POST", body })
}

/** Server response to a link that contains both a video and a playlist. */
export interface YoutubeChoice {
  video: { id: string; title: string }
  playlist: { id: string; title: string; itemCount: number }
}

export interface AmbiguousLinkBody {
  error: string
  choice: YoutubeChoice
}

export function addLinkSource(
  url: string,
  options?: {
    preference?: "video" | "playlist"
    kind?: "youtube" | "webpage"
  },
): Promise<{ document: KnowledgeSource }> {
  return apiFetch("/api/sources", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      preference: options?.preference,
      kind: options?.kind,
    }),
  })
}

export function fetchSourceStatus(
  id: string,
): Promise<{ document: KnowledgeSource }> {
  return apiFetch(`/api/sources/${id}`, { cache: "no-store" })
}

export function deleteSource(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/sources/${id}`, { method: "DELETE" })
}
