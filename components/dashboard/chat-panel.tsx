"use client"

import { useEffect, useRef, useState } from "react"
import { BotIcon, Loader2Icon, SendIcon, UserIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  DUMMY_MESSAGES,
  getSourceTypeLabel,
  type ChatMessage,
  type SourceCitation,
} from "@/components/dashboard/dummy-data"
import { cn } from "@/lib/utils"

interface ChatPanelProps {
  onCitationClick: (citation: SourceCitation) => void
  activeCitationId?: string | null
  className?: string
}

function MessageBubble({
  message,
  onCitationClick,
  activeCitationId,
}: {
  message: ChatMessage
  onCitationClick: (citation: SourceCitation) => void
  activeCitationId?: string | null
}) {
  const isUser = message.role === "user"

  return (
    <div
      className={cn(
        "flex gap-3",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
        )}
      >
        {isUser ? (
          <UserIcon className="size-4" />
        ) : (
          <BotIcon className="size-4" />
        )}
      </div>

      <div
        className={cn(
          "flex max-w-[85%] flex-col gap-2 sm:max-w-[75%]",
          isUser ? "items-end" : "items-start"
        )}
      >
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
            isUser
              ? "rounded-tr-sm bg-primary text-primary-foreground"
              : "rounded-tl-sm border border-border bg-card text-black"
          )}
        >
          {message.content}
        </div>

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
                      "border-white bg-white text-black hover:text-black"
                  )}
                >
                  {getSourceTypeLabel(citation.sourceType)} · {citation.sourceName}
                </Badge>
              </button>
            ))}
          </div>
        ) : null}

        <span className="px-1 text-[11px] text-muted-foreground">
          {message.createdAt}
        </span>
      </div>
    </div>
  )
}

export function ChatPanel({
  onCitationClick,
  activeCitationId,
  className,
}: ChatPanelProps) {
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState(DUMMY_MESSAGES)
  const [isSending, setIsSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    })
  }, [messages, isSending])

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = input.trim()
    if (!trimmed || isSending) {
      return
    }

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: trimmed,
      createdAt: new Date().toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      }),
    }

    setMessages((current) => [...current, userMessage])
    setInput("")
    setIsSending(true)

    window.setTimeout(() => {
      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: "assistant",
        content:
          "This is a placeholder response. Once the RAG backend is connected, answers will be grounded in your uploaded sources with clickable citations.",
        createdAt: new Date().toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        }),
      }
      setMessages((current) => [...current, assistantMessage])
      setIsSending(false)
    }, 900)
  }

  return (
    <section className={cn("flex h-full min-w-0 flex-col", className)}>
      <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3 sm:px-6">
        <div>
          <h1 className="text-base font-semibold">Ask Polyglot</h1>
          <p className="text-xs text-muted-foreground">
            Question & answer over your knowledge base
          </p>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 space-y-6 overflow-y-auto px-4 py-6 sm:px-6"
      >
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            onCitationClick={onCitationClick}
            activeCitationId={activeCitationId}
          />
        ))}

        {isSending ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" />
            Polyglot is thinking...
          </div>
        ) : null}
      </div>

      <footer className="shrink-0 border-t border-border p-4 sm:p-6">
        <form onSubmit={handleSubmit} className="mx-auto flex max-w-3xl gap-2">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask a question about your sources..."
            className="min-h-[44px] max-h-32 resize-none py-2.5"
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
            disabled={!input.trim() || isSending}
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
