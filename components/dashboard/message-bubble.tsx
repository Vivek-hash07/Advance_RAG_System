"use client"

import { AlertCircleIcon, BotIcon, Loader2Icon, UserIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { QueryInsight } from "@/components/dashboard/query-insight"
import {
  getCitationLocation,
  getSourceTypeLabel,
  type ChatMessage,
  type PendingVideo,
  type SourceCitation,
} from "@/components/dashboard/types"
import { cn } from "@/lib/utils"

/**
 * A playlist that is still finishing its transcripts can answer from the videos
 * already chunked. The rest are named so the answer is not treated as complete.
 */
function PendingVideosNotice({ videos }: { videos: PendingVideo[] }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <Loader2Icon className="mt-0.5 size-3 shrink-0 animate-spin" />
      <span>
        Indexing{" "}
        {videos.length === 1
          ? `"${videos[0].title}"`
          : `${videos.length} more videos from this playlist`}
        . Ask again shortly to include them.
      </span>
    </div>
  )
}

interface MessageBubbleProps {
  message: ChatMessage
  onCitationClick: (citation: SourceCitation) => void
  activeCitationId?: string | null
  /** Set on the in-flight assistant turn while the model has not written yet. */
  thinkingLabel?: string | null
}

export function MessageBubble({
  message,
  onCitationClick,
  activeCitationId,
  thinkingLabel,
}: MessageBubbleProps) {
  const isUser = message.role === "user"
  const isThinking = !isUser && !message.error && !message.content && !!thinkingLabel

  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          isUser && "bg-primary text-primary-foreground",
          !isUser && message.error && "bg-destructive/15 text-destructive",
          !isUser && !message.error && "bg-muted",
        )}
      >
        {isUser ? (
          <UserIcon className="size-4" />
        ) : message.error ? (
          <AlertCircleIcon className="size-4" />
        ) : isThinking ? (
          <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
        ) : (
          <BotIcon className="size-4" />
        )}
      </div>

      <div
        className={cn(
          "flex max-w-[85%] flex-col gap-2 sm:max-w-[75%]",
          isUser ? "items-end" : "items-start",
        )}
      >
        {isThinking ? (
          <div className="flex items-center gap-2 pt-1.5 text-sm text-muted-foreground">
            <span>{thinkingLabel}</span>
          </div>
        ) : (
          <div
            className={cn(
              "rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
              isUser && "rounded-tr-sm bg-primary text-primary-foreground",
              !isUser &&
                message.error &&
                "rounded-tl-sm border border-destructive/30 bg-destructive/10 text-destructive",
              !isUser &&
                !message.error &&
                "rounded-tl-sm border border-border bg-card text-card-foreground",
            )}
          >
            {message.content}
          </div>
        )}

        {message.citations && message.citations.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {message.citations.map((citation) => (
              <button
                key={citation.id}
                type="button"
                onClick={() => onCitationClick(citation)}
              >
                <Badge
                  variant="source"
                  className={cn(
                    activeCitationId === citation.id &&
                      "border-white bg-white text-black hover:text-black",
                  )}
                >
                  {getSourceTypeLabel(citation.sourceKind)} ·{" "}
                  {citation.documentName} · {getCitationLocation(citation)}
                </Badge>
              </button>
            ))}
          </div>
        ) : null}

        {message.pendingVideos && message.pendingVideos.length > 0 ? (
          <PendingVideosNotice videos={message.pendingVideos} />
        ) : null}

        {message.queries ? <QueryInsight queries={message.queries} /> : null}

        <span className="px-1 text-[11px] text-muted-foreground">
          {message.createdAt}
        </span>
      </div>
    </div>
  )
}
