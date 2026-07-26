import { NextResponse } from "next/server";
import { z } from "zod";

import { toErrorResponse } from "@/src/lib/api-error";
import { requireUserId } from "@/src/lib/session";
import { optimizeQuery } from "@/src/rag/query/optimize";

const optimizeSchema = z.object({
  query: z.string().trim().min(1, "Query must not be empty"),
});

/** Inspect the query understanding stage on its own, without running retrieval. */
export async function POST(request: Request) {
  try {
    await requireUserId();
    const parsed = optimizeSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
        { status: 400 },
      );
    }

    return NextResponse.json(await optimizeQuery(parsed.data.query));
  } catch (error) {
    return toErrorResponse(error);
  }
}
