export interface VttCue {
  /** Cue start, normalised to `HH:MM:SS`. */
  start: string;
  startSeconds: number;
  speaker: string | null;
  text: string;
}

const TIMING_LINE = /^(\d{2,}:\d{2}:\d{2}[.,]\d{3}|\d{2}:\d{2}[.,]\d{3})\s*-->/;
const VOICE_TAG = /^<v[^>]*?\s+([^>]+)>([\s\S]*?)(?:<\/v>)?$/i;

function toSeconds(stamp: string): number {
  const parts = stamp.replace(",", ".").split(":").map(Number);
  const [hours, minutes, seconds] =
    parts.length === 3 ? parts : [0, parts[0], parts[1]];
  return hours * 3600 + minutes * 60 + seconds;
}

function formatClock(totalSeconds: number): string {
  const whole = Math.floor(totalSeconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const seconds = whole % 60;

  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

function stripTags(input: string): string {
  return input
    .replace(/<\/?[cibuv](?:\.[^>\s]+)?(?:\s[^>]*)?>/gi, "")
    .replace(/<\d{2}:\d{2}:\d{2}[.,]\d{3}>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function extractSpeaker(rawLines: string[]): {
  speaker: string | null;
  text: string;
} {
  let speaker: string | null = null;
  const cleaned: string[] = [];

  for (const line of rawLines) {
    const voiceMatch = line.match(VOICE_TAG);
    if (voiceMatch) {
      speaker ??= voiceMatch[1].trim();
      cleaned.push(stripTags(voiceMatch[2]));
      continue;
    }

    const stripped = stripTags(line);

    // `Speaker 2: text` is the other common convention for attribution.
    const inlineMatch = stripped.match(/^([A-Z][\w .'-]{0,40}):\s*(.*)$/);
    if (!speaker && inlineMatch && cleaned.length === 0) {
      speaker = inlineMatch[1].trim();
      cleaned.push(inlineMatch[2]);
      continue;
    }

    cleaned.push(stripped);
  }

  return {
    speaker,
    text: cleaned.filter(Boolean).join(" ").replace(/\s+/g, " ").trim(),
  };
}

/** Split a WebVTT file into cues, dropping headers, NOTE/STYLE/REGION blocks. */
export function parseVttCues(raw: string): VttCue[] {
  const blocks = raw
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/);

  const cues: VttCue[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").filter((line) => line.trim().length > 0);
    if (lines.length === 0) continue;

    const header = lines[0].trim();
    if (/^(WEBVTT|NOTE|STYLE|REGION)\b/i.test(header)) continue;

    const timingIndex = lines.findIndex((line) => TIMING_LINE.test(line.trim()));
    if (timingIndex === -1) continue;

    const timingMatch = lines[timingIndex].trim().match(TIMING_LINE);
    if (!timingMatch) continue;

    const { speaker, text } = extractSpeaker(lines.slice(timingIndex + 1));
    if (!text) continue;

    const startSeconds = toSeconds(timingMatch[1]);

    cues.push({
      start: formatClock(startSeconds),
      startSeconds,
      speaker,
      text,
    });
  }

  return cues.sort((a, b) => a.startSeconds - b.startSeconds);
}

/**
 * Turn cues into a readable transcript. Consecutive cues from the same speaker
 * are merged into one paragraph so the transcript reads as prose rather than
 * caption fragments, and each paragraph is prefixed with its start timestamp so
 * the timestamp is recoverable from a citation later.
 */
export function parseVtt(buffer: Buffer): string {
  const cues = parseVttCues(buffer.toString("utf8"));
  if (cues.length === 0) return "";

  const paragraphs: string[] = [];
  let current: { start: string; speaker: string | null; parts: string[] } | null =
    null;

  for (const cue of cues) {
    const sameSpeaker = current !== null && current.speaker === cue.speaker;

    if (current && sameSpeaker) {
      // Auto-generated captions repeat rolling text across cues.
      const last = current.parts[current.parts.length - 1];
      if (last !== cue.text) {
        current.parts.push(cue.text);
      }
      continue;
    }

    if (current) {
      paragraphs.push(renderParagraph(current));
    }

    current = { start: cue.start, speaker: cue.speaker, parts: [cue.text] };
  }

  if (current) {
    paragraphs.push(renderParagraph(current));
  }

  return paragraphs.join("\n\n");
}

function renderParagraph(paragraph: {
  start: string;
  speaker: string | null;
  parts: string[];
}): string {
  const attribution = paragraph.speaker ? `${paragraph.speaker}: ` : "";
  return `[${paragraph.start}] ${attribution}${paragraph.parts.join(" ")}`;
}
