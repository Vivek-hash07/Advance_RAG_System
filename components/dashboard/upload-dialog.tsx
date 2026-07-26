"use client"

import { useRef, useState } from "react"
import {
  AlertCircleIcon,
  ListVideoIcon,
  Loader2Icon,
  UploadCloudIcon,
  VideoIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { SourceIcon } from "@/components/dashboard/source-icon"
import {
  UPLOAD_OPTIONS,
  type KnowledgeSource,
  type UploadType,
} from "@/components/dashboard/types"
import { ApiError } from "@/lib/api/client"
import type { AmbiguousLinkBody, YoutubeChoice } from "@/lib/api/sources"
import { cn } from "@/lib/utils"

interface UploadDialogProps {
  type: UploadType | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpload: (file: File) => Promise<KnowledgeSource>
  onAddLink: (
    url: string,
    preference?: "video" | "playlist",
  ) => Promise<KnowledgeSource>
}

function formatAcceptList(accept: string): string {
  return accept
    .split(",")
    .map((extension) => extension.replace(".", "").toUpperCase())
    .join(", ")
}

/**
 * A link carrying both `v=` and `list=` could reasonably mean either thing, so
 * the server refuses to guess and the user picks here. Defaulting to the whole
 * playlist would mean quietly ingesting hundreds of videos from a link that was
 * shared to point at one.
 */
function ChoicePrompt({
  choice,
  isSubmitting,
  onChoose,
}: {
  choice: YoutubeChoice
  isSubmitting: boolean
  onChoose: (preference: "video" | "playlist") => void
}) {
  const options = [
    {
      preference: "video" as const,
      Icon: VideoIcon,
      label: "Just this video",
      title: choice.video.title,
    },
    {
      preference: "playlist" as const,
      Icon: ListVideoIcon,
      label: `The whole playlist (${choice.playlist.itemCount} videos)`,
      title: choice.playlist.title,
    },
  ]

  return (
    <div className="grid gap-2 py-4">
      <p className="text-sm text-muted-foreground">
        That link points at a video inside a playlist. Which did you mean?
      </p>

      {options.map(({ preference, Icon, label, title }) => (
        <button
          key={preference}
          type="button"
          disabled={isSubmitting}
          onClick={() => onChoose(preference)}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl border border-border px-3 py-3 text-left transition-colors",
            isSubmitting
              ? "cursor-not-allowed opacity-60"
              : "hover:border-foreground/30 hover:bg-muted/40",
          )}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Icon className="size-4 text-muted-foreground" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{label}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {title}
            </span>
          </span>
        </button>
      ))}
    </div>
  )
}

export function UploadDialog({
  type,
  open,
  onOpenChange,
  onUpload,
  onAddLink,
}: UploadDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [url, setUrl] = useState("")
  const [choice, setChoice] = useState<YoutubeChoice | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const option = UPLOAD_OPTIONS.find((item) => item.type === type)
  const isLink = option?.input === "url"

  /**
   * Clear the native input alongside React state, otherwise re-picking the same
   * file fires no `change` event and the upload cannot be retried.
   */
  function clearSelection() {
    setSelectedFile(null)
    if (inputRef.current) {
      inputRef.current.value = ""
    }
  }

  function reset() {
    clearSelection()
    setUrl("")
    setChoice(null)
    setIsDragging(false)
    setError(null)
  }

  function handleOpenChange(nextOpen: boolean) {
    if (isSubmitting) return

    if (!nextOpen) {
      reset()
    }

    onOpenChange(nextOpen)
  }

  function describeFailure(failure: unknown): string {
    return failure instanceof Error
      ? failure.message
      : "Something went wrong. Please try again."
  }

  async function submitLink(preference?: "video" | "playlist") {
    setIsSubmitting(true)
    setError(null)

    try {
      await onAddLink(url.trim(), preference)
      reset()
      onOpenChange(false)
    } catch (failure) {
      // 409 with a choice is not an error, it is a question.
      if (failure instanceof ApiError && failure.status === 409) {
        const body = failure.body as AmbiguousLinkBody | undefined

        if (body?.choice) {
          setChoice(body.choice)
          return
        }
      }

      setError(describeFailure(failure))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (isSubmitting) return

    if (isLink) {
      if (!url.trim()) return
      await submitLink()
      return
    }

    if (!selectedFile) return

    setIsSubmitting(true)
    setError(null)

    try {
      await onUpload(selectedFile)
      clearSelection()
      onOpenChange(false)
    } catch (failure) {
      setError(describeFailure(failure))
      clearSelection()
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!option || !type) {
    return null
  }

  const canSubmit = isLink ? url.trim().length > 0 : selectedFile !== null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <div className="mb-1 flex size-10 items-center justify-center rounded-lg bg-muted">
              <SourceIcon type={type} className="size-5 text-foreground" />
            </div>
            <DialogTitle>Add {option.label}</DialogTitle>
            <DialogDescription>{option.description}</DialogDescription>
          </DialogHeader>

          {choice ? (
            <ChoicePrompt
              choice={choice}
              isSubmitting={isSubmitting}
              onChoose={submitLink}
            />
          ) : isLink ? (
            <div className="py-4">
              <Input
                autoFocus
                type="url"
                inputMode="url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={url}
                disabled={isSubmitting}
                onChange={(event) => {
                  setUrl(event.target.value)
                  setError(null)
                }}
              />
              <p className="mt-3 text-xs text-muted-foreground">
                Videos, Shorts, past live streams and playlists are all
                supported. Videos without captions cannot be indexed.
              </p>

              {error ? (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" />
                  <span>{error}</span>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="py-4">
              <input
                ref={inputRef}
                type="file"
                accept={option.accept}
                className="sr-only"
                onChange={(event) => {
                  setSelectedFile(event.target.files?.[0] ?? null)
                  setError(null)
                }}
              />
              <div
                role="button"
                tabIndex={0}
                aria-disabled={isSubmitting}
                onClick={() => !isSubmitting && inputRef.current?.click()}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    if (!isSubmitting) inputRef.current?.click()
                  }
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  if (!isSubmitting) setIsDragging(true)
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(event) => {
                  event.preventDefault()
                  setIsDragging(false)
                  if (isSubmitting) return
                  setSelectedFile(event.dataTransfer.files?.[0] ?? null)
                  setError(null)
                }}
                className={cn(
                  "flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
                  isSubmitting
                    ? "cursor-not-allowed opacity-60"
                    : "cursor-pointer hover:border-foreground/30 hover:bg-muted/40",
                  isDragging ? "border-primary bg-primary/5" : "border-border",
                )}
              >
                <UploadCloudIcon className="size-8 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">
                    {selectedFile
                      ? selectedFile.name
                      : "Drag & drop or click to browse"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {option.accept
                      ? `${formatAcceptList(option.accept)} supported`
                      : ""}
                  </p>
                </div>
              </div>

              {type !== "pdf" ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  This file is converted to PDF before indexing, so answers can
                  cite exact pages.
                </p>
              ) : null}

              {error ? (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" />
                  <span>{error}</span>
                </div>
              ) : null}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            {choice ? null : (
              <Button type="submit" disabled={!canSubmit || isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2Icon className="animate-spin" />
                    {isLink ? "Adding" : "Uploading"}
                  </>
                ) : isLink ? (
                  "Add"
                ) : (
                  "Upload"
                )}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
