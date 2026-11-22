import { getOpenAiClient } from "@/src/lib/openai";
import { ragConfig } from "@/src/rag/config";

const SYSTEM_PROMPT =
  "You write one-line summaries of video transcripts for a search index. " +
  "Given a video's title and section outline, reply with a single sentence, " +
  "at most 30 words, naming the concrete topics the video actually covers. " +
  "Favour specific nouns over vague phrases like 'discusses various topics', " +
  "because this line is what a router reads to decide whether the video is " +
  "worth opening. Reply with the sentence only.";

/**
 * Condense a video into the one line the playlist-level index stores.
 *
 * Built from the outline rather than the transcript: the outline is a few
 * hundred tokens where a transcript is tens of thousands, and routing only
 * needs to know what the video is about, not what it says.
 */
export async function summarizeVideo(
  title: string,
  outline: string,
): Promise<string | null> {
  const text = outline.trim();
  if (!text) return null;

  try {
    const completion = await getOpenAiClient().chat.completions.create({
      model: ragConfig.openai.chatModel,
      temperature: 0.2,
      max_tokens: 90,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Video title: ${title}\n\nOutline:\n${text.slice(0, 4000)}`,
        },
      ],
    });

    return completion.choices[0]?.message?.content?.trim() || null;
  } catch (error) {
    // A missing summary only makes routing slightly blunter, so this must never
    // fail the ingest that produced a perfectly good transcript.
    console.warn(`[rag] Could not summarize "${title}":`, error);
    return null;
  }
}
