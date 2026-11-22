/**
 * Confirms Qdrant credentials and creates the chunk and memory collections.
 *
 *   npm run verify:qdrant
 */
import { ragConfig } from "../src/rag/config.ts";
import { ensureCollection, getQdrantClient } from "../src/rag/vector/qdrant.ts";

async function main() {
  if (!ragConfig.qdrant.url || !ragConfig.qdrant.apiKey) {
    throw new Error("Set QUDRANT_API_KEY and CLUSTER_ENDPOINT.");
  }

  await ensureCollection(ragConfig.qdrant.collection, [
    "documentId",
    "videoId",
    "userId",
  ]);
  await ensureCollection(ragConfig.qdrant.memoryCollection, ["userId", "memoryId"]);

  const result = await getQdrantClient().getCollections();
  const names = result.collections.map((collection) => collection.name).sort();
  console.log(`Qdrant ok. Collections: ${names.join(", ") || "(none)"}`);
}

main().catch((error) => {
  console.error("FAIL", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
