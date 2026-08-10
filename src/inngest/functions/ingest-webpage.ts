import { NonRetriableError } from "inngest";

import { inngest } from "@/src/inngest/client";
import { documentSubmitted, webpageRequested } from "@/src/inngest/events";
import * as repository from "@/src/rag/documents/repository";
import { scrapeWebpage } from "@/src/rag/ingest/webpage";
import { submitPdf } from "@/src/rag/pageindex/documents";

/**
 * Scrape a public webpage with Scrapling, convert to PDF, submit to PageIndex,
 * then hand off to the shared document poller.
 */
export const ingestWebpage = inngest.createFunction(
  {
    id: "ingest-webpage",
    name: "Scrape and index webpage",
    triggers: { event: webpageRequested },
    concurrency: { limit: 3 },
    retries: 2,
  },
  async ({ event, step, logger }) => {
    const { documentId, url } = event.data;

    logger.info("Scraping webpage", { documentId, url });

    const prepared = await step.run("scrape-and-submit", async () => {
      const document = await repository.findDocumentById(documentId);
      if (!document) {
        throw new NonRetriableError(`Document ${documentId} no longer exists.`);
      }

      try {
        await repository.updateDocumentStatus(documentId, {
          status: "processing",
          errorMessage: null,
        });

        const { scraped, pdf, pdfFileName } = await scrapeWebpage(url);
        const pageIndexDocId = await submitPdf(pdf, pdfFileName);

        await repository.updateDocumentStatus(documentId, {
          status: "processing",
          name: scraped.title,
          pageIndexDocId,
          sourceUrl: scraped.finalUrl,
          errorMessage: null,
        });

        return {
          pageIndexDocId,
          title: scraped.title,
          finalUrl: scraped.finalUrl,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Webpage scrape failed.";
        await repository.updateDocumentStatus(documentId, {
          status: "failed",
          errorMessage: message,
        });
        throw new NonRetriableError(message);
      }
    });

    await step.sendEvent("document-submitted", [
      documentSubmitted.create({
        documentId,
        name: prepared.title,
        sourceKind: "webpage",
      }),
    ]);

    return {
      documentId,
      pageIndexDocId: prepared.pageIndexDocId,
      title: prepared.title,
    };
  },
);
