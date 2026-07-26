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

export function fetchSourceStatus(
  id: string,
): Promise<{ document: KnowledgeSource }> {
  return apiFetch(`/api/sources/${id}`, { cache: "no-store" })
}

export function deleteSource(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/sources/${id}`, { method: "DELETE" })
}
