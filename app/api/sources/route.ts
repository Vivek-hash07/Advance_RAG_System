import { NextResponse } from "next/server";
import { z } from "zod";

import { toErrorResponse } from "@/src/lib/api-error";
import { requireUserId } from "@/src/lib/session";
import { toPublicSource } from "@/src/rag/documents/serialize";
import {
  AmbiguousYoutubeUrlError,
  IngestError,
  ingestUpload,
  ingestWebpageUrl,
  ingestYoutubeUrl,
  listUserDocuments,
} from "@/src/rag/documents/service";

const linkSchema = z.object({
  url: z.string().trim().min(1, "Paste a link to add."),
  /** Resolves a `watch?v=X&list=Y` link the user has already been asked about. */
  preference: z.enum(["video", "playlist"]).optional(),
  /** Explicit link kind from the upload dialog. */
  kind: z.enum(["youtube", "webpage"]).optional(),
});

function looksLikeYoutube(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return (
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "music.youtube.com" ||
      host === "youtu.be" ||
      host.endsWith(".youtube.com")
    );
  } catch {
    return false;
  }
}

/** List the signed-in user's sources, advancing any still being processed. */
export async function GET() {
  try {
    const userId = await requireUserId();
    const documents = await listUserDocuments(userId);

    return NextResponse.json({ documents: documents.map(toPublicSource) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * Add a source.
 *
 * Multipart bodies are file uploads; JSON bodies carry a YouTube or webpage
 * link. Both return immediately with a row the UI can render, and hand the slow
 * indexing work to an Inngest run.
 */
export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      return await addLink(userId, request);
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new IngestError("No file was uploaded under the 'file' field.");
    }

    const document = await ingestUpload(userId, file);

    return NextResponse.json({ document: toPublicSource(document) }, { status: 202 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

async function addLink(userId: string, request: Request) {
  const parsed = linkSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 },
    );
  }

  const { url, preference, kind } = parsed.data;
  const asWebpage =
    kind === "webpage" || (kind !== "youtube" && !looksLikeYoutube(url));

  if (asWebpage) {
    const document = await ingestWebpageUrl(userId, url);
    return NextResponse.json({ document: toPublicSource(document) }, { status: 202 });
  }

  try {
    const document = await ingestYoutubeUrl(userId, url, preference);

    return NextResponse.json({ document: toPublicSource(document) }, { status: 202 });
  } catch (error) {
    // A link carrying both a video and a playlist is a question, not a failure:
    // hand the caller both options rather than guessing and ingesting 200
    // videos when one was meant.
    if (error instanceof AmbiguousYoutubeUrlError) {
      return NextResponse.json(
        {
          error: error.message,
          choice: {
            video: { id: error.videoId, title: error.videoTitle },
            playlist: {
              id: error.playlistId,
              title: error.playlistTitle,
              itemCount: error.playlistItemCount,
            },
          },
        },
        { status: 409 },
      );
    }

    throw error;
  }
}
