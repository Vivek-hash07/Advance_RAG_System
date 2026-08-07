"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import {
  formatClockTime,
  type ChatMessage,
  type OptimizedQuery,
  type PendingVideo,
  type SourceCitation,
} from "@/components/dashboard/types"
import { ApiError } from "@/lib/api/client"
import { askQuestionStream } from "@/lib/api/chat"
import {
  deleteConversation,
  fetchConversation,
  fetchConversations,
  type ConversationSummary,
} from "@/lib/api/conversations"

let messageCounter = 0

function nextId(prefix: string): string {
  messageCounter += 1
  return `${prefix}-${Date.now()}-${messageCounter}`
}

const STATUS_LABELS: Record<string, string> = {
  remembering: "Checking your memories...",
  optimizing: "Expanding your question...",
  retrieving: "Searching your sources...",
  answering: "Writing an answer...",
}

function toChatMessages(
  rows: Array<{
    id: string
    role: "user" | "assistant"
    content: string
    citations: SourceCitation[] | null
    queries: OptimizedQuery | null
    pendingVideos: PendingVideo[] | null
    createdAt: string
  }>,
): ChatMessage[] {
  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    citations: row.citations ?? undefined,
    queries: row.queries
      ? {
          original: row.queries.original,
          rewritten: row.queries.rewritten,
          stepBack: row.queries.stepBack,
          subQueries: row.queries.subQueries,
          hyde: row.queries.hyde,
        }
      : undefined,
    pendingVideos: row.pendingVideos ?? undefined,
    createdAt: formatClockTime(new Date(row.createdAt)),
  }))
}

/** Drives the chat transcript against the vectorless RAG endpoint. */
export function useChat(selectedDocumentIds: string[]) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isAsking, setIsAsking] = useState(false)
  const [statusLabel, setStatusLabel] = useState<string | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const inFlightRef = useRef(false)
  const selectedIdsRef = useRef(selectedDocumentIds)
  selectedIdsRef.current = selectedDocumentIds

  const refreshConversations = useCallback(async () => {
    const { conversations: next } = await fetchConversations()
    setConversations(next)
  }, [])

  useEffect(() => {
    void refreshConversations().catch(() => {
      // Conversations are best-effort on first paint.
    })
  }, [refreshConversations])

  const loadConversation = useCallback(async (id: string) => {
    const { conversation, messages: rows } = await fetchConversation(id)
    setConversationId(conversation.id)
    setMessages(toChatMessages(rows))
  }, [])

  const startNewConversation = useCallback(() => {
    setConversationId(null)
    setMessages([])
    setStatusLabel(null)
  }, [])

  const removeConversation = useCallback(
    async (id: string) => {
      await deleteConversation(id)
      if (conversationId === id) {
        startNewConversation()
      }
      await refreshConversations()
    },
    [conversationId, refreshConversations, startNewConversation],
  )

  const send = useCallback(
    async (question: string) => {
      const trimmed = question.trim()
      if (!trimmed || inFlightRef.current) return

      inFlightRef.current = true

      const userId = nextId("user")
      const assistantId = nextId("assistant")

      setMessages((current) => [
        ...current,
        {
          id: userId,
          role: "user",
          content: trimmed,
          createdAt: formatClockTime(),
        },
        {
          id: assistantId,
          role: "assistant",
          content: "",
          createdAt: formatClockTime(),
        },
      ])
      setIsAsking(true)
      setStatusLabel(STATUS_LABELS.optimizing)

      const selected = selectedIdsRef.current
      const documentIds =
        selected.length > 0 ? selected : undefined

      try {
        await askQuestionStream(trimmed, {
          documentIds,
          conversationId,
          onEvent: (event) => {
            if (event.type === "meta") {
              setConversationId(event.conversationId)
              setMessages((current) =>
                current.map((message) =>
                  message.id === userId
                    ? { ...message, id: event.userMessageId }
                    : message,
                ),
              )
              return
            }

            if (event.type === "status") {
              setStatusLabel(STATUS_LABELS[event.stage] ?? event.stage)
              return
            }

            if (event.type === "delta") {
              setStatusLabel(null)
              setMessages((current) =>
                current.map((message) =>
                  message.id === assistantId
                    ? { ...message, content: message.content + event.text }
                    : message,
                ),
              )
              return
            }

            if (event.type === "done") {
              setStatusLabel(null)
              setMessages((current) =>
                current.map((message) =>
                  message.id === assistantId
                    ? {
                        ...message,
                        id: event.messageId,
                        content: event.answer,
                        citations: event.citations,
                        queries: {
                          original: event.queries.original,
                          rewritten: event.queries.rewritten,
                          stepBack: event.queries.stepBack,
                          subQueries: event.queries.subQueries,
                          hyde: event.queries.hyde,
                        },
                        pendingVideos: event.pendingVideos,
                      }
                    : message,
                ),
              )
            }
          },
        })

        await refreshConversations()
      } catch (error) {
        const content =
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Something went wrong while answering. Please try again."

        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? { ...message, content, error: true }
              : message,
          ),
        )
      } finally {
        inFlightRef.current = false
        setIsAsking(false)
        setStatusLabel(null)
      }
    },
    [conversationId, refreshConversations],
  )

  const reset = useCallback(() => startNewConversation(), [startNewConversation])

  return {
    messages,
    isAsking,
    statusLabel,
    conversationId,
    conversations,
    send,
    reset,
    loadConversation,
    startNewConversation,
    removeConversation,
  }
}
