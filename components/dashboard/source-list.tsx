"use client"

import { useState } from "react"
import {
  AlertCircleIcon,
  ChevronDownIcon,
  Loader2Icon,
  Trash2Icon,
} from "lucide-react"

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
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
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
    return <span>{source.detail ?? "Indexed"}</span>
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

function PlaylistHonesty({ source }: { source: KnowledgeSource }) {
  const [open, setOpen] = useState(false)
  const hasFailed = (source.failedCount ?? 0) > 0
  const hasUnavailable = (source.unavailableCount ?? 0) > 0
  const truncated = source.truncated === true

  if (!truncated && !hasUnavailable && !hasFailed) return null

  return (
    <div className="mt-1.5 space-y-1">
      {truncated ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Playlist truncated to the ingest cap — later videos were skipped.
        </p>
      ) : null}
      {hasUnavailable ? (
        <p className="text-xs text-muted-foreground">
          {source.unavailableCount}{" "}
          {source.unavailableCount === 1 ? "entry was" : "entries were"}{" "}
          private or deleted.
        </p>
      ) : null}
      {hasFailed ? (
        <div>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="inline-flex items-center gap-1 text-xs text-destructive"
          >
            <AlertCircleIcon className="size-3" />
            {source.failedCount}{" "}
            {source.failedCount === 1 ? "video" : "videos"} failed to index
            <ChevronDownIcon
              className={cn(
                "size-3 transition-transform",
                open && "rotate-180",
              )}
            />
          </button>
          {open ? (
            <ul className="mt-1 space-y-1 border-l border-destructive/30 pl-2">
              {source.failedVideos.map((video) => (
                <li key={video.videoId} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {video.title}
                  </span>
                  {video.errorMessage ? (
                    <span className="block min-w-0 break-all text-destructive">
                      {video.errorMessage}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function SourceRow({
  source,
  selected,
  onToggleSelect,
  onRemove,
}: {
  source: KnowledgeSource
  selected: boolean
  onToggleSelect: (id: string) => void
  onRemove: (id: string) => Promise<void>
}) {
  const [isRemoving, setIsRemoving] = useState(false)
  const canSelect = source.status === "ready"

  async function handleRemove() {
    setIsRemoving(true)
    try {
      await onRemove(source.id)
    } finally {
      setIsRemoving(false)
    }
  }

  return (
    <li className="group/source flex min-w-0 items-start gap-2 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2.5 transition-colors hover:border-border hover:bg-muted">
      <input
        type="checkbox"
        className="mt-2 size-3.5 shrink-0 accent-foreground"
        checked={selected}
        disabled={!canSelect}
        onChange={() => onToggleSelect(source.id)}
        aria-label={`Include ${source.name} in questions`}
        title={
          canSelect
            ? "Include this source when asking"
            : "Source must be ready before it can be scoped"
        }
      />

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
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>{getSourceTypeLabel(source.sourceKind)}</span>
          <span>·</span>
          <StatusLabel source={source} />
          <span>·</span>
          <span>{formatRelativeTime(source.createdAt)}</span>
        </span>
        {source.status === "failed" && source.errorMessage ? (
          <span className="mt-1 flex min-w-0 items-start gap-1 text-xs text-destructive">
            <AlertCircleIcon className="mt-0.5 size-3 shrink-0" />
            <span className="min-w-0 break-all">{source.errorMessage}</span>
          </span>
        ) : null}
        {source.sourceKind === "playlist" ? (
          <PlaylistHonesty source={source} />
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
          className="text-muted-foreground opacity-0 transition-opacity group-hover/source:opacity-100 hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100"
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

export function SourceList({
  sources,
  selectedIds,
  onToggleSelect,
  onRemove,
}: SourceListProps) {
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

  const readyCount = sources.filter((source) => source.status === "ready").length
  const selectedReady = sources.filter(
    (source) => source.status === "ready" && selectedIds.has(source.id),
  ).length

  return (
    <div className="grid gap-1.5">
      {readyCount > 0 ? (
        <p className="px-1 text-[11px] text-muted-foreground">
          {selectedReady === 0 || selectedReady === readyCount
            ? "Asking across all ready sources"
            : `Asking across ${selectedReady} of ${readyCount} ready sources`}
        </p>
      ) : null}
      <ul className="grid min-w-0 gap-1.5">
        {sources.map((source) => (
          <SourceRow
            key={source.id}
            source={source}
            selected={selectedIds.has(source.id)}
            onToggleSelect={onToggleSelect}
            onRemove={onRemove}
          />
        ))}
      </ul>
    </div>
  )
}
