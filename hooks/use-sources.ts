"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import type { KnowledgeSource } from "@/components/dashboard/types"
import {
  addLinkSource,
  deleteSource,
  fetchSourceStatus,
  fetchSources,
  uploadSource,
} from "@/lib/api/sources"

const POLL_INTERVAL_MS = 3000

function isPending(source: KnowledgeSource): boolean {
  return source.status === "queued" || source.status === "processing"
}

/**
 * Owns the user's knowledge sources. The initial list is rendered on the server
 * and passed in, so this hook only handles mutations and polling of sources
 * PageIndex is still processing.
 */
export function useSources(initialSources: KnowledgeSource[]) {
  const [sources, setSources] = useState(initialSources)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Poll only while something is still being processed.
  const pendingKey = sources.filter(isPending).map((source) => source.id).join(",")

  useEffect(() => {
    if (!pendingKey) return

    const ids = pendingKey.split(",")

    const timer = setInterval(async () => {
      const settled = await Promise.allSettled(
        ids.map((id) => fetchSourceStatus(id)),
      )

      if (!isMountedRef.current) return

      const updates = settled
        .filter(
          (
            result,
          ): result is PromiseFulfilledResult<{ document: KnowledgeSource }> =>
            result.status === "fulfilled",
        )
        .map((result) => result.value.document)

      if (updates.length === 0) return

      setSources((current) =>
        current.map(
          (source) => updates.find((update) => update.id === source.id) ?? source,
        ),
      )
    }, POLL_INTERVAL_MS)

    return () => clearInterval(timer)
  }, [pendingKey])

  /** Add a new source, or replace it in place when it was already listed. */
  const absorb = useCallback((document: KnowledgeSource) => {
    if (!isMountedRef.current) return

    setSources((current) =>
      current.some((source) => source.id === document.id)
        ? current.map((source) =>
            source.id === document.id ? document : source,
          )
        : [document, ...current],
    )
  }, [])

  const upload = useCallback(
    async (file: File) => {
      const { document } = await uploadSource(file)
      absorb(document)
      return document
    },
    [absorb],
  )

  const addLink = useCallback(
    async (url: string, preference?: "video" | "playlist") => {
      const { document } = await addLinkSource(url, preference)
      absorb(document)
      return document
    },
    [absorb],
  )

  const remove = useCallback(async (id: string) => {
    // Drop it locally first, then restore on failure so the list stays truthful.
    let previous: KnowledgeSource[] = []
    setSources((current) => {
      previous = current
      return current.filter((source) => source.id !== id)
    })

    try {
      await deleteSource(id)
    } catch (error) {
      if (isMountedRef.current) {
        setSources(previous)
      }
      throw error
    }
  }, [])

  const refresh = useCallback(async () => {
    const { documents } = await fetchSources()
    if (isMountedRef.current) {
      setSources(documents)
    }
  }, [])

  return {
    sources,
    readySources: sources.filter((source) => source.status === "ready"),
    upload,
    addLink,
    remove,
    refresh,
  }
}
