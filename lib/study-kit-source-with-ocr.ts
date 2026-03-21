import type OpenAI from "openai";
import {
    extractDocumentText,
    toExtractedDocument,
    type ExtractedDocument,
} from "./study-kit-extract";
import {
    ocrPdfBufferWithOpenAI,
    ocrRasterImageWithOpenAI,
    pdfPageRasterizationForOcrEnabled,
} from "./study-kit-vision-ocr";

function isRasterImageFile(fileName: string, mime: string): boolean {
    const lower = fileName.toLowerCase();
    if (mime.startsWith("image/"))
        return true;
    return /\.(png|jpe?g|webp|gif)$/i.test(lower);
}

/**
 * Extract text from Study Kit uploads/URLs: normal parsers first; PDFs with no text layer use Vision OCR; image files use Vision OCR.
 */
export async function extractStudyKitSource(
    buffer: Buffer,
    fileName: string,
    mime: string,
    openai: OpenAI,
): Promise<ExtractedDocument> {
    if (isRasterImageFile(fileName, mime)) {
        try {
            const text = await ocrRasterImageWithOpenAI(openai, buffer, mime || "image/png", fileName);
            return toExtractedDocument(text, fileName);
        }
        catch (e: unknown) {
            if (e instanceof Error &&
                (e.message === "OCR_EMPTY" || e.message === "OCR_EMPTY_BATCH"))
                throw new Error("EMPTY_TEXT");
            throw e;
        }
    }
    try {
        return await extractDocumentText(buffer, fileName, mime);
    }
    catch (e: unknown) {
        if (e instanceof Error && e.message === "PDF_NO_TEXT") {
            if (!pdfPageRasterizationForOcrEnabled())
                throw new Error("PDF_NO_TEXT");
            try {
                const text = await ocrPdfBufferWithOpenAI(openai, buffer, fileName);
                return toExtractedDocument(text, fileName);
            }
            catch (ocrErr: unknown) {
                if (ocrErr instanceof Error &&
                    (ocrErr.message === "OCR_EMPTY" || ocrErr.message === "OCR_NO_PAGES"))
                    throw new Error("EMPTY_TEXT");
                console.error("study-kit PDF OCR failed", ocrErr);
                throw new Error("OCR_FAILED");
            }
        }
        throw e;
    }
}
