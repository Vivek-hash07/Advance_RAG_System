/** First `[HH:MM:SS]` marker in transcript-derived text, if any. */
export function extractTimestamp(text: string): string | null {
  return text.match(/\[(\d{2}:\d{2}:\d{2})\]/)?.[1] ?? null;
}
