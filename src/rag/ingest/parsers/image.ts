import { getOpenAiClient } from "@/src/lib/openai";
import { ragConfig } from "@/src/rag/config";

const IMAGE_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot).toLowerCase();
}

function mimeFor(fileName: string, fallback?: string | null): string {
  return IMAGE_MIME[extensionOf(fileName)] ?? fallback ?? "image/png";
}

/**
 * Turn an image into structured markdown via vision (OCR + light analysis).
 *
 * Output is meant for textToPdf → PageIndex: headings, bullet lists, and
 * transcribed text so citations land on real pages.
 */
export async function parseImage(
  buffer: Buffer,
  fileName: string,
  mimeType?: string | null,
): Promise<string> {
  const mime = mimeFor(fileName, mimeType);
  const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;
  const title = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();

  const openai = getOpenAiClient();
  const completion = await openai.chat.completions.create({
    model: ragConfig.openai.visionModel,
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content:
          "You extract usable knowledge from images for a retrieval index. " +
          "Transcribe every readable word (OCR). Describe charts, diagrams, UI, " +
          "and photos only as far as it helps answer questions later. " +
          "Respond in Markdown: start with a short # title, use ## sections, " +
          "bullet lists for key facts, and fenced code blocks for code or tables " +
          "when helpful. Do not invent text that is not visible. If the image is " +
          "blank or unreadable, say so plainly.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `File name: ${fileName}${title ? ` (suggested title: ${title})` : ""}`,
          },
          {
            type: "image_url",
            image_url: { url: dataUrl },
          },
        ],
      },
    ],
  });

  const text = completion.choices[0]?.message?.content?.trim() ?? "";
  if (!text) {
    throw new Error("Vision model returned no text for this image.");
  }

  return text;
}
