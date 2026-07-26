import { parseChapters, type VideoChapter } from "@/src/rag/youtube/chapters";
import type { YoutubeVideoMetadata } from "@/src/rag/youtube/data-api";
import type { FetchedTranscript, TranscriptCue } from "@/src/rag/youtube/transcript";

/** Seconds per section when the video has no author-provided chapters. */
const FALLBACK_SECTION_SECONDS = 300;

/** Roughly a screenful of speech; keeps paragraphs citable but not fragmentary. */
const MAX_PARAGRAPH_CHARS = 700;

/** A silence this long is a change of subject worth starting a paragraph on. */
const PARAGRAPH_BREAK_GAP_SECONDS = 8;

export function formatClock(totalSeconds: number): string {
  const whole = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const seconds = whole % 60;

  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

export function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return "unknown";

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);

  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/**
 * Auto-generated captions arrive as overlapping rolling text, where each cue
 * repeats the tail of the previous one. Dropping the repeated prefix turns the
 * stream back into readable prose.
 */
function dedupeRollingText(previous: string, next: string): string {
  if (!previous) return next;
  if (previous.endsWith(next)) return "";

  const maxOverlap = Math.min(previous.length, next.length);

  for (let length = maxOverlap; length > 8; length -= 1) {
    if (previous.endsWith(next.slice(0, length))) {
      return next.slice(length).trimStart();
    }
  }

  return next;
}

interface Paragraph {
  startSeconds: number;
  text: string;
}

function toParagraphs(cues: TranscriptCue[]): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  let current: Paragraph | null = null;
  let previousEnd = 0;

  for (const cue of cues) {
    const silence = cue.startSeconds - previousEnd;
    previousEnd = cue.startSeconds + cue.durationSeconds;

    if (current && silence >= PARAGRAPH_BREAK_GAP_SECONDS) {
      paragraphs.push(current);
      current = null;
    }

    const addition: string = current
      ? dedupeRollingText(current.text, cue.text)
      : cue.text;
    if (!addition) continue;

    if (!current) {
      current = { startSeconds: cue.startSeconds, text: addition };
      continue;
    }

    current.text = `${current.text} ${addition}`.replace(/\s+/g, " ");

    // Break on sentence boundaries once the paragraph is long enough, so
    // citations quote whole thoughts rather than clipped clauses.
    const longEnough = current.text.length >= MAX_PARAGRAPH_CHARS;
    const endsSentence = /[.!?]["')\]]?$/.test(current.text);

    if (longEnough && (endsSentence || current.text.length >= MAX_PARAGRAPH_CHARS * 1.6)) {
      paragraphs.push(current);
      current = null;
    }
  }

  if (current?.text) {
    paragraphs.push(current);
  }

  return paragraphs;
}

interface Section {
  title: string;
  startSeconds: number;
  paragraphs: Paragraph[];
}

/**
 * Cut the caption stream at section boundaries, then build paragraphs inside
 * each section.
 *
 * Splitting cues rather than paragraphs matters: paragraphs are merged from
 * many cues and routinely run past a chapter boundary, which would file a later
 * chapter's speech under the previous heading and send citations to the wrong
 * part of the video.
 */
function buildSections(
  cues: TranscriptCue[],
  chapters: VideoChapter[],
  durationSeconds: number,
): Section[] {
  const boundaries =
    chapters.length > 0 ? chapters : buildTimeWindows(cues, durationSeconds);

  const buckets: TranscriptCue[][] = boundaries.map(() => []);

  for (const cue of cues) {
    // The last boundary at or before this cue owns it.
    let index = 0;
    while (
      index + 1 < boundaries.length &&
      boundaries[index + 1].startSeconds <= cue.startSeconds
    ) {
      index += 1;
    }

    buckets[index].push(cue);
  }

  return boundaries
    .map((boundary, index) => ({
      title: boundary.title,
      startSeconds: boundary.startSeconds,
      paragraphs: toParagraphs(buckets[index]),
    }))
    .filter((section) => section.paragraphs.length > 0);
}

function buildTimeWindows(
  cues: TranscriptCue[],
  durationSeconds: number,
): VideoChapter[] {
  const lastCueEnd = cues.length
    ? cues[cues.length - 1].startSeconds + cues[cues.length - 1].durationSeconds
    : 0;

  // Trust the captions over the reported duration: they disagree for trimmed
  // premieres and past live streams.
  const end = Math.max(durationSeconds, lastCueEnd, 1);

  const windows: VideoChapter[] = [];

  for (let start = 0; start < end; start += FALLBACK_SECTION_SECONDS) {
    const stop = Math.min(start + FALLBACK_SECTION_SECONDS, end);
    windows.push({
      startSeconds: start,
      title: `${formatClock(start)} to ${formatClock(stop)}`,
    });
  }

  return windows;
}

export interface RenderedTranscript {
  /** Markdown-ish text ready for `textToPdf`. */
  text: string;
  sectionCount: number;
  wordCount: number;
}

/**
 * Turn a caption track into a structured document.
 *
 * The output deliberately looks like a written article: a metadata header, then
 * one heading per chapter (or per five-minute window when the creator provided
 * none), then timestamped paragraphs. PageIndex builds its tree from exactly
 * these visual cues, so the headings here become the sections the retrieval
 * stage reasons over — and the `[HH:MM:SS]` prefixes survive into citations as
 * clickable positions in the video.
 */
export function renderTranscriptDocument(
  video: YoutubeVideoMetadata,
  transcript: FetchedTranscript,
): RenderedTranscript {
  const chapters = parseChapters(video.description);
  const sections = buildSections(
    transcript.cues,
    chapters,
    video.durationSeconds,
  );

  if (sections.length === 0) {
    throw new Error("The caption track produced no readable text.");
  }

  const header = [
    `# ${video.title}`,
    "",
    "## About this video",
    "",
    [
      `Channel: ${video.channelTitle || "unknown"}`,
      `Published: ${video.publishedAt.slice(0, 10)}`,
      `Duration: ${formatDuration(video.durationSeconds)}`,
      `Captions: ${transcript.autoGenerated ? "auto-generated" : "author provided"} (${transcript.languageCode})`,
      `URL: https://www.youtube.com/watch?v=${video.videoId}`,
    ].join("\n"),
  ];

  const description = video.description.trim();
  if (description) {
    header.push("", "### Description", "", description.slice(0, 4000));
  }

  const body = sections.map((section) => {
    const heading = chapters.length
      ? `## [${formatClock(section.startSeconds)}] ${section.title}`
      : `## Transcript ${section.title}`;

    const content = section.paragraphs
      .map(
        (paragraph) => `[${formatClock(paragraph.startSeconds)}] ${paragraph.text}`,
      )
      .join("\n\n");

    return `${heading}\n\n${content}`;
  });

  // Blocks are separated by a blank line because that is what `textToPdf` reads
  // to tell a heading from body text, and those visual cues are in turn what
  // PageIndex reads when building the tree.
  const text = [header.join("\n"), ...body].join("\n\n");

  return {
    text,
    sectionCount: sections.length,
    wordCount: text.split(/\s+/).filter(Boolean).length,
  };
}
