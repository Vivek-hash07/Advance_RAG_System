/** Formats the vectorless ingest pipeline can process today. */
export type SourceKind = "pdf" | "doc" | "text" | "vtt"

/** Source types the sidebar advertises, including ones not wired up yet. */
export type UploadType = SourceKind | "webpage" | "youtube" | "image"

export type SourceStatus = "queued" | "processing" | "ready" | "failed"

/** Shape returned by `/api/sources`. */
export interface KnowledgeSource {
  id: string
  name: string
  sourceKind: SourceKind
  status: SourceStatus
  errorMessage: string | null
  pageCount: number | null
  createdAt: string
}

/** Shape returned inside `/api/chat` responses. */
export interface SourceCitation {
  id: string
  documentId: string
  documentName: string
  sourceKind: SourceKind
  nodeId: string
  title: string
  pageIndex: number | null
  timestamp: string | null
  excerpt: string
  highlightedText: string
}

export interface OptimizedQuery {
  original: string
  rewritten: string
  stepBack: string
  subQueries: string[]
  hyde: string
}

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  citations?: SourceCitation[]
  queries?: OptimizedQuery
  error?: boolean
  createdAt: string
}

interface UploadOption {
  type: UploadType
  label: string
  description: string
  accept?: string
  /** Unwired source types stay visible but disabled. */
  enabled: boolean
}

export const UPLOAD_OPTIONS: UploadOption[] = [
  {
    type: "pdf",
    label: "PDF",
    description: "Upload a PDF document",
    accept: ".pdf",
    enabled: true,
  },
  {
    type: "doc",
    label: "Word document",
    description: "Upload a .docx file",
    accept: ".docx",
    enabled: true,
  },
  {
    type: "text",
    label: "Text or Markdown",
    description: "Upload a .txt or .md file",
    accept: ".txt,.md,.markdown",
    enabled: true,
  },
  {
    type: "vtt",
    label: "VTT transcript",
    description: "Upload a WebVTT subtitle or transcript file",
    accept: ".vtt",
    enabled: true,
  },
  {
    type: "webpage",
    label: "Webpage",
    description: "Coming soon",
    enabled: false,
  },
  {
    type: "youtube",
    label: "YouTube video",
    description: "Coming soon",
    enabled: false,
  },
  {
    type: "image",
    label: "Image",
    description: "Coming soon",
    enabled: false,
  },
]

const KIND_LABELS: Record<UploadType, string> = {
  pdf: "PDF",
  doc: "Document",
  text: "Text",
  vtt: "Transcript",
  webpage: "Webpage",
  youtube: "YouTube",
  image: "Image",
}

export function getSourceTypeLabel(type: UploadType): string {
  return KIND_LABELS[type] ?? type
}

/** Where in the source a citation points — a page number or a timestamp. */
export function getCitationLocation(citation: SourceCitation): string {
  if (citation.timestamp) {
    return citation.timestamp
  }
  if (citation.pageIndex !== null) {
    return `Page ${citation.pageIndex}`
  }
  return citation.title || "Referenced section"
}

export function formatRelativeTime(isoDate: string): string {
  const elapsedMs = Date.now() - new Date(isoDate).getTime()
  const minutes = Math.round(elapsedMs / 60_000)

  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  return `${Math.round(hours / 24)}d ago`
}

export function formatClockTime(date: Date = new Date()): string {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}
