"use client"

import { ExternalLinkIcon, XIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SourceIcon } from "@/components/dashboard/source-icon"
import {
  getCitationLocation,
  getSourceTypeLabel,
  type SourceCitation,
} from "@/components/dashboard/types"
import { cn } from "@/lib/utils"

interface SourcePanelProps {
  citation: SourceCitation
  onClose: () => void
  className?: string
}

/**
 * Render the excerpt with the supporting sentence highlighted. The highlight is
 * only applied when the model quoted the source verbatim, so nothing is ever
 * marked as sourced text when it was actually paraphrased.
 */
function Excerpt({ citation }: { citation: SourceCitation }) {
  if (!citation.highlightedText) {
    return <>{citation.excerpt}</>
  }

  const parts = citation.excerpt.split(citation.highlightedText)

  return (
    <>
      {parts.map((part, index) => (
        <span key={`${citation.id}-${index}`}>
          {part}
          {index < parts.length - 1 ? (
            <mark className="rounded-sm bg-amber-200/80 px-0.5 text-black dark:bg-amber-500/30 dark:text-black">
              {citation.highlightedText}
            </mark>
          ) : null}
        </span>
      ))}
    </>
  )
}

export function SourcePanelContent({
  citation,
  onClose,
  showCloseButton = true,
}: {
  citation: SourceCitation
  onClose: () => void
  showCloseButton?: boolean
}) {
  const breadcrumb = citation.title

  return (
    <>
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <Badge variant="secondary">
              {getSourceTypeLabel(citation.sourceKind)}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {getCitationLocation(citation)}
            </span>
          </div>
          <h2 className="truncate text-sm font-semibold" title={citation.documentName}>
            {citation.documentName}
          </h2>
          {breadcrumb ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground" title={breadcrumb}>
              {breadcrumb}
            </p>
          ) : null}
        </div>
        {showCloseButton ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close source panel"
          >
            <XIcon />
          </Button>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        <p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Retrieved excerpt
        </p>
        <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm leading-relaxed whitespace-pre-wrap text-foreground">
          <Excerpt citation={citation} />
        </div>
      </div>

      <div className="border-t border-border px-4 py-3 sm:px-5">
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="flex min-w-0 items-center gap-2">
            <SourceIcon type={citation.sourceKind} className="size-3.5" />
            <span className="truncate">
              This is the section used to generate the answer.
            </span>
          </span>

          {citation.sourceUrl ? (
            <a
              href={citation.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
            >
              {citation.timestamp ? `Watch at ${citation.timestamp}` : "Watch"}
              <ExternalLinkIcon className="size-3" />
            </a>
          ) : null}
        </div>
      </div>
    </>
  )
}

export function SourcePanel({ citation, onClose, className }: SourcePanelProps) {
  return (
    <aside
      className={cn(
        "flex h-full w-full flex-col border-l border-border bg-background",
        className,
      )}
    >
      <SourcePanelContent citation={citation} onClose={onClose} />
    </aside>
  )
}
