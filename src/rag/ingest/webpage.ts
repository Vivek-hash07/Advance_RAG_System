import { spawn } from "node:child_process";
import path from "node:path";

import { ragConfig } from "@/src/rag/config";
import { htmlToStructuredText } from "@/src/rag/ingest/html-to-text";
import { assertSafePublicUrl, SsrfError } from "@/src/rag/ingest/ssrf";
import { textToPdf } from "@/src/rag/ingest/text-to-pdf";

export { SsrfError };

export interface ScrapedWebpage {
  url: string;
  finalUrl: string;
  title: string;
  text: string;
  status: number | null;
}

interface ScraplingPayload {
  url?: string;
  finalUrl?: string;
  title?: string;
  html?: string;
  text?: string;
  status?: number;
  error?: string;
}

function resolvePythonBin(): string {
  return (
    process.env.SCRAPLING_PYTHON?.trim() ||
    path.join(process.cwd(), "scripts/scrapling/.venv/bin/python")
  );
}

function resolveScriptPath(): string {
  return path.join(process.cwd(), "scripts/scrapling/scrape_page.py");
}

function runScrapling(url: string): Promise<ScraplingPayload> {
  const python = resolvePythonBin();
  const script = resolveScriptPath();
  const timeoutMs = ragConfig.webpage.fetchTimeoutMs;
  const stealth = ragConfig.webpage.stealth;

  return new Promise((resolve, reject) => {
    const args = [script, "--url", url];
    if (stealth) args.push("--stealth");

    const child = spawn(python, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Webpage fetch timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(
        new Error(
          `Failed to start Scrapling (${python}). Install with: ` +
            `scripts/scrapling/.venv/bin/pip install -r scripts/scrapling/requirements.txt ` +
            `(${error.message})`,
        ),
      );
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const trimmed = stdout.trim();
      if (!trimmed) {
        reject(
          new Error(
            stderr.trim() ||
              `Scrapling exited with code ${code ?? "unknown"} and no output.`,
          ),
        );
        return;
      }

      let payload: ScraplingPayload;
      try {
        payload = JSON.parse(trimmed) as ScraplingPayload;
      } catch {
        reject(new Error(`Scrapling returned invalid JSON: ${trimmed.slice(0, 200)}`));
        return;
      }

      if (payload.error || code !== 0) {
        reject(new Error(payload.error || stderr.trim() || `Scrapling failed (${code}).`));
        return;
      }

      resolve(payload);
    });
  });
}

function titleFromUrl(url: URL): string {
  return url.hostname.replace(/^www\./, "") || url.href;
}

/**
 * Fetch a public webpage via Scrapling, then turn it into structured text + PDF
 * for PageIndex. SSRF checks happen in Node before the Python process starts.
 */
export async function scrapeWebpage(rawUrl: string): Promise<{
  scraped: ScrapedWebpage;
  pdf: Buffer;
  pdfFileName: string;
}> {
  const safeUrl = await assertSafePublicUrl(rawUrl);
  const payload = await runScrapling(safeUrl.href);

  // Prefer HTML→structured text so headings survive into the PDF tree; fall
  // back to Scrapling's plain text dump when the HTML was empty.
  const fromHtml = payload.html ? htmlToStructuredText(payload.html) : "";
  const text = (fromHtml.trim() || payload.text || "").trim();

  if (!text) {
    throw new Error("No readable text was found on that webpage.");
  }

  if (text.length > ragConfig.webpage.maxTextChars) {
    throw new Error(
      `That page is too large to index (over ${Math.floor(ragConfig.webpage.maxTextChars / 1000)}k characters).`,
    );
  }

  const title =
    payload.title?.trim() ||
    titleFromUrl(safeUrl);

  const pdf = await textToPdf(
    `# ${title}\n\nSource: ${payload.finalUrl || safeUrl.href}\n\n${text}`,
    { title },
  );

  const safeName = title.replace(/[^\w\s-]+/g, "").trim().slice(0, 80) || "webpage";

  return {
    scraped: {
      url: safeUrl.href,
      finalUrl: payload.finalUrl || safeUrl.href,
      title,
      text,
      status: typeof payload.status === "number" ? payload.status : null,
    },
    pdf,
    pdfFileName: `${safeName}.pdf`,
  };
}
