import "server-only";

import { createHash } from "node:crypto";
import { extractText, getDocumentProxy } from "unpdf";

const MAX_PDF_PAGES = 200;
const PDF_TEXT_TIMEOUT_MS = 45_000;

export type DocumentTextPage = {
  pageNumber: number;
  content: string;
  contentSha256: string;
};

export async function extractDocumentTextPages(data: ArrayBuffer): Promise<DocumentTextPage[]> {
  const pdf = await getDocumentProxy(new Uint8Array(data), { maxImageSize: 16_777_216 });
  try {
    if (pdf.numPages > MAX_PDF_PAGES) throw new Error(`PDFs may contain at most ${MAX_PDF_PAGES} pages.`);
    const extraction = extractText(pdf, { mergePages: false });
    const { text } = await Promise.race([
      extraction,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("PDF text extraction timed out.")), PDF_TEXT_TIMEOUT_MS)),
    ]);
    if (!Array.isArray(text)) throw new Error("PDF pages could not be separated for indexing.");

    return text.map((page, index) => {
      const content = page.replace(/\u0000/g, "").trim();
      return {
        pageNumber: index + 1,
        content,
        contentSha256: createHash("sha256").update(content).digest("hex"),
      };
    });
  } finally {
    await pdf.destroy();
  }
}
