import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

import { getOpenAiClient } from "@/src/lib/openai";
import { ragConfig } from "@/src/rag/config";

export interface AgenticPiece {
  text: string;
  title: string;
}

interface Group {
  start: number;
  end: number;
  title: string;
}

let splitter: RecursiveCharacterTextSplitter | undefined;
/** Skip the free model briefly after a quota error or repeated timeouts. */
let pausedUntil = 0;
let timeouts = 0;
let emptyGroups = 0;

function modelPaused(): boolean {
  return Date.now() < pausedUntil;
}

function pauseModel(ms: number): void {
  pausedUntil = Date.now() + ms;
}

function getSplitter(): RecursiveCharacterTextSplitter {
  if (!splitter) {
    splitter = new RecursiveCharacterTextSplitter({
      chunkSize: ragConfig.vector.chunkSize,
      chunkOverlap: ragConfig.vector.chunkOverlap,
      separators: ["\n\n", "\n", ". ", " ", ""],
    });
  }
  return splitter;
}

function headingTitle(text: string): string {
  const line = text
    .split("\n")
    .map((part) => part.trim())
    .find(Boolean);
  if (!line) return "";
  const heading = line.match(/^#{1,3}\s+(.+)$/);
  return (heading?.[1] ?? "").trim();
}

function piece(text: string, title: string): AgenticPiece {
  return {
    text: text.trim(),
    title: headingTitle(text) || title,
  };
}

/** Character splitter used for short text and whenever the chunk model fails. */
export async function splitFixed(
  text: string,
  title: string,
): Promise<AgenticPiece[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= ragConfig.vector.chunkSize) {
    return [piece(trimmed, title)];
  }

  const parts = await getSplitter().splitText(trimmed);
  return parts
    .map((part) => piece(part, title))
    .filter((part) => part.text.length > 0);
}

function sliceAtWord(line: string, max: number): string[] {
  const parts: string[] = [];
  let rest = line.trim();

  while (rest.length > max) {
    let cut = rest.lastIndexOf(" ", max);
    if (cut < Math.floor(max * 0.5)) cut = max;
    const head = rest.slice(0, cut).trim();
    if (head) parts.push(head);
    rest = rest.slice(cut).trim();
  }

  if (rest) parts.push(rest);
  return parts;
}

/** Non-overlapping passages the model is allowed to group. */
function toUnits(text: string): string[] {
  const max = Math.min(700, ragConfig.vector.chunkSize);
  const blocks = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  const units: string[] = [];

  for (const block of blocks) {
    if (block.length <= max) {
      units.push(block);
      continue;
    }

    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    let current = "";

    const push = () => {
      const body = current.trim();
      if (body) units.push(body);
      current = "";
    };

    for (const line of lines) {
      if (line.length > max) {
        push();
        units.push(...sliceAtWord(line, max));
        continue;
      }
      if (current && current.length + 1 + line.length > max) push();
      current = current ? `${current}\n${line}` : line;
    }

    push();
  }

  return units;
}

function packWindows(units: string[]): string[][] {
  const limit = ragConfig.vector.agenticWindowChars;
  const windows: string[][] = [];
  let current: string[] = [];
  let size = 0;

  for (const unit of units) {
    const next = size + unit.length + 2;
    if (current.length > 0 && (next > limit || current.length >= 12)) {
      windows.push(current);
      current = [];
      size = 0;
    }
    current.push(unit);
    size += unit.length + 2;
  }

  if (current.length > 0) windows.push(current);
  return windows;
}

function balancedEnd(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function declaredGroups(value: unknown, count: number): Group[] {
  const chunks =
    value && typeof value === "object" && "chunks" in value
      ? (value as { chunks?: unknown }).chunks
      : null;
  if (!Array.isArray(chunks)) return [];

  const groups: Group[] = [];
  for (const item of chunks) {
    if (!item || typeof item !== "object") continue;
    const group = item as { start?: unknown; end?: unknown; title?: unknown };
    const start = Number(group.start);
    const end = Number(group.end);
    if (!Number.isInteger(start) || !Number.isInteger(end)) continue;
    if (start < 0 || end >= count || end < start) continue;
    groups.push({
      start,
      end,
      title: typeof group.title === "string" ? group.title.trim().slice(0, 80) : "",
    });
  }

  return groups.sort((left, right) => left.start - right.start || left.end - right.end);
}

function isPartition(groups: Group[], count: number): boolean {
  if (groups.length === 0 || count === 0) return false;
  if (groups[0].start !== 0) return false;
  for (let index = 1; index < groups.length; index += 1) {
    if (groups[index].start !== groups[index - 1].end + 1) return false;
  }
  return groups[groups.length - 1].end === count - 1;
}

function completeObjects(text: string): unknown[] {
  const found: unknown[] = [];
  let index = 0;

  while (index < text.length) {
    if (text[index] !== "{") {
      index += 1;
      continue;
    }
    const end = balancedEnd(text, index);
    if (end === -1) {
      index += 1;
      continue;
    }
    try {
      found.push(JSON.parse(text.slice(index, end + 1)));
    } catch {
      // Prose often contains stray braces. Keep scanning.
    }
    index = end + 1;
  }

  return found;
}

/** Last grouping that covers every passage exactly once, in order. */
function strictGroups(raw: string, count: number): Group[] | null {
  const objects = completeObjects(raw.replace(/<think>[\s\S]*?<\/think>/gi, ""));
  for (let index = objects.length - 1; index >= 0; index -= 1) {
    const groups = declaredGroups(objects[index], count);
    if (isPartition(groups, count)) return groups;
  }
  return null;
}

function deltaText(delta: unknown): string {
  if (!delta || typeof delta !== "object") return "";
  const record = delta as Record<string, unknown>;
  return [record.content, record.reasoning, record.reasoning_content]
    .filter((part): part is string => typeof part === "string")
    .join("");
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && /abort/i.test(`${error.name} ${error.message}`);
}

function errorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object" || !("status" in error)) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function noteModelError(error: unknown): void {
  const status = errorStatus(error);
  const message = errorMessage(error);
  if (status === 429 || status === 402 || /rate limit|quota/i.test(message)) {
    pauseModel(10 * 60 * 1000);
    return;
  }
  if (status === 408 || /timeout|timed out/i.test(message)) {
    timeouts += 1;
    if (timeouts >= 2) pauseModel(10 * 60 * 1000);
  }
}

