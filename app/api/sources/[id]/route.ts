import { NextResponse } from "next/server";

import { toErrorResponse } from "@/src/lib/api-error";
import { requireUserId } from "@/src/lib/session";
import { toPublicSource } from "@/src/rag/documents/serialize";
import {
  getUserDocument,
  removeUserDocument,
  syncDocument,
} from "@/src/rag/documents/service";

interface SourceRouteContext {
  params: Promise<{ id: string }>;
}

/** Poll a source's ingest status; caches its tree once PageIndex finishes. */
export async function GET(
  _request: Request,
  context: SourceRouteContext,
) {
  try {
    const userId = await requireUserId();
    const { id } = await context.params;

    const existing = await getUserDocument(userId, id);
    if (!existing) {
      return NextResponse.json({ error: "Source not found." }, { status: 404 });
    }

    const document = await syncDocument(existing);

    return NextResponse.json({ document: toPublicSource(document) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  context: SourceRouteContext,
) {
  try {
    const userId = await requireUserId();
    const { id } = await context.params;

    const removed = await removeUserDocument(userId, id);
    if (!removed) {
      return NextResponse.json({ error: "Source not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
