import { getOpenAiClient } from "@/src/lib/openai";
import { ragConfig } from "@/src/rag/config";
import type { RetrievalSource } from "@/src/rag/documents/repository";

const SYSTEM_PROMPT =
  "You choose which of the user's sources can answer a question. " +
  "You are given the question and a list of sources. Return only ids from that list.\n\n" +
  "Rules:\n" +
  "- A question about a playlist, a series, where to start or stop, or who made it " +
  "belongs to the matching playlist. Do not add a resume, PDF, or unrelated webpage.\n" +
  "- A question that names a file or a site belongs to that source.\n" +
  "- Include every source that is actually about the same subject.\n" +
  "- Leave out sources on a different subject, even if a generic rewrite of the " +
  "question could match them.\n" +
  "- Return an empty list only when none of the sources could contain the answer.";

const RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: {
    name: "source_routing",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        sourceIds: {
          type: "array",
          items: { type: "string" },
          description: "Ids of the sources to search, most relevant first.",
        },
      },
      required: ["sourceIds"],
    },
  },
};

function describe(source: RetrievalSource): string {
  if (source.type === "playlist") {
    return `[${source.documentId}] playlist "${source.name}"`;
  }
  if (source.type === "video") {
    return `[${source.documentId}] youtube video "${source.name}"`;
  }
  return `[${source.documentId}] ${source.sourceKind} "${source.name}"`;
}

/**
 * Keep the sources that can actually answer this question.
 *
 * Searching every ready source lets a resume or an unrelated page outrank the
 * playlist the user asked about. One source needs no choice. If the model
 * cannot decide, the original list is used.
 */
export async function selectRelevantSources(
  question: string,
  sources: RetrievalSource[],
): Promise<RetrievalSource[]> {
  if (sources.length <= 1) return sources;

  try {
    const completion = await getOpenAiClient().chat.completions.create({
      model: ragConfig.openai.chatModel,
      temperature: 0,
      response_format: RESPONSE_FORMAT,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            "Sources:",
            ...sources.map(describe),
            "",
            "Question:",
            question,
          ].join("\n"),
        },
      ],
    });

    const parsed = JSON.parse(
      completion.choices[0]?.message?.content ?? "{}",
    ) as { sourceIds?: unknown };

    if (!Array.isArray(parsed.sourceIds)) return sources;

    const wanted = new Set(
      parsed.sourceIds.filter((id): id is string => typeof id === "string"),
    );
    const chosen = sources.filter((source) => wanted.has(source.documentId));
    return chosen.length > 0 ? chosen : sources;
  } catch (error) {
    console.warn("[rag] Source routing failed; searching every selected source.", error);
    return sources;
  }
}
