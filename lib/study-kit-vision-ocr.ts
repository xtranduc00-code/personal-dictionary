import "./study-kit-pdfjs-polyfill";
import type OpenAI from "openai";
import { PDFParse } from "pdf-parse";

/**
 * Rasterizing PDF pages for Vision OCR needs @napi-rs/canvas + pdfjs render pipeline — unreliable on Netlify/AWS.
 * Text-layer PDFs still work via getText(). Image uploads still use Vision OCR (no pdfjs render).
 */
export function pdfPageRasterizationForOcrEnabled(): boolean {
    if (process.env.STUDY_KIT_DISABLE_PDF_RASTER === "1" || process.env.STUDY_KIT_DISABLE_PDF_RASTER === "true")
        return false;
    if (process.env.STUDY_KIT_ENABLE_PDF_RASTER === "1" || process.env.STUDY_KIT_ENABLE_PDF_RASTER === "true")
        return true;
    if (process.env.NETLIFY === "true")
        return false;
    if ((process.env.DEPLOY_ID?.trim().length ?? 0) > 0)
        return false;
    if (process.env.AWS_LAMBDA_FUNCTION_NAME)
        return false;
    if (process.env.VERCEL === "1")
        return false;
    return true;
}

function visionModel(): string {
    return process.env.STUDY_KIT_VISION_MODEL?.trim() || "gpt-4o-mini";
}

function ocrMaxPages(): number {
    const n = parseInt(process.env.STUDY_KIT_OCR_MAX_PAGES || "24", 10);
    if (Number.isNaN(n) || n < 1)
        return 24;
    return Math.min(80, n);
}

function ocrBatchSize(): number {
    const n = parseInt(process.env.STUDY_KIT_OCR_BATCH_SIZE || "3", 10);
    if (Number.isNaN(n) || n < 1)
        return 3;
    return Math.min(6, n);
}

function ocrDesiredWidth(): number {
    const n = parseInt(process.env.STUDY_KIT_OCR_DESIRED_WIDTH || "1100", 10);
    if (Number.isNaN(n) || n < 400)
        return 1100;
    return Math.min(2048, n);
}

async function ocrImageBatch(
    openai: OpenAI,
    model: string,
    items: { pageNumber: number; base64Png: string }[],
): Promise<string> {
    const intro = items
        .map((it, i) => `Image ${i + 1} = PDF page ${it.pageNumber}.`)
        .join(" ");
    const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [
        {
            type: "text",
            text: `${intro} Transcribe all readable text in reading order (columns, headers, lists). Before each image's text, output a line exactly: --- Page N --- where N is that image's page number. If a page has no text, output --- Page N --- then (no text). Plain text only; Markdown lists allowed.`,
        },
    ];
    for (const it of items) {
        userContent.push({
            type: "image_url",
            image_url: {
                url: `data:image/png;base64,${it.base64Png}`,
                detail: "high",
            },
        });
    }
    const res = await openai.chat.completions.create({
        model,
        temperature: 0,
        max_completion_tokens: 16_384,
        messages: [
            {
                role: "system",
                content:
                    "You are an OCR engine for study materials. Output only transcribed visible text; do not summarize, explain, or refuse.",
            },
            { role: "user", content: userContent },
        ],
    });
    const out = res.choices[0]?.message?.content?.trim();
    if (!out)
        throw new Error("OCR_EMPTY_BATCH");
    return out;
}

async function ocrSinglePage(
    openai: OpenAI,
    model: string,
    pageNumber: number,
    base64Png: string,
): Promise<string> {
    return ocrImageBatch(openai, model, [{ pageNumber, base64Png }]);
}

/**
 * Rasterize PDF pages and transcribe with OpenAI Vision (scanned / image-only PDFs).
 */
export async function ocrPdfBufferWithOpenAI(
    openai: OpenAI,
    buffer: Buffer,
    fileName: string,
): Promise<string> {
    if (!pdfPageRasterizationForOcrEnabled())
        throw new Error("PDF_RASTER_DISABLED");
    const model = visionModel();
    const maxPages = ocrMaxPages();
    const batchSize = ocrBatchSize();
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    let shot;
    try {
        shot = await parser.getScreenshot({
            first: maxPages,
            desiredWidth: ocrDesiredWidth(),
            imageBuffer: true,
            imageDataUrl: false,
        });
    }
    finally {
        await parser.destroy();
    }
    const pages = shot.pages.filter((p) => p.data && p.data.length > 0);
    if (pages.length === 0)
        throw new Error("OCR_NO_PAGES");
    const chunks: string[] = [];
    let truncatedNote = "";
    if (shot.total > maxPages) {
        truncatedNote = `\n\n[OCR note: processed first ${maxPages} of ${shot.total} pages from ${fileName}.]\n`;
    }
    for (let i = 0; i < pages.length; i += batchSize) {
        const slice = pages.slice(i, i + batchSize);
        const items = slice.map((p) => ({
            pageNumber: p.pageNumber,
            base64Png: Buffer.from(p.data).toString("base64"),
        }));
        try {
            chunks.push(await ocrImageBatch(openai, model, items));
        }
        catch (e) {
            console.warn("study-kit ocr batch failed, retrying per page", e);
            for (const it of items) {
                chunks.push(await ocrSinglePage(openai, model, it.pageNumber, it.base64Png));
            }
        }
    }
    const joined = `${chunks.join("\n\n")}${truncatedNote}`.trim();
    if (!joined)
        throw new Error("OCR_EMPTY");
    return joined;
}

/**
 * OCR a standalone image file (png, jpeg, webp, gif).
 */
export async function ocrRasterImageWithOpenAI(
    openai: OpenAI,
    buffer: Buffer,
    mime: string,
    fileName: string,
): Promise<string> {
    const model = visionModel();
    const lower = mime.toLowerCase();
    let media = "image/png";
    if (lower.includes("jpeg") || lower.includes("jpg"))
        media = "image/jpeg";
    else if (lower.includes("webp"))
        media = "image/webp";
    else if (lower.includes("gif"))
        media = "image/gif";
    else if (lower.includes("png"))
        media = "image/png";
    const b64 = buffer.toString("base64");
    const res = await openai.chat.completions.create({
        model,
        temperature: 0,
        max_completion_tokens: 16_384,
        messages: [
            {
                role: "system",
                content:
                    "You are an OCR engine. Transcribe all visible text from the image in reading order. Plain text; Markdown lists ok. If no text, reply (no text).",
            },
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: `File name: ${fileName}. Transcribe everything readable.`,
                    },
                    {
                        type: "image_url",
                        image_url: { url: `data:${media};base64,${b64}`, detail: "high" },
                    },
                ],
            },
        ],
    });
    const out = res.choices[0]?.message?.content?.trim();
    if (!out)
        throw new Error("OCR_EMPTY");
    return out;
}
