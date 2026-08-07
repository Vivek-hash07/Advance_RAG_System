import { NextResponse } from "next/server";

import { UnauthorizedError } from "@/src/lib/session";
import { IngestError } from "@/src/rag/documents/service";
import { NoSourcesError } from "@/src/rag/ask";
import { YoutubeApiError } from "@/src/rag/youtube/data-api";
import { YoutubeUrlError } from "@/src/rag/youtube/url";

/**
 * Map a thrown error onto a JSON response. Configuration problems surface as
 * 503 so the UI can tell "not set up yet" apart from "something broke".
 */
export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  if (error instanceof IngestError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof NoSourcesError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  if (error instanceof YoutubeUrlError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof YoutubeApiError) {
    // Quota exhaustion is temporary, so report it as "try later" rather than
    // as a broken request.
    const status = error.reason === "quotaExceeded" ? 503 : error.status;
    return NextResponse.json({ error: error.message }, { status });
  }

  const message =
    error instanceof Error ? error.message : "Something went wrong.";

  if (/OPENAI_API_KEY|PAGEINDEX_API_KEY|YOUTUBE_API_KEY|MEM0_API_KEY/.test(message)) {
    return NextResponse.json({ error: message }, { status: 503 });
  }

  console.error("[api]", error);

  return NextResponse.json({ error: message }, { status: 500 });
}
