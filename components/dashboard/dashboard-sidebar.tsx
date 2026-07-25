"use client"

import {
  FileTextIcon,
  GlobeIcon,
  ImageIcon,
  LogOutIcon,
  PlusIcon,
  VideoIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  UPLOAD_OPTIONS,
  getSourceTypeLabel,
  type KnowledgeSource,
  type UploadType,
} from "@/components/dashboard/dummy-data"
import { cn } from "@/lib/utils"

interface DashboardSidebarProps {
  activeSource: KnowledgeSource | null
  onUploadClick: (type: UploadType) => void
  className?: string
}

function SourceTypeIcon({
  type,
  className,
}: {
  type: KnowledgeSource["type"]
  className?: string
}) {
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

function UploadOptionIcon({
  type,
  className,
}: {
  type: UploadType
  className?: string
}) {
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

export function DashboardSidebar({
  activeSource,
  onUploadClick,
  className,
}: DashboardSidebarProps) {
  return (
    <aside
      className={cn(
        "flex h-full w-full flex-col border-r border-border bg-sidebar text-sidebar-foreground",
        className
      )}
    >
      <div className="flex items-center gap-2.5 border-b border-sidebar-border px-4 py-4">
        <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
          <span className="text-sm font-bold">P</span>
        </div>
        <div>
          <p className="text-sm font-semibold">Polyglot</p>
          <p className="text-xs text-muted-foreground">Knowledge workspace</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <div className="mb-2 px-1">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Add source
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            One source at a time — PDF, document, image, webpage, VTT, or
            YouTube.
          </p>
        </div>

        <div className="grid gap-1.5">
          {UPLOAD_OPTIONS.map((option) => {
            const isActive = activeSource?.type === option.type

            return (
              <button
                key={option.type}
                type="button"
                onClick={() => onUploadClick(option.type)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  isActive && "bg-sidebar-accent/80"
                )}
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted">
                  <UploadOptionIcon
                    type={option.type}
                    className="size-3.5 text-muted-foreground"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{option.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {option.mode === "file" ? "Upload file" : "Paste link"}
                  </span>
                </span>
                <PlusIcon className="size-3.5 shrink-0 text-muted-foreground" />
              </button>
            )
          })}
        </div>

        <Separator className="my-4" />

        <div className="mb-2 px-1">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Active source
          </p>
        </div>

        {activeSource ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2.5">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted">
              <SourceTypeIcon
                type={activeSource.type}
                className="size-3.5 text-muted-foreground"
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {activeSource.name}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>{getSourceTypeLabel(activeSource.type)}</span>
                <span>·</span>
                <span>{activeSource.addedAt}</span>
              </span>
            </span>
            <span
              className={cn(
                "mt-1 size-1.5 shrink-0 rounded-full",
                activeSource.status === "ready" && "bg-emerald-500",
                activeSource.status === "processing" && "bg-amber-500",
                activeSource.status === "failed" && "bg-destructive"
              )}
            />
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border px-3 py-4 text-center">
            <p className="text-sm text-muted-foreground">No source added yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Choose a source type above to get started.
            </p>
          </div>
        )}
      </div>

      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
          <div className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-semibold">
            VS
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">Vivek Sarvaiya</p>
            <p className="truncate text-xs text-muted-foreground">
              vivek@example.com
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="Sign out">
            <LogOutIcon />
          </Button>
        </div>
      </div>
    </aside>
  )
}
