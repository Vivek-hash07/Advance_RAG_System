"use client"

import { useState } from "react"
import { MenuIcon, PanelRightIcon } from "lucide-react"

import { ChatPanel } from "@/components/dashboard/chat-panel"
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar"
import {
  SourcePanel,
  SourcePanelContent,
} from "@/components/dashboard/source-panel"
import { UploadDialog } from "@/components/dashboard/upload-dialog"
import type {
  KnowledgeSource,
  SourceCitation,
  UploadType,
} from "@/components/dashboard/types"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { useChat } from "@/hooks/use-chat"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useSources } from "@/hooks/use-sources"
import { cn } from "@/lib/utils"

interface DashboardShellProps {
  initialSources: KnowledgeSource[]
}

export function DashboardShell({ initialSources }: DashboardShellProps) {
  const isMobile = useMediaQuery("(max-width: 1023px)")
  const { sources, readySources, upload, addLink, remove } =
    useSources(initialSources)
  const { messages, isAsking, send } = useChat()

  const [uploadType, setUploadType] = useState<UploadType | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [selectedCitation, setSelectedCitation] =
    useState<SourceCitation | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sourceOpen, setSourceOpen] = useState(false)

  const hasProcessingSources = sources.some(
    (source) => source.status === "queued" || source.status === "processing",
  )

  function handleUploadClick(type: UploadType) {
    setUploadType(type)
    setUploadOpen(true)
    setSidebarOpen(false)
  }

  function handleCitationClick(citation: SourceCitation) {
    setSelectedCitation(citation)
    if (isMobile) {
      setSourceOpen(true)
    }
  }

  function handleCloseSource() {
    setSelectedCitation(null)
    setSourceOpen(false)
  }

  function handleSourceOpenChange(open: boolean) {
    setSourceOpen(open)
    if (!open) {
      setSelectedCitation(null)
    }
  }

  async function handleRemoveSource(id: string) {
    await remove(id)
    // A citation pointing at a deleted source has nothing left to show.
    setSelectedCitation((current) =>
      current?.documentId === id ? null : current,
    )
  }

  const sidebar = (
    <DashboardSidebar
      sources={sources}
      onUploadClick={handleUploadClick}
      onRemoveSource={handleRemoveSource}
    />
  )

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-3 lg:hidden">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open sidebar"
        >
          <MenuIcon />
          Sources
        </Button>
        <div className="text-sm font-semibold">Polyglot</div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSourceOpen(true)}
          aria-label="Open source panel"
          disabled={!selectedCitation}
        >
          <PanelRightIcon />
          Source
        </Button>
      </div>

      <div
        className={cn(
          "grid min-h-0 flex-1",
          selectedCitation
            ? "lg:grid-cols-[17rem_minmax(0,1fr)_22rem] xl:grid-cols-[18rem_minmax(0,1fr)_24rem]"
            : "lg:grid-cols-[17rem_minmax(0,1fr)]",
        )}
      >
        <div className="hidden min-h-0 lg:block">{sidebar}</div>

        <div className="min-h-0 min-w-0">
          <ChatPanel
            messages={messages}
            isAsking={isAsking}
            readySourceCount={readySources.length}
            hasProcessingSources={hasProcessingSources}
            onSend={send}
            onCitationClick={handleCitationClick}
            activeCitationId={selectedCitation?.id}
          />
        </div>

        {selectedCitation ? (
          <div className="hidden min-h-0 lg:block">
            <SourcePanel
              citation={selectedCitation}
              onClose={handleCloseSource}
            />
          </div>
        ) : null}
      </div>

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="max-w-[18rem] p-0"
        >
          {sidebar}
        </SheetContent>
      </Sheet>

      {isMobile && selectedCitation ? (
        <Sheet open={sourceOpen} onOpenChange={handleSourceOpenChange}>
          <SheetContent
            side="right"
            showCloseButton={false}
            className="max-w-md p-0"
          >
            <SourcePanelContent
              citation={selectedCitation}
              onClose={handleCloseSource}
            />
          </SheetContent>
        </Sheet>
      ) : null}

      <UploadDialog
        type={uploadType}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUpload={upload}
        onAddLink={addLink}
      />
    </div>
  )
}
