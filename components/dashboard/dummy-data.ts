export type SourceType =
  | "pdf"
  | "doc"
  | "webpage"
  | "vtt"
  | "youtube"
  | "image"

export type UploadType = SourceType

export interface KnowledgeSource {
  id: string
  name: string
  type: SourceType
  addedAt: string
  status: "ready" | "processing" | "failed"
}

export interface SourceCitation {
  id: string
  sourceId: string
  sourceName: string
  sourceType: SourceType
  page?: string
  timestamp?: string
  excerpt: string
  highlightedText: string
  url?: string
}

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  citations?: SourceCitation[]
  createdAt: string
}

export const INITIAL_SOURCE: KnowledgeSource = {
  id: "src-1",
  name: "Product Guide.pdf",
  type: "pdf",
  addedAt: "2 hours ago",
  status: "ready",
}

export const DUMMY_CITATIONS: Record<string, SourceCitation> = {
  "cite-1": {
    id: "cite-1",
    sourceId: "src-1",
    sourceName: "Product Guide.pdf",
    sourceType: "pdf",
    page: "Page 12",
    excerpt:
      "Polyglot indexes your documents into semantic chunks so the assistant can retrieve the most relevant passages when answering questions. Each chunk preserves its original context — including page numbers for PDFs, timestamps for transcripts, and section headings for web pages.",
    highlightedText:
      "Polyglot indexes your documents into semantic chunks so the assistant can retrieve the most relevant passages when answering questions.",
    url: "#",
  },
  "cite-2": {
    id: "cite-2",
    sourceId: "src-2",
    sourceName: "API Documentation.docx",
    sourceType: "doc",
    page: "Section 3.2",
    excerpt:
      "Authentication uses session-based tokens issued after sign-in. All API routes under /api/* require a valid session cookie. Rate limits apply at 100 requests per minute per user for ingestion endpoints.",
    highlightedText:
      "Authentication uses session-based tokens issued after sign-in.",
    url: "#",
  },
  "cite-3": {
    id: "cite-3",
    sourceId: "src-3",
    sourceName: "polyglot.dev/blog/rag-overview",
    sourceType: "webpage",
    excerpt:
      "A RAG pipeline typically consists of three stages: ingestion (parsing and chunking source material), embedding (converting chunks to vector representations), and retrieval (finding the top-k most similar chunks at query time). The retrieved context is then passed to the language model.",
    highlightedText:
      "A RAG pipeline typically consists of three stages: ingestion, embedding, and retrieval.",
    url: "https://polyglot.dev/blog/rag-overview",
  },
  "cite-4": {
    id: "cite-4",
    sourceId: "src-4",
    sourceName: "Team Standup — Jul 24.vtt",
    sourceType: "vtt",
    timestamp: "00:14:32",
    excerpt:
      "Speaker 2: We agreed to ship the dashboard UI first with dummy data, then wire up the ingestion pipeline next sprint. The sidebar should support PDF, docs, webpages, VTT files, and YouTube links.",
    highlightedText:
      "We agreed to ship the dashboard UI first with dummy data, then wire up the ingestion pipeline next sprint.",
    url: "#",
  },
  "cite-5": {
    id: "cite-5",
    sourceId: "src-5",
    sourceName: "whiteboard-notes.png",
    sourceType: "image",
    page: "Detected text",
    excerpt:
      "Q3 roadmap: finalize ingestion pipeline, add OCR for image uploads, connect vector store, and ship grounded answers with source citations. Priority: support one active source per workspace.",
    highlightedText:
      "add OCR for image uploads, connect vector store, and ship grounded answers with source citations",
    url: "#",
  },
}

export const DUMMY_MESSAGES: ChatMessage[] = [
  {
    id: "msg-1",
    role: "user",
    content: "How does Polyglot handle document ingestion?",
    createdAt: "10:24 AM",
  },
  {
    id: "msg-2",
    role: "assistant",
    content:
      "Polyglot breaks your uploaded documents into semantic chunks and indexes them for retrieval. When you ask a question, it finds the most relevant passages from your knowledge base and uses them to generate a grounded answer.",
    citations: [DUMMY_CITATIONS["cite-1"]],
    createdAt: "10:24 AM",
  },
  {
    id: "msg-3",
    role: "user",
    content: "What authentication method does the API use?",
    createdAt: "10:26 AM",
  },
  {
    id: "msg-4",
    role: "assistant",
    content:
      "The API uses session-based authentication. After sign-in, a session cookie is issued and required for all routes under /api/*. Ingestion endpoints are rate-limited to 100 requests per minute per user.",
    citations: [DUMMY_CITATIONS["cite-2"]],
    createdAt: "10:26 AM",
  },
  {
    id: "msg-5",
    role: "user",
    content: "What text was detected in the uploaded image?",
    createdAt: "10:28 AM",
  },
  {
    id: "msg-6",
    role: "assistant",
    content:
      "The image contains handwritten-style notes about the Q3 roadmap, including OCR support for image uploads, connecting the vector store, and shipping grounded answers with citations.",
    citations: [DUMMY_CITATIONS["cite-5"]],
    createdAt: "10:28 AM",
  },
]

export const UPLOAD_OPTIONS: {
  type: UploadType
  label: string
  description: string
  mode: "file" | "link"
  accept?: string
  placeholder?: string
}[] = [
  {
    type: "pdf",
    label: "PDF",
    description: "Upload a PDF document",
    mode: "file",
    accept: ".pdf",
  },
  {
    type: "doc",
    label: "Document",
    description: "Upload a Word or text document",
    mode: "file",
    accept: ".doc,.docx,.txt,.md",
  },
  {
    type: "image",
    label: "Image",
    description: "Upload an image to extract text via OCR",
    mode: "file",
    accept: ".png,.jpg,.jpeg,.webp,.gif",
  },
  {
    type: "webpage",
    label: "Webpage",
    description: "Add a webpage URL to index",
    mode: "link",
    placeholder: "https://example.com/article",
  },
  {
    type: "vtt",
    label: "VTT Transcript",
    description: "Upload a WebVTT subtitle file",
    mode: "file",
    accept: ".vtt",
  },
  {
    type: "youtube",
    label: "YouTube Video",
    description: "Add a YouTube video link",
    mode: "link",
    placeholder: "https://youtube.com/watch?v=...",
  },
]

export function getSourceTypeLabel(type: SourceType): string {
  switch (type) {
    case "pdf":
      return "PDF"
    case "doc":
      return "Document"
    case "image":
      return "Image"
    case "webpage":
      return "Webpage"
    case "vtt":
      return "VTT"
    case "youtube":
      return "YouTube"
  }
}

export function createSourceFromUpload(
  type: UploadType,
  value: string
): KnowledgeSource {
  return {
    id: `src-${Date.now()}`,
    name: value,
    type,
    addedAt: "Just now",
    status: "processing",
  }
}
