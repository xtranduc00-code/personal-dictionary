/**
 * Client-side PDF text extraction for Realtime tutor (pdf.js).
 * Worker: `public/pdf.worker.min.mjs` (copy from pdfjs-dist when upgrading the package).
 */

export const PDF_TEXT_MAX_CHARS = 48_000;

export type ExtractPdfTextResult = {
  text: string;
  truncated: boolean;
  pagesIncluded: number;
  totalPages: number;
};

let workerSrcSet = false;

function textFromPageContent(items: Array<{ str?: string; hasEOL?: boolean }>): string {
  let s = "";
  for (const item of items) {
    if (typeof item.str === "string") s += item.str;
    if (item.hasEOL) s += "\n";
  }
  return s.trim();
}

/**
 * Reads selectable text from a PDF in the browser. Fails for some encrypted
 * files; scanned pages may yield empty or partial text.
 */
export async function extractTextFromPdfFile(
  file: File,
): Promise<ExtractPdfTextResult> {
  const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
  if (!workerSrcSet) {
    GlobalWorkerOptions.workerSrc =
      typeof window !== "undefined"
        ? `${window.location.origin}/pdf.worker.min.mjs`
        : "/pdf.worker.min.mjs";
    workerSrcSet = true;
  }

  const data = await file.arrayBuffer();
  const loadingTask = getDocument({ data });
  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;

  let combined = "";
  let pagesIncluded = 0;
  let truncated = false;

  for (let p = 1; p <= totalPages; p++) {
    if (combined.length >= PDF_TEXT_MAX_CHARS) {
      truncated = true;
      break;
    }
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const pageText = textFromPageContent(
      content.items as Array<{ str?: string; hasEOL?: boolean }>,
    );
    const block =
      (pagesIncluded > 0 ? "\n\n" : "") + `--- Page ${p} ---\n${pageText}`;
    const room = PDF_TEXT_MAX_CHARS - combined.length;
    if (block.length <= room) {
      combined += block;
      pagesIncluded = p;
    } else {
      combined += block.slice(0, room);
      truncated = true;
      pagesIncluded = p;
      break;
    }
  }

  return {
    text: combined.trim(),
    truncated,
    pagesIncluded,
    totalPages,
  };
}
