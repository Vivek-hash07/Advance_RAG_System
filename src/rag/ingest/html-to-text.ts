const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "-",
  ndash: "-",
  hellip: "...",
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
};

function decodeEntities(input: string): string {
  return input
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&([a-z]+);/gi, (match, name: string) => {
      return ENTITIES[name.toLowerCase()] ?? match;
    });
}

/**
 * Flatten HTML into text that keeps document structure.
 *
 * Headings become Markdown `#` prefixes and list items become `-` bullets, both
 * of which the PDF renderer turns back into visual structure. That structure is
 * what PageIndex reads when building a document's tree, so preserving it here is
 * what makes retrieval on converted files as good as on native PDFs.
 */
export function htmlToStructuredText(html: string): string {
  const blocks: string[] = [];

  const withBreaks = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|li|blockquote)>/gi, "</$1>\n");

  const blockPattern =
    /<(h[1-6]|p|li|blockquote|td|th)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;

  let match: RegExpExecArray | null;
  while ((match = blockPattern.exec(withBreaks)) !== null) {
    const tag = match[1].toLowerCase();
    const inner = decodeEntities(match[2].replace(/<[^>]+>/g, " "))
      .replace(/[ \t]+/g, " ")
      .replace(/\s*\n\s*/g, "\n")
      .trim();

    if (!inner) continue;

    const headingLevel = tag.match(/^h([1-6])$/)?.[1];

    if (headingLevel) {
      blocks.push(`${"#".repeat(Number(headingLevel))} ${inner}`);
    } else if (tag === "li") {
      blocks.push(`- ${inner}`);
    } else {
      blocks.push(inner);
    }
  }

  if (blocks.length === 0) {
    const plain = decodeEntities(withBreaks.replace(/<[^>]+>/g, " "))
      .replace(/[ \t]+/g, " ")
      .trim();
    return plain;
  }

  // Keep consecutive bullets tight, separate everything else by a blank line.
  return blocks
    .reduce<string[]>((acc, block) => {
      const previous = acc[acc.length - 1];
      if (previous?.startsWith("- ") && block.startsWith("- ")) {
        acc[acc.length - 1] = `${previous}\n${block}`;
        return acc;
      }
      acc.push(block);
      return acc;
    }, [])
    .join("\n\n");
}