async function readGrouping(
  units: string[],
  responseFormat: { type: "json_object" } | undefined,
): Promise<Group[] | null> {
  const numbered = units
    .map((unit, index) => `[${index}] (${unit.length} chars)\n${unit}`)
    .join("\n\n");
  const last = units.length - 1;
  const client = getOpenAiClient();
  const stream = await client.chat.completions.create(
    {
      model: ragConfig.openai.chunkModel,
      temperature: 0,
      max_tokens: 1800,
      stream: true,
      messages: [
        {
          role: "system",
          content:
            "Group numbered passages into topical chunks for a search index. " +
            "Do not rewrite the passages. Write this JSON object as soon as you decide, then stop: " +
            '{"chunks":[{"title":"short topic","start":0,"end":1}]}. ' +
            "start and end are inclusive passage numbers. " +
            `Cover every passage from 0 through ${last} exactly once, in order, with no gaps or overlaps. ` +
            "Start a new chunk only when the subject changes. Keep each chunk near 800 to 1200 characters.",
        },
        { role: "user", content: numbered },
      ],
      ...(responseFormat ? { response_format: responseFormat } : {}),
    },
    { timeout: 30_000 },
  );

  let buffer = "";
  try {
    for await (const event of stream) {
      buffer += deltaText(event.choices[0]?.delta);
      const groups = strictGroups(buffer, units.length);
      if (groups) {
        stream.controller.abort();
        return groups;
      }
    }
  } catch (error) {
    const groups = strictGroups(buffer, units.length);
    if (groups) return groups;
    if (!isAbort(error)) throw error;
  }

  return strictGroups(buffer, units.length);
}

async function askModel(units: string[]): Promise<Group[] | null> {
  try {
    return await readGrouping(units, { type: "json_object" });
  } catch (error) {
    const message = errorMessage(error);
    if (!/response_format|json_object|structured/i.test(message)) throw error;
    return readGrouping(units, undefined);
  }
}

async function materialize(
  units: string[],
  groups: Group[],
  fallbackTitle: string,
): Promise<AgenticPiece[]> {
  const pieces: AgenticPiece[] = [];

  for (const group of groups) {
    const text = units.slice(group.start, group.end + 1).join("\n\n").trim();
    if (!text) continue;
    const title = group.title || fallbackTitle;
    if (text.length <= ragConfig.vector.chunkSize) {
      pieces.push(piece(text, title));
      continue;
    }
    pieces.push(...(await splitFixed(text, title)));
  }

  return pieces;
}

async function groupWindow(
  units: string[],
  fallbackTitle: string,
): Promise<AgenticPiece[]> {
  const combined = units.join("\n\n");
  if (
    modelPaused() ||
    units.length <= 1 ||
    combined.length <= ragConfig.vector.chunkSize
  ) {
    return splitFixed(combined, fallbackTitle);
  }

  try {
    const groups = await askModel(units);
    if (!groups) {
      emptyGroups += 1;
      if (emptyGroups >= 2) pauseModel(10 * 60 * 1000);
      console.warn("[agentic-chunk] Model returned no usable groups; using the character splitter.");
      return splitFixed(combined, fallbackTitle);
    }
    timeouts = 0;
    emptyGroups = 0;
    return materialize(units, groups, fallbackTitle);
  } catch (error) {
    noteModelError(error);
    console.warn(
      "[agentic-chunk] Chunk model failed; using the character splitter.",
      errorMessage(error),
    );
    return splitFixed(combined, fallbackTitle);
  }
}

/**
 * Group source text into topical chunks with a small model.
 * Short text, and any window the model cannot group, uses the character splitter.
 */
export async function splitAgentically(
  text: string,
  fallbackTitle: string,
): Promise<AgenticPiece[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (!ragConfig.vector.agentic || trimmed.length <= ragConfig.vector.chunkSize) {
    return splitFixed(trimmed, fallbackTitle);
  }

  const units = toUnits(trimmed);
  if (units.length <= 1) return splitFixed(trimmed, fallbackTitle);

  const pieces: AgenticPiece[] = [];
  for (const window of packWindows(units)) {
    pieces.push(...(await groupWindow(window, fallbackTitle)));
  }
  return pieces;
}
