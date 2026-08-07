"use client"

import { useEffect, useState } from "react"
import { Loader2Icon, PencilIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import {
  deleteMemory,
  fetchMemories,
  updateMemory,
  type UserMemory,
} from "@/lib/api/memories"

interface MemoriesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MemoriesDialog({ open, onOpenChange }: MemoriesDialogProps) {
  const [configured, setConfigured] = useState(true)
  const [memories, setMemories] = useState<UserMemory[]>([])
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    let cancelled = false
    setLoading(true)
    setError(null)

    void fetchMemories()
      .then((result) => {
        if (cancelled) return
        setConfigured(result.configured)
        setMemories(result.memories)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Failed to load memories.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open])

  async function handleSave(id: string) {
    const text = draft.trim()
    if (!text) return

    setBusyId(id)
    try {
      const { memory } = await updateMemory(id, text)
      if (memory) {
        setMemories((current) =>
          current.map((entry) => (entry.id === id ? memory : entry)),
        )
      }
      setEditingId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update memory.")
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id)
    try {
      await deleteMemory(id)
      setMemories((current) => current.filter((entry) => entry.id !== id))
      if (editingId === id) setEditingId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete memory.")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Memories</DialogTitle>
          <DialogDescription>
            Durable preferences Mem0 extracts from your chats. Documents stay in
            PageIndex — this is only personal context.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" />
            Loading memories...
          </div>
        ) : !configured ? (
          <p className="py-4 text-sm text-muted-foreground">
            Set <code className="text-xs">MEM0_API_KEY</code> in your environment
            to enable memory.
          </p>
        ) : memories.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            No memories yet. They appear after chats where you share preferences
            or decisions.
          </p>
        ) : (
          <ul className="max-h-80 space-y-3 overflow-y-auto">
            {memories.map((memory) => (
              <li
                key={memory.id}
                className="rounded-lg border border-border/60 bg-muted/20 p-3"
              >
                {editingId === memory.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      rows={3}
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        disabled={busyId === memory.id}
                        onClick={() => void handleSave(memory.id)}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 text-sm">{memory.memory}</p>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Edit memory"
                      onClick={() => {
                        setEditingId(memory.id)
                        setDraft(memory.memory)
                      }}
                    >
                      <PencilIcon />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Forget memory"
                      disabled={busyId === memory.id}
                      onClick={() => void handleDelete(memory.id)}
                    >
                      {busyId === memory.id ? (
                        <Loader2Icon className="animate-spin" />
                      ) : (
                        <Trash2Icon />
                      )}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
