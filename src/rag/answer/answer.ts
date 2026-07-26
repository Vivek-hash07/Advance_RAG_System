import { getOpenAiClient } from "@/src/lib/openai";
import { ragConfig } from "@/src/rag/config";
import { extractTimestamp } from "@/src/rag/pageindex/tree";
import { videoUrl } from "@/src/rag/youtube/url";
import type { AnswerCitation, RetrievedNode } from "@/src/rag/types";

const EXCERPT_WINDOW = 900;

const SYSTEM_PROMPT =
  "You answer questions using ONLY the numbered context sections provided. Rules:\n" +
  "- If the sections do not contain the answer, say so plainly. Never use outside knowledge.\n" +
  "- Be concise and direct. Do not restate the question.\n" +
  "- Do not write inline citation markers in the answer text.\n" +
  "- For every section you actually relied on, add one citation.\n" +
  "- A citation's quote MUST be copied verbatim from that section, 1-2 sentences long, " +
  "and must be the sentence that most directly supports your answer.\n" +
  "- Cite only sections you used. Return no citations if you could not answer.";

const RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: {
    name: "grounded_answer",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        answer: {
          type: "string",
          description: "The answer, grounded strictly in the provided sections.",
        },
        citations: {
          type: "array",
          description: "The sections relied on, most important first.",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              section: {
                type: "number",
                description: "The number of the context section used.",
              },
              quote: {
                type: "string",
                description:
                  "A verbatim 1-2 sentence quote from that section supporting the answer.",
              },
            },
            required: ["section", "quote"],
          },
        },
      },
      required: ["answer", "citations"],
    },
  },
};

function buildContext(nodes: RetrievedNode[]): string {
  return nodes
    .map((node, index) => {
      const breadcrumb = [...node.path, node.title].filter(Boolean).join(" > ");
      const page = node.pageIndex === null ? "" : `, page ${node.pageIndex}`;

      return [
        `[Section ${index + 1}] ${node.documentName}${page}`,
        `Heading: ${breadcrumb}`,
        node.text,
      ].join("\n");
    })
    .join("\n\n---\n\n");
}

/**
 * Locate the model's quote inside the section text and return a readable window
 * around it, so the source panel can show surrounding context with the
 * supporting sentence highlighted.
 */
function buildExcerpt(
  text: string,
  quote: string,
): { excerpt: string; highlightedText: string } {
  const at = quote ? text.indexOf(quote) : -1;

  if (at === -1) {
    // The model paraphrased instead of quoting; highlight nothing rather than
    // highlighting text that never appears in the source.
    return { excerpt: text.slice(0, EXCERPT_WINDOW), highlightedText: "" };
  }

  const padding = Math.max(0, Math.floor((EXCERPT_WINDOW - quote.length) / 2));
  let start = Math.max(0, at - padding);
  let end = Math.min(text.length, at + quote.length + padding);

  // Prefer starting after a sentence boundary so the excerpt reads cleanly.
  if (start > 0) {
    const boundary = text.lastIndexOf(". ", at);
    if (boundary > start - 200 && boundary !== -1) {
      start = boundary + 2;
    }
  }
  if (end < text.length) {
    const boundary = text.indexOf(". ", end);
    if (boundary !== -1 && boundary < end + 200) {
      end = boundary + 1;
    }
  }

  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";

  return {
    excerpt: `${prefix}${text.slice(start, end).trim()}${suffix}`,
    highlightedText: quote,
  };
}

function toSeconds(timestamp: string): number {
  const [hours, minutes, seconds] = timestamp.split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Turn a transcript citation into a link that opens the video at the moment the
 * quote was spoken. Timestamps survive from the caption cues, through the
 * rendered document, into the retrieved section text.
 */
function buildSourceUrl(
  node: RetrievedNode,
  timestamp: string | null,
): string | null {
  if (!node.videoId) return null;

  return videoUrl(node.videoId, timestamp ? toSeconds(timestamp) : null);
}

export interface GeneratedAnswer {
  answer: string;
  citations: AnswerCitation[];
}

/** Synthesise an answer from the retrieved sections and map it back to citations. */
export async function generateAnswer(
  question: string,
  nodes: RetrievedNode[],
): Promise<GeneratedAnswer> {
  if (nodes.length === 0) {
    return {
      answer:
        "I couldn't find anything relevant in your sources to answer that. Try rephrasing the question, or add a source that covers this topic.",
      citations: [],
    };
  }

  const openai = getOpenAiClient();

  const completion = await openai.chat.completions.create({
    model: ragConfig.openai.reasoningModel,
    temperature: 0.2,
    response_format: RESPONSE_FORMAT,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Context sections:\n\n${buildContext(nodes)}\n\nQuestion: ${question}`,
      },
    ],
  });

  const parsed = JSON.parse(
    completion.choices[0]?.message?.content ?? "{}",
  ) as { answer?: string; citations?: Array<{ section?: number; quote?: string }> };

  const answer =
    parsed.answer?.trim() ||
    "I couldn't produce an answer from the retrieved sections.";

  const citations: AnswerCitation[] = [];
  const usedSections = new Set<number>();

  for (const raw of parsed.citations ?? []) {
    const index = Number(raw?.section) - 1;
    const node = nodes[index];

    if (!node || usedSections.has(index)) continue;
    usedSections.add(index);

    const { excerpt, highlightedText } = buildExcerpt(
      node.text,
      typeof raw?.quote === "string" ? raw.quote.trim() : "",
    );

    // Prefer a timestamp inside the quoted sentence over the section's first
    // one, so a video link lands on the line that was actually cited.
    const timestamp =
      extractTimestamp(highlightedText) ?? extractTimestamp(node.text);

    citations.push({
      id: `${node.documentId}-${node.nodeId}`,
      documentId: node.documentId,
      documentName: node.documentName,
      sourceKind: node.sourceKind,
      nodeId: node.nodeId,
      title: node.title,
      pageIndex: node.pageIndex,
      timestamp,
      sourceUrl: buildSourceUrl(node, timestamp),
      excerpt,
      highlightedText,
    });
  }

  return { answer, citations };
}
