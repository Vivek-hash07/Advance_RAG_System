"use client"

import { useCallback, useRef, useState } from "react"

import {
  formatClockTime,
  type ChatMessage,
} from "@/components/dashboard/types"
import { ApiError } from "@/lib/api/client"
import { askQuestion } from "@/lib/api/chat"

let messageCounter = 0

function nextId(prefix: string): string {
  messageCounter += 1
  return `${prefix}-${Date.now()}-${messageCounter}`
}

/** Drives the chat transcript against the vectorless RAG endpoint. */
export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isAsking, setIsAsking] = useState(false)
  // A ref, not the state value: two submits in the same tick would both see
  // `isAsking === false` and fire duplicate requests.
  const inFlightRef = useRef(false)

  const send = useCallback(
    async (question: string) => {
      const trimmed = question.trim()
      if (!trimmed || inFlightRef.current) return

      inFlightRef.current = true

      setMessages((current) => [
        ...current,
        {
          id: nextId("user"),
          role: "user",
          content: trimmed,
          createdAt: formatClockTime(),
        },
      ])
      setIsAsking(true)

      try {
        const result = await askQuestion(trimmed)

        setMessages((current) => [
          ...current,
          {
            id: nextId("assistant"),
            role: "assistant",
            content: result.answer,
            citations: result.citations,
            queries: result.queries,
            createdAt: formatClockTime(),
          },
        ])
      } catch (error) {
        const content =
          error instanceof ApiError
            ? error.message
            : "Something went wrong while answering. Please try again."

        setMessages((current) => [
          ...current,
          {
            id: nextId("assistant"),
            role: "assistant",
            content,
            error: true,
            createdAt: formatClockTime(),
          },
        ])
      } finally {
        inFlightRef.current = false
        setIsAsking(false)
      }
    },
    [],
  )

  const reset = useCallback(() => setMessages([]), [])

  return { messages, isAsking, send, reset }
}
