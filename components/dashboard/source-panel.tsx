"use client"

import {
  ExternalLinkIcon,
  FileTextIcon,
  GlobeIcon,
  ImageIcon,
  XIcon,
  VideoIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  getSourceTypeLabel,
  type SourceCitation,
  type SourceType,
} from "@/components/dashboard/dummy-data"
import { cn } from "@/lib/utils"

interface SourcePanelProps {
  citation: SourceCitation
  onClose: () => void
  className?: string
}

function SourceIcon({ type, className }: { type: SourceType; className?: string }) {
  switch (type) {
    case "pdf":
    case "doc":
    case "vtt":
      return <FileTextIcon className={className} />
    case "image":
      return <ImageIcon className={className} />
    case "webpage":
      return <GlobeIcon className={className} />
    case "youtube":
      return <VideoIcon className={className} />
  }
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
  const locationLabel =
    citation.page ?? citation.timestamp ?? "Referenced section"

  return (
    <>
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <Badge variant="secondary">
              {getSourceTypeLabel(citation.sourceType)}
            </Badge>
            <span className="text-xs text-muted-foreground">{locationLabel}</span>
          </div>
          <h2 className="truncate text-sm font-semibold">{citation.sourceName}</h2>
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
        <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm leading-relaxed text-black">
          {citation.excerpt.split(citation.highlightedText).map((part, index, parts) => (
            <span key={`${citation.id}-${index}`}>
              {part}
              {index < parts.length - 1 ? (
                <mark className="rounded-sm bg-amber-200/80 px-0.5 text-black dark:bg-amber-500/30 dark:text-black">
                  {citation.highlightedText}
                </mark>
              ) : null}
            </span>
          ))}
        </div>

        {citation.url ? (
          <a
            href={citation.url}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            <ExternalLinkIcon className="size-3.5" />
            Open original source
          </a>
        ) : null}
      </div>

      <div className="border-t border-border px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <SourceIcon type={citation.sourceType} className="size-3.5" />
          <span>
            This is the exact passage used to generate the answer.
          </span>
        </div>
      </div>
    </>
  )
}

export function SourcePanel({
  citation,
  onClose,
  className,
}: SourcePanelProps) {
  return (
    <aside
      className={cn(
        "flex h-full w-full flex-col border-l border-border bg-background",
        className
      )}
    >
      <SourcePanelContent citation={citation} onClose={onClose} />
    </aside>
  )
}
