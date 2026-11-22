import { createHash } from "node:crypto";

/** Stable Qdrant point id. Re-indexing the same chunk replaces it in place. */
export function stablePointId(key: string): string {
  const hex = createHash("sha256").update(key).digest("hex").slice(0, 32);
  const variant = ((Number.parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80)
    .toString(16)
    .padStart(2, "0");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `${variant}${hex.slice(18, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}
