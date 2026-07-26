export interface VideoChapter {
  startSeconds: number;
  title: string;
}

const TIMESTAMP_LINE =
  /^\s*[-–•*]?\s*\[?((?:\d{1,2}:)?\d{1,2}:\d{2})\]?\s*[-–—:|)]?\s*(.+?)\s*$/;

const TRAILING_TIMESTAMP =
  /^\s*[-–•*]?\s*(.+?)\s*[-–—:|(]?\s*\[?((?:\d{1,2}:)?\d{1,2}:\d{2})\]?\s*\)?\s*$/;

function toSeconds(stamp: string): number {
  const parts = stamp.split(":").map(Number);

  if (parts.some(Number.isNaN)) return Number.NaN;

  return parts.length === 3
    ? parts[0] * 3600 + parts[1] * 60 + parts[2]
    : parts[0] * 60 + parts[1];
}

/**
 * Pull chapter markers out of a video description.
 *
 * Creators publish chapters as timestamped lines ("0:00 Intro"), and YouTube
 * only treats them as real chapters when the first one starts at 0:00 and there
 * are at least three of them — the same rule is applied here so a description
 * that merely mentions a couple of times is not mistaken for an outline.
 *
 * These headings are worth chasing: they are the author's own section titles,
 * which gives PageIndex a far better tree than arbitrary time slicing.
 */
export function parseChapters(description: string): VideoChapter[] {
  const chapters: VideoChapter[] = [];

  for (const line of description.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const leading = trimmed.match(TIMESTAMP_LINE);
    const match = leading ?? trimmed.match(TRAILING_TIMESTAMP);
    if (!match) continue;

    const [stamp, rawTitle] = leading
      ? [match[1], match[2]]
      : [match[2], match[1]];

    const startSeconds = toSeconds(stamp);
    if (Number.isNaN(startSeconds)) continue;

    const title = rawTitle.replace(/^[-–—:|\s]+|[-–—:|\s]+$/g, "").trim();
    if (!title || title.length > 120) continue;

    chapters.push({ startSeconds, title });
  }

  if (chapters.length < 3 || chapters[0].startSeconds !== 0) {
    return [];
  }

  const ordered = chapters.sort((a, b) => a.startSeconds - b.startSeconds);

  // Descriptions sometimes repeat a timestamp in a footer; keep the first.
  return ordered.filter(
    (chapter, index) =>
      index === 0 || chapter.startSeconds !== ordered[index - 1].startSeconds,
  );
}
