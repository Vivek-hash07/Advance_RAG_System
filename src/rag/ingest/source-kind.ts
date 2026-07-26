import type { FileSourceKind } from "@/src/rag/types";

interface KindDescriptor {
  kind: FileSourceKind;
  label: string;
  extensions: string[];
  mimeTypes: string[];
}

const DESCRIPTORS: KindDescriptor[] = [
  {
    kind: "pdf",
    label: "PDF",
    extensions: [".pdf"],
    mimeTypes: ["application/pdf"],
  },
  {
    kind: "doc",
    label: "Word document",
    extensions: [".docx", ".doc"],
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
    ],
  },
  {
    kind: "text",
    label: "Text document",
    extensions: [".txt", ".md", ".markdown"],
    mimeTypes: ["text/plain", "text/markdown"],
  },
  {
    kind: "vtt",
    label: "WebVTT transcript",
    extensions: [".vtt"],
    mimeTypes: ["text/vtt"],
  },
];

export const ACCEPTED_EXTENSIONS = DESCRIPTORS.flatMap((d) => d.extensions);

export function getKindLabel(kind: FileSourceKind): string {
  return DESCRIPTORS.find((d) => d.kind === kind)?.label ?? kind;
}

function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot).toLowerCase();
}

/**
 * Resolve an upload to a source kind. The extension is trusted first because
 * browsers report inconsistent MIME types for `.md` and `.vtt` files.
 */
export function detectSourceKind(
  fileName: string,
  mimeType?: string | null,
): FileSourceKind | null {
  const extension = getExtension(fileName);

  const byExtension = DESCRIPTORS.find((d) => d.extensions.includes(extension));
  if (byExtension) {
    return byExtension.kind;
  }

  if (mimeType) {
    const normalized = mimeType.split(";")[0].trim().toLowerCase();
    const byMime = DESCRIPTORS.find((d) => d.mimeTypes.includes(normalized));
    if (byMime) {
      return byMime.kind;
    }
  }

  return null;
}
