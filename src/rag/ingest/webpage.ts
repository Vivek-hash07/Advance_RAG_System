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

interface FetchedPage {
  url?: string;
  finalUrl?: string;
  title?: string;
  html?: string;
  text?: string;
  status?: number;
}

const HTML_BYTE_CAP = 2_000_000;
const MAX_REDIRECTS = 5;

function decodeBasicEntities(input: string): string {
  return input
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function stripTags(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return "";
  return stripTags(match[1]);
}

function extractContentHtml(html: string): string {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "");

  for (const tag of ["article", "main"]) {
    const match = cleaned.match(
      new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, "i"),
    );
    if (match && match[0].length > 40) return match[0];
  }

  const body = cleaned.match(/<body\b[^>]*>[\s\S]*?<\/body>/i);
  return body?.[0] ?? cleaned;
}

async function readCappedBody(response: Response): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > HTML_BYTE_CAP) {
    throw new Error("That page is too large to fetch.");
  }

  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();

  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    received += value.byteLength;
    if (received > HTML_BYTE_CAP) {
      await reader.cancel();
      throw new Error("That page is too large to fetch.");
    }
    chunks.push(value);
  }

  const body = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function decodeHtml(body: Uint8Array, contentType: string): string {
  const charset = /charset=([^;]+)/i
    .exec(contentType)?.[1]
    ?.trim()
    .replace(/['"]/g, "");

  try {
    return new TextDecoder(charset || "utf-8", { fatal: false }).decode(body);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(body);
  }
}

/**
 * Fetch a public page over HTTP. Each redirect is SSRF-checked again.
 * A local Python scraper cannot run inside a Vercel function.
 */
async function fetchPublicPage(start: URL): Promise<FetchedPage> {
  const timeoutMs = ragConfig.webpage.fetchTimeoutMs;
  let current = start;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertSafePublicUrl(current.href);

    let response: Response;
    try {
      response = await fetch(current.href, {
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
          "accept-language": "en",
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        },
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name === "TimeoutError" || name === "AbortError") {
        throw new Error(`Webpage fetch timed out after ${timeoutMs}ms.`);
      }
      throw new Error(
        `Webpage fetch failed (${error instanceof Error ? error.message : "network error"}).`,
      );
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new Error(
          `Remote server returned HTTP ${response.status} without a redirect.`,
        );
      }
      if (hop === MAX_REDIRECTS) {
        throw new Error("That page redirected too many times.");
      }
      current = new URL(location, current);
      continue;
    }

    if (response.status >= 400) {
      throw new Error(`Remote server returned HTTP ${response.status}.`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    const body = await readCappedBody(response);
    const html = decodeHtml(body, contentType);
    const contentHtml = extractContentHtml(html);

    return {
      url: start.href,
      finalUrl: current.href,
      title: extractTitle(html),
      html: contentHtml,
      text: stripTags(contentHtml),
      status: response.status,
    };
  }

  throw new Error("That page redirected too many times.");
}

function titleFromUrl(url: URL): string {
  return url.hostname.replace(/^www\./, "") || url.href;
}

/**
 * Fetch a public webpage, then turn it into structured text + PDF.
 * SSRF checks run before the request and again on every redirect.
 */
export async function scrapeWebpage(rawUrl: string): Promise<{
  scraped: ScrapedWebpage;
  pdf: Buffer;
  pdfFileName: string;
}> {
  const safeUrl = await assertSafePublicUrl(rawUrl);
  const payload = await fetchPublicPage(safeUrl);

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

  const title = payload.title?.trim() || titleFromUrl(safeUrl);

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
