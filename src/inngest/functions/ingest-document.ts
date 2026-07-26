import { NonRetriableError } from "inngest";

import { inngest } from "@/src/inngest/client";
import { documentSubmitted } from "@/src/inngest/events";
import { MAX_POLL_ATTEMPTS, pollDelay, POLL_BUDGET_MINUTES } from "@/src/inngest/polling";
import * as repository from "@/src/rag/documents/repository";
import { pollDocumentTree } from "@/src/rag/documents/service";

/**
 * Watch an uploaded PDF, DOCX, TXT/MD or VTT file through PageIndex.
 *
 * The upload route has already converted the file and submitted it; what is
 * left is the slow part — waiting for the hierarchical tree, then caching it so
 * retrieval never refetches it. Running that here rather than in the request
 * means every ingest has a trace with per-poll timings instead of vanishing
 * into browser polling.
 */
export const ingestDocument = inngest.createFunction(
  {
    id: "ingest-document",
    name: "Index uploaded document",
    triggers: { event: documentSubmitted },
    // PageIndex rate limits per account, so cap how many trees we chase at once.
    concurrency: { limit: 5 },
    retries: 2,
  },
  async ({ event, step, logger }) => {
    const { documentId, name, sourceKind } = event.data;

    logger.info("Indexing uploaded document", { documentId, name, sourceKind });

    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
      const result = await step.run(`poll-tree-${attempt}`, async () => {
        const document = await repository.findDocumentById(documentId);

        if (!document) {
          // Deleted while we were waiting; nothing left to do.
          throw new NonRetriableError(`Document ${documentId} no longer exists.`);
        }

        const updated = await pollDocumentTree(document);

        return {
          status: updated.status,
          pageCount: updated.pageCount,
          errorMessage: updated.errorMessage,
        };
      });

      if (result.status === "ready") {
        logger.info("Document indexed", { documentId, pageCount: result.pageCount });
        return { documentId, status: "ready", pageCount: result.pageCount };
      }

      if (result.status === "failed") {
        logger.error("Document indexing failed", {
          documentId,
          reason: result.errorMessage,
        });
        return { documentId, status: "failed", reason: result.errorMessage };
      }

      await step.sleep(`wait-${attempt}`, pollDelay(attempt));
    }

    await step.run("mark-timed-out", () =>
      repository.updateDocumentStatus(documentId, {
        status: "failed",
        errorMessage: `PageIndex did not finish processing within ${POLL_BUDGET_MINUTES} minutes.`,
      }),
    );

    return { documentId, status: "failed", reason: "timeout" };
  },
);
