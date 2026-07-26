"use client"

import { useRef, useState } from "react"
import { AlertCircleIcon, Loader2Icon, UploadCloudIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { SourceIcon } from "@/components/dashboard/source-icon"
import {
  UPLOAD_OPTIONS,
  type KnowledgeSource,
  type UploadType,
} from "@/components/dashboard/types"
import { cn } from "@/lib/utils"

interface UploadDialogProps {
  type: UploadType | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpload: (file: File) => Promise<KnowledgeSource>
}

function formatAcceptList(accept: string): string {
  return accept
    .split(",")
    .map((extension) => extension.replace(".", "").toUpperCase())
    .join(", ")
}

export function UploadDialog({
  type,
  open,
  onOpenChange,
  onUpload,
}: UploadDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const option = UPLOAD_OPTIONS.find((item) => item.type === type)

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

  function handleOpenChange(nextOpen: boolean) {
    if (isUploading) return

    if (!nextOpen) {
      clearSelection()
      setIsDragging(false)
      setError(null)
    }

    onOpenChange(nextOpen)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (!selectedFile || isUploading) return

    setIsUploading(true)
    setError(null)

    try {
      await onUpload(selectedFile)
      clearSelection()
      onOpenChange(false)
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Upload failed. Please try again.",
      )
      clearSelection()
    } finally {
      setIsUploading(false)
    }
  }

  if (!option || !type) {
    return null
  }

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
              aria-disabled={isUploading}
              onClick={() => !isUploading && inputRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  if (!isUploading) inputRef.current?.click()
                }
              }}
              onDragOver={(event) => {
                event.preventDefault()
                if (!isUploading) setIsDragging(true)
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(event) => {
                event.preventDefault()
                setIsDragging(false)
                if (isUploading) return
                setSelectedFile(event.dataTransfer.files?.[0] ?? null)
                setError(null)
              }}
              className={cn(
                "flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
                isUploading
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

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!selectedFile || isUploading}>
              {isUploading ? (
                <>
                  <Loader2Icon className="animate-spin" />
                  Uploading
                </>
              ) : (
                "Upload"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
