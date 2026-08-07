import { apiFetch } from "@/lib/api/client"

export interface UserMemory {
  id: string
  memory: string
  createdAt?: string
  updatedAt?: string
}

export function fetchMemories(): Promise<{
  configured: boolean
  memories: UserMemory[]
}> {
  return apiFetch("/api/memories")
}

export function updateMemory(
  id: string,
  text: string,
): Promise<{ memory: UserMemory | null }> {
  return apiFetch(`/api/memories/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  })
}

export function deleteMemory(id: string): Promise<{ ok: true }> {
  return apiFetch(`/api/memories/${id}`, { method: "DELETE" })
}
