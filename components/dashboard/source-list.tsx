"use client"

import { useState } from "react"
import { AlertCircleIcon, Loader2Icon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { SourceIcon } from "@/components/dashboard/source-icon"
import {
  formatRelativeTime,
  getSourceTypeLabel,
  type KnowledgeSource,
} from "@/components/dashboard/types"
import { cn } from "@/lib/utils"

interface SourceListProps {
  sources: KnowledgeSource[]
  onRemove: (id: string) => Promise<void>
}

const STATUS_STYLES = {
  ready: "bg-emerald-500",
  processing: "bg-amber-500",
  queued: "bg-amber-500",
  failed: "bg-destructive",
} as const

function StatusLabel({ source }: { source: KnowledgeSource }) {
  if (source.status === "ready") {
    const pages =
      source.pageCount === null ? null : `${source.pageCount} pages`
    return <span>{pages ?? "Indexed"}</span>
  }

  if (source.status === "failed") {
    return <span className="text-destructive">Failed</span>
  }

  return (
    <span className="inline-flex items-center gap-1">
      <Loader2Icon className="size-3 animate-spin" />
      Indexing
    </span>
  )
}

function SourceRow({
  source,
  onRemove,
}: {
  source: KnowledgeSource
  onRemove: (id: string) => Promise<void>
}) {
  const [isRemoving, setIsRemoving] = useState(false)

  async function handleRemove() {
    setIsRemoving(true)
    try {
      await onRemove(source.id)
    } finally {
      setIsRemoving(false)
    }
  }

  return (
    <li className="group flex items-start gap-2.5 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2.5">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted">
        <SourceIcon
          type={source.sourceKind}
          className="size-3.5 text-muted-foreground"
        />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium" title={source.name}>
          {source.name}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>{getSourceTypeLabel(source.sourceKind)}</span>
          <span>·</span>
          <StatusLabel source={source} />
          <span>·</span>
          <span>{formatRelativeTime(source.createdAt)}</span>
        </span>
        {source.status === "failed" && source.errorMessage ? (
          <span className="mt-1 flex items-start gap-1 text-xs text-destructive">
            <AlertCircleIcon className="mt-0.5 size-3 shrink-0" />
            {source.errorMessage}
          </span>
        ) : null}
      </span>

      <span className="flex shrink-0 items-center gap-1.5">
        <span
          aria-hidden
          className={cn(
            "mt-1 size-1.5 rounded-full",
            STATUS_STYLES[source.status],
          )}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove ${source.name}`}
          disabled={isRemoving}
          onClick={handleRemove}
          className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        >
          {isRemoving ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <Trash2Icon />
          )}
        </Button>
      </span>
    </li>
  )
}

export function SourceList({ sources, onRemove }: SourceListProps) {
  if (sources.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-3 py-4 text-center">
        <p className="text-sm text-muted-foreground">No sources yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Add a file above to start asking questions.
        </p>
      </div>
    )
  }

  return (
    <ul className="grid gap-1.5">
      {sources.map((source) => (
        <SourceRow key={source.id} source={source} onRemove={onRemove} />
      ))}
    </ul>
  )
}
