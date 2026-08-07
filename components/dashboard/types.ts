/** Formats the vectorless ingest pipeline can process today. */
export type SourceKind = "pdf" | "doc" | "text" | "vtt" | "youtube" | "playlist"

/** Source types the sidebar advertises, including ones not wired up yet. */
export type UploadType = SourceKind | "webpage" | "image"

export type SourceStatus = "queued" | "processing" | "ready" | "failed"

/** Shape returned by `/api/sources`. */
export interface KnowledgeSource {
  id: string
  name: string
  sourceKind: SourceKind
  status: SourceStatus
  errorMessage: string | null
  pageCount: number | null
  sourceUrl: string | null
  /** Human-readable size, e.g. "42 pages" or "18 videos". */
  detail: string | null
  truncated: boolean | null
  unavailableCount: number | null
  failedCount: number | null
  failedVideos: Array<{
    videoId: string
    title: string
    errorMessage: string | null
  }>
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
  /** Deep link back to the source, seeked to `timestamp` for videos. */
  sourceUrl: string | null
  excerpt: string
  highlightedText: string
}

/** A video a playlist question needed that is still being transcribed. */
export interface PendingVideo {
  videoId: string
  title: string
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
  pendingVideos?: PendingVideo[]
  error?: boolean
  createdAt: string
}

interface UploadOption {
  type: UploadType
  label: string
  description: string
  /** How the source is added: a file picker or a pasted link. */
  input: "file" | "url"
  accept?: string
  /** Short hint shown under the label in the sidebar. */
  action: string
  /** Unwired source types stay visible but disabled. */
  enabled: boolean
}

export const UPLOAD_OPTIONS: UploadOption[] = [
  {
    type: "pdf",
    label: "PDF",
    description: "Upload a PDF document",
    input: "file",
    accept: ".pdf",
    action: "Upload file",
    enabled: true,
  },
  {
    type: "doc",
    label: "Word document",
    description: "Upload a .docx file",
    input: "file",
    accept: ".docx",
    action: "Upload file",
    enabled: true,
  },
  {
    type: "text",
    label: "Text or Markdown",
    description: "Upload a .txt or .md file",
    input: "file",
    accept: ".txt,.md,.markdown",
    action: "Upload file",
    enabled: true,
  },
  {
    type: "vtt",
    label: "VTT transcript",
    description: "Upload a WebVTT subtitle or transcript file",
    input: "file",
    accept: ".vtt",
    action: "Upload file",
    enabled: true,
  },
  {
    type: "youtube",
    label: "YouTube",
    description:
      "Paste a video or playlist link. Captions are indexed so answers can cite exact timestamps.",
    input: "url",
    action: "Paste link",
    enabled: true,
  },
  {
    type: "webpage",
    label: "Webpage",
    description: "Coming soon",
    input: "url",
    action: "Coming soon",
    enabled: false,
  },
  {
    type: "image",
    label: "Image",
    description: "Coming soon",
    input: "file",
    action: "Coming soon",
    enabled: false,
  },
]

const KIND_LABELS: Record<UploadType, string> = {
  pdf: "PDF",
  doc: "Document",
  text: "Text",
  vtt: "Transcript",
  youtube: "YouTube",
  playlist: "Playlist",
  webpage: "Webpage",
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
