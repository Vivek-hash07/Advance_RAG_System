import type { DocumentRecord } from "@/src/rag/documents/repository";
import { sanitizeStoredError } from "@/src/lib/public-error";
import type { IngestStatus, SourceKind } from "@/src/rag/types";

export interface PublicFailedVideo {
  videoId: string;
  title: string;
  errorMessage: string | null;
}

/** A source as exposed to the browser. Vector ids stay server-side. */
export interface PublicSource {
  id: string;
  name: string;
  sourceKind: SourceKind;
  status: IngestStatus;
  errorMessage: string | null;
  pageCount: number | null;
  sourceUrl: string | null;
  /** Human-readable size of the source: pages for files, videos for playlists. */
  detail: string | null;
  /** Playlist ingest honesty — null for non-playlist sources. */
  truncated: boolean | null;
  unavailableCount: number | null;
  failedCount: number | null;
  failedVideos: PublicFailedVideo[];
  createdAt: string;
}

function describeSize(record: DocumentRecord): string | null {
  if (record.sourceKind === "playlist") {
    if (record.pageCount === null) return null;
    const base = `${record.pageCount} ${record.pageCount === 1 ? "video" : "videos"}`;
    const honesty = record.playlistHonesty;
    if (!honesty) return base;

    const notes: string[] = [];
    if (honesty.truncated) notes.push("truncated");
    if (honesty.unavailableCount > 0) {
      notes.push(
        `${honesty.unavailableCount} unavailable`,
      );
    }
    if (honesty.failedCount > 0) {
      notes.push(
        `${honesty.failedCount} failed`,
      );
    }
    return notes.length ? `${base} · ${notes.join(", ")}` : base;
  }

  if (record.sourceKind === "youtube") {
    return "Transcript indexed";
  }

  if (record.sourceKind === "webpage") {
    return record.sourceUrl ? "Webpage indexed" : "Indexed";
  }

  if (record.sourceKind === "image") {
    return "Image transcribed";
  }

  if (record.pageCount === null) return null;
  return `${record.pageCount} ${record.pageCount === 1 ? "page" : "pages"}`;
}

export function toPublicSource(record: DocumentRecord): PublicSource {
  const honesty = record.playlistHonesty;

  return {
    id: record.id,
    name: record.name,
    sourceKind: record.sourceKind,
    status: record.status,
    errorMessage: sanitizeStoredError(
      record.errorMessage,
      "This source could not be indexed. Try adding it again.",
    ),
    pageCount: record.pageCount,
    sourceUrl: record.sourceUrl,
    detail: record.status === "ready" ? describeSize(record) : null,
    truncated: honesty?.truncated ?? null,
    unavailableCount: honesty?.unavailableCount ?? null,
    failedCount: honesty?.failedCount ?? null,
    failedVideos: (honesty?.failedVideos ?? []).map((video) => ({
      ...video,
      errorMessage: sanitizeStoredError(
        video.errorMessage,
        "This video could not be indexed.",
      ),
    })),
    createdAt: record.createdAt,
  };
}
