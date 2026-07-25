"use client"

import { useRef, useState } from "react"
import {
  FileTextIcon,
  GlobeIcon,
  ImageIcon,
  LinkIcon,
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
import { Label } from "@/components/ui/label"
import {
  UPLOAD_OPTIONS,
  createSourceFromUpload,
  type KnowledgeSource,
  type UploadType,
} from "@/components/dashboard/dummy-data"
import { cn } from "@/lib/utils"

interface UploadDialogProps {
  type: UploadType | null
  open: boolean
  activeSource: KnowledgeSource | null
  onOpenChange: (open: boolean) => void
  onSourceAdded: (source: KnowledgeSource) => void
}

function getUploadIcon(type: UploadType) {
  switch (type) {
    case "pdf":
    case "doc":
    case "vtt":
      return FileTextIcon
    case "image":
      return ImageIcon
    case "webpage":
      return GlobeIcon
    case "youtube":
      return VideoIcon
  }
}

export function UploadDialog({
  type,
  open,
  activeSource,
  onOpenChange,
  onSourceAdded,
}: UploadDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [linkValue, setLinkValue] = useState("")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const option = UPLOAD_OPTIONS.find((item) => item.type === type)
  const Icon = type ? getUploadIcon(type) : FileTextIcon

  function resetForm() {
    setLinkValue("")
    setSelectedFile(null)
    setPreviewUrl(null)
    setIsDragging(false)
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      resetForm()
    }
    onOpenChange(nextOpen)
  }

  function handleFileSelect(file: File | null) {
    setSelectedFile(file)

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
    }

    if (file && type === "image") {
      setPreviewUrl(URL.createObjectURL(file))
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (!type || !option) {
      return
    }

    const sourceName =
      option.mode === "file"
        ? (selectedFile?.name ?? "Uploaded file")
        : linkValue.trim()

    onSourceAdded(createSourceFromUpload(type, sourceName))
    handleOpenChange(false)
  }

  if (!option) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <div className="mb-1 flex size-10 items-center justify-center rounded-lg bg-muted">
              <Icon className="size-5 text-foreground" />
            </div>
            <DialogTitle>Add {option.label}</DialogTitle>
            <DialogDescription>{option.description}</DialogDescription>
          </DialogHeader>

          {activeSource ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
              Adding this source will replace{" "}
              <span className="font-medium">{activeSource.name}</span>. Only one
              source can be active at a time.
            </div>
          ) : null}

          <div className="py-4">
            {option.mode === "file" ? (
              <div className="space-y-3">
                <input
                  ref={inputRef}
                  type="file"
                  accept={option.accept}
                  className="sr-only"
                  onChange={(event) => {
                    handleFileSelect(event.target.files?.[0] ?? null)
                  }}
                />
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => inputRef.current?.click()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      inputRef.current?.click()
                    }
                  }}
                  onDragOver={(event) => {
                    event.preventDefault()
                    setIsDragging(true)
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault()
                    setIsDragging(false)
                    handleFileSelect(event.dataTransfer.files?.[0] ?? null)
                  }}
                  className={cn(
                    "flex min-h-40 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
                    isDragging
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-foreground/30 hover:bg-muted/40"
                  )}
                >
                  {previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewUrl}
                      alt="Selected image preview"
                      className="max-h-28 rounded-lg object-contain"
                    />
                  ) : (
                    <UploadCloudIcon className="size-8 text-muted-foreground" />
                  )}
                  <div>
                    <p className="text-sm font-medium">
                      {selectedFile
                        ? selectedFile.name
                        : "Drag & drop or click to browse"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {type === "image"
                        ? "PNG, JPG, WEBP, GIF supported"
                        : `${option.accept?.replace(/\./g, "").toUpperCase()} files supported`}
                    </p>
                    {type === "image" ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Text will be extracted via OCR after upload.
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="source-link">
                  {option.type === "youtube" ? "YouTube URL" : "Webpage URL"}
                </Label>
                <div className="relative">
                  <LinkIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="source-link"
                    type="url"
                    placeholder={option.placeholder}
                    value={linkValue}
                    onChange={(event) => setLinkValue(event.target.value)}
                    className="pl-8"
                    required
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={option.mode === "file" ? !selectedFile : !linkValue.trim()}
            >
              {option.mode === "file" ? "Upload" : "Add link"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
