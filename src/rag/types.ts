/** Source formats handled by the vectorless ingest pipeline. */
export type SourceKind = "pdf" | "doc" | "text" | "vtt";

export type IngestStatus = "queued" | "processing" | "ready" | "failed";

/** A labelled query variant produced by the query optimizer. */
export type QueryVariantLabel =
  | "original"
  | "rewritten"
  | "stepBack"
  | "hyde"
  | `subQuery${number}`;

export interface QueryVariant {
  label: QueryVariantLabel;
  text: string;
}

export interface OptimizedQuery {
  original: string;
  rewritten: string;
  stepBack: string;
  subQueries: string[];
  hyde: string;
  /** Every non-empty variant, ready to drive retrieval. */
  variants: QueryVariant[];
}

/** A PageIndex tree node flattened out of its hierarchy. */
export interface FlatTreeNode {
  nodeId: string;
  title: string;
  pageIndex: number | null;
  text: string;
  summary?: string;
  /** Breadcrumb of ancestor titles, outermost first. */
  path: string[];
  depth: number;
}

/** A node the selector judged relevant, before cross-document fusion. */
export interface SelectedNode {
  nodeId: string;
  relevance: number;
  reason: string;
}

/** A node that survived fusion, resolved back to its document and content. */
export interface RetrievedNode {
  documentId: string;
  documentName: string;
  sourceKind: SourceKind;
  nodeId: string;
  title: string;
  pageIndex: number | null;
  path: string[];
  text: string;
  reason: string;
  rrfScore: number;
  bestRelevance: number;
}

export interface RetrievalResult {
  queries: OptimizedQuery;
  nodes: RetrievedNode[];
}

export interface AnswerCitation {
  id: string;
  documentId: string;
  documentName: string;
  sourceKind: SourceKind;
  nodeId: string;
  title: string;
  pageIndex: number | null;
  /** Timestamp pulled out of transcript text, when present. */
  timestamp: string | null;
  excerpt: string;
  highlightedText: string;
}

export interface AnswerResult {
  answer: string;
  citations: AnswerCitation[];
  queries: OptimizedQuery;
}
