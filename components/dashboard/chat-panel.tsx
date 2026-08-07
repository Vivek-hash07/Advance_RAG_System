"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2Icon, SendIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { MessageBubble } from "@/components/dashboard/message-bubble"
import type {
  ChatMessage,
  SourceCitation,
} from "@/components/dashboard/types"
import { cn } from "@/lib/utils"

interface ChatPanelProps {
  messages: ChatMessage[]
  isAsking: boolean
  statusLabel?: string | null
  readySourceCount: number
  hasProcessingSources: boolean
  onSend: (question: string) => void
  onCitationClick: (citation: SourceCitation) => void
  activeCitationId?: string | null
  className?: string
}

function EmptyState({
  readySourceCount,
  hasProcessingSources,
}: {
  readySourceCount: number
  hasProcessingSources: boolean
}) {
  if (readySourceCount > 0) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h2 className="text-sm font-semibold">Ask anything about your sources</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Answers are grounded in {readySourceCount}{" "}
          {readySourceCount === 1 ? "source" : "sources"}, with citations back to
          the exact section used.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h2 className="text-sm font-semibold">
        {hasProcessingSources ? "Indexing your source" : "No sources yet"}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {hasProcessingSources
          ? "Your source is being processed into a document tree. This usually takes under a minute."
          : "Upload a PDF, Word document, text file or VTT transcript from the sidebar to get started."}
      </p>
    </div>
  )
}

export function ChatPanel({
  messages,
  isAsking,
  statusLabel,
  readySourceCount,
  hasProcessingSources,
  onSend,
  onCitationClick,
  activeCitationId,
  className,
}: ChatPanelProps) {
  const [input, setInput] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    })
  }, [messages, isAsking])

  const canSend = input.trim().length > 0 && !isAsking && readySourceCount > 0

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!canSend) return

    onSend(input)
    setInput("")
  }

  return (
    <section className={cn("flex h-full min-w-0 flex-col", className)}>
      <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3 sm:px-6">
        <div>
          <h1 className="text-base font-semibold">Ask Polyglot</h1>
          <p className="text-xs text-muted-foreground">
            Question &amp; answer over your knowledge base
          </p>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 space-y-6 overflow-y-auto px-4 py-6 sm:px-6"
      >
        {messages.length === 0 ? (
          <EmptyState
            readySourceCount={readySourceCount}
            hasProcessingSources={hasProcessingSources}
          />
        ) : (
          messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              onCitationClick={onCitationClick}
              activeCitationId={activeCitationId}
            />
          ))
        )}

        {isAsking && (statusLabel || !messages.some((m) => m.role === "assistant" && m.content)) ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" />
            {statusLabel ??
              "Expanding your question and searching your sources..."}
          </div>
        ) : null}
      </div>

      <footer className="shrink-0 border-t border-border p-4 sm:p-6">
        <form onSubmit={handleSubmit} className="mx-auto flex max-w-3xl gap-2">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={
              readySourceCount > 0
                ? "Ask a question about your sources..."
                : "Add a source before asking a question"
            }
            disabled={readySourceCount === 0}
            className="max-h-32 min-h-[44px] resize-none py-2.5"
            rows={1}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                handleSubmit(event)
              }
            }}
          />
          <Button
            type="submit"
            size="icon-lg"
            disabled={!canSend}
            aria-label="Send message"
          >
            <SendIcon />
          </Button>
        </form>
        <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-muted-foreground">
          Answers are generated from your indexed sources. Click a citation to
          view the exact excerpt.
        </p>
      </footer>
    </section>
  )
}
