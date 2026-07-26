import { PageIndexClient } from "@pageindex/sdk";

import { requirePageIndexKey } from "@/src/rag/config";

const globalForPageIndex = globalThis as unknown as {
  pageIndex: PageIndexClient | undefined;
};

/**
 * Shared PageIndex client. Cached on `globalThis` so Next.js hot reloads in
 * development don't leak a new MCP transport on every module re-evaluation.
 */
export function getPageIndexClient(): PageIndexClient {
  if (!globalForPageIndex.pageIndex) {
    globalForPageIndex.pageIndex = new PageIndexClient({
      apiKey: requirePageIndexKey(),
    });
  }

  return globalForPageIndex.pageIndex;
}
