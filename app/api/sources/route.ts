import { NextResponse } from "next/server";

import { toErrorResponse } from "@/src/lib/api-error";
import { requireUserId } from "@/src/lib/session";
import { toPublicSource } from "@/src/rag/documents/serialize";
import { IngestError, ingestUpload, listUserDocuments } from "@/src/rag/documents/service";

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

/** Upload a PDF, DOCX, TXT/MD or VTT file and start PageIndex processing. */
export async function POST(request: Request) {
  try {
    const userId = await requireUserId();

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
