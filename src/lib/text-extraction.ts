/**
 * Server-side text extraction from PDF, DOCX, and TXT buffers.
 * Used by the knowledge base processing pipeline.
 */

export type SupportedFileType = "pdf" | "docx" | "txt" | "image";

/**
 * Extract plain text from a file buffer.
 * Caller is responsible for passing the correct fileType.
 */
export async function extractText(
  buffer: Buffer,
  fileType: SupportedFileType
): Promise<string> {
  switch (fileType) {
    case "txt": {
      return buffer.toString("utf-8");
    }

    case "pdf": {
      // Dynamic import — pdf-parse has a side-effect on require that some
      // bundlers trip over; dynamic import avoids the issue at module load time.
      const pdfModule = await import("pdf-parse");
      // Handles both CJS default export and ESM named export shapes
      const pdfParse =
        typeof pdfModule === "function"
          ? pdfModule
          : ("default" in pdfModule
              ? (pdfModule as unknown as { default: typeof pdfModule })
                  .default
              : pdfModule) as unknown as (buf: Buffer) => Promise<{ text: string }>;
      const data = await pdfParse(buffer);
      return data.text;
    }

    case "docx": {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }

    case "image": {
      // Images are not text-extractable — return empty string
      return "";
    }

    default: {
      const exhaustive: never = fileType;
      throw new Error(`Unsupported file type: ${exhaustive}`);
    }
  }
}

/**
 * Infer file type from a MIME type or filename extension.
 * Returns null if the type is not supported.
 */
export function inferFileType(
  mimeOrFilename: string
): SupportedFileType | null {
  const s = mimeOrFilename.toLowerCase();
  if (s.includes("pdf") || s.endsWith(".pdf")) return "pdf";
  if (
    s.includes("wordprocessingml") ||
    s.includes("docx") ||
    s.endsWith(".docx")
  )
    return "docx";
  if (s.includes("text/plain") || s.endsWith(".txt") || s.endsWith(".md"))
    return "txt";
  if (
    s.includes("image/") ||
    s.endsWith(".jpg") ||
    s.endsWith(".jpeg") ||
    s.endsWith(".png") ||
    s.endsWith(".webp")
  )
    return "image";
  return null;
}
