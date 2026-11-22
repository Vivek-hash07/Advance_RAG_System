"use client"

import { useRouter } from "next/navigation"
import { BrainIcon, LogOutIcon, MessageSquarePlusIcon, PlusIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SourceIcon } from "@/components/dashboard/source-icon"
import { SourceList } from "@/components/dashboard/source-list"
import {
  UPLOAD_OPTIONS,
  type KnowledgeSource,
  type UploadType,
} from "@/components/dashboard/types"
import { authClient } from "@/src/lib/auth-client"
import { cn } from "@/lib/utils"

export interface ConversationSummary {
  id: string
  title: string
  updatedAt: string
}

interface DashboardSidebarProps {
  sources: KnowledgeSource[]
  selectedSourceIds: Set<string>
  onToggleSource: (id: string) => void
  onUploadClick: (type: UploadType) => void
  onRemoveSource: (id: string) => Promise<void>
  conversations?: ConversationSummary[]
  activeConversationId?: string | null
  onSelectConversation?: (id: string) => void
  onNewConversation?: () => void
  onDeleteConversation?: (id: string) => void
  onOpenMemories?: () => void
  className?: string
}

function initialsOf(name?: string | null, email?: string | null): string {
  const source = name?.trim() || email?.trim() || "?"
  return source
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

function UserFooter() {
  const router = useRouter()
  const { data: session, isPending } = authClient.useSession()

  async function handleSignOut() {
    await authClient.signOut()
    router.push("/signin")
  }

  return (
    <div className="border-t border-sidebar-border p-3">
      <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
        <div className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-semibold">
          {isPending
            ? ""
            : initialsOf(session?.user?.name, session?.user?.email)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {session?.user?.name ?? "Signed in"}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {session?.user?.email ?? ""}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Sign out"
          onClick={handleSignOut}
        >
          <LogOutIcon />
        </Button>
      </div>
    </div>
  )
}

export function DashboardSidebar({
  sources,
  selectedSourceIds,
  onToggleSource,
  onUploadClick,
  onRemoveSource,
  conversations = [],
  activeConversationId = null,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onOpenMemories,
  className,
}: DashboardSidebarProps) {
  return (
    <aside
      className={cn(
        "flex h-full w-full flex-col border-r border-border bg-sidebar text-sidebar-foreground",
        className,
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

      <div className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-4">
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Chats
          </p>
          <div className="flex items-center gap-1">
            {onOpenMemories ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Manage memories"
                onClick={onOpenMemories}
              >
                <BrainIcon />
              </Button>
            ) : null}
            {onNewConversation ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="New chat"
                onClick={onNewConversation}
              >
                <MessageSquarePlusIcon />
              </Button>
            ) : null}
          </div>
        </div>

        {conversations.length > 0 ? (
          <ul className="mb-4 grid gap-1">
            {conversations.map((conversation) => (
              <li key={conversation.id} className="group flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onSelectConversation?.(conversation.id)}
                  className={cn(
                    "min-w-0 flex-1 truncate rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
                    activeConversationId === conversation.id
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  {conversation.title}
                </button>
                {onDeleteConversation ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${conversation.title}`}
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={() => onDeleteConversation(conversation.id)}
                  >
                    <Trash2Icon />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 px-1 text-xs text-muted-foreground">
            Start asking to create a conversation.
          </p>
        )}

        <Separator className="my-4" />

        <div className="mb-2 px-1">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Add source
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Documents, transcripts, YouTube, webpages, and images.
          </p>
        </div>

        <div className="grid gap-1.5">
          {UPLOAD_OPTIONS.map((option) => (
            <button
              key={option.type}
              type="button"
              disabled={!option.enabled}
              onClick={() => onUploadClick(option.type)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                option.enabled
                  ? "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  : "cursor-not-allowed opacity-50",
              )}
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted">
                <SourceIcon
                  type={option.type}
                  className="size-3.5 text-muted-foreground"
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{option.label}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {option.action}
                </span>
              </span>
              {option.enabled ? (
                <PlusIcon className="size-3.5 shrink-0 text-muted-foreground" />
              ) : null}
            </button>
          ))}
        </div>

        <Separator className="my-4" />

        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Your sources
          </p>
          {sources.length > 0 ? (
            <span className="text-xs text-muted-foreground">
              {sources.length}
            </span>
          ) : null}
        </div>

        <SourceList
          sources={sources}
          selectedIds={selectedSourceIds}
          onToggleSelect={onToggleSource}
          onRemove={onRemoveSource}
        />
      </div>

      <UserFooter />
    </aside>
  )
}
