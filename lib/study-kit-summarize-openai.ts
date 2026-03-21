import OpenAI, { APIError } from "openai";
import type { ExtractedDocument } from "@/lib/study-kit-extract";
import {
    buildExamRevisionSystemMessage,
    type StudyPreset,
    type StudyQuizDepth,
    studyKitMaxOutputTokens,
} from "@/lib/study-kit-prompt";
import {
    chatCompletionAssistantText,
    extractStudyKitResponsesText,
    sanitizeStudyKitModelOutput,
} from "@/lib/study-kit-response-text";
import { SK_LOG } from "@/lib/study-kit-summarize-shared";

const REASONING_EFFORTS = ["none", "low", "medium", "high", "xhigh"] as const;
type StudyKitReasoningEffort = (typeof REASONING_EFFORTS)[number];
const VERBOSITIES = ["low", "medium", "high"] as const;
type StudyKitVerbosity = (typeof VERBOSITIES)[number];

function studyKitReasoningEffort(): StudyKitReasoningEffort {
    const raw = process.env.STUDY_KIT_REASONING_EFFORT?.trim().toLowerCase();
    if (raw && (REASONING_EFFORTS as readonly string[]).includes(raw))
        return raw as StudyKitReasoningEffort;
    return "medium";
}

function studyKitVerbosity(): StudyKitVerbosity {
    const raw = process.env.STUDY_KIT_VERBOSITY?.trim().toLowerCase();
    if (raw && (VERBOSITIES as readonly string[]).includes(raw))
        return raw as StudyKitVerbosity;
    return "medium";
}

function useResponsesApiForModel(model: string): boolean {
    return /^gpt-5/i.test(model.trim());
}

const CHAT_MODEL_FALLBACKS = ["gpt-4o", "gpt-4.1", "gpt-4o-mini"] as const;

export function summarizeFailedPayload(err: unknown): { code: string; detail?: string } {
    const dev = process.env.NODE_ENV === "development";
    if (err instanceof APIError) {
        return {
            code: "SUMMARIZE_FAILED",
            detail: dev
                ? `${err.status ?? "?"} ${err.message}`
                : err.status === 401 || err.status === 403
                  ? "OpenAI rejected the API key (check OPENAI_API_KEY)."
                  : err.status === 429
                    ? "OpenAI quota or rate limit — check billing at platform.openai.com or retry shortly."
                    : err.message
                      ? err.message.slice(0, 280)
                      : undefined,
        };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return {
        code: "SUMMARIZE_FAILED",
        detail: dev
            ? msg
            : msg.includes("empty") || msg.includes("assistant")
              ? "The model returned no text. Set STUDY_KIT_OPENAI_MODEL=gpt-4o or check OpenAI status."
              : msg.slice(0, 200),
    };
}

/**
 * Run OpenAI summarize on already-extracted document text (sync route + async job worker).
 */
export async function summarizeStudyKitWithOpenAI(
    openai: OpenAI,
    extracted: ExtractedDocument,
    presets: StudyPreset[],
    customScope: string,
    quizDepth: StudyQuizDepth = "review",
): Promise<string> {
    const model =
        process.env.STUDY_KIT_OPENAI_MODEL?.trim() || "gpt-5.4";
    const reasoningEffort = studyKitReasoningEffort();
    const verbosity = studyKitVerbosity();
    const system = buildExamRevisionSystemMessage(presets, customScope || undefined, quizDepth);
    const maxTokens = studyKitMaxOutputTokens(presets);
    const userContent = `Source label: ${extracted.fileName}
${extracted.truncated
        ? "Note: only the beginning of the source was available (length limit).\n"
        : ""}
--- Source text ---
${extracted.text}
--- End ---`;

    async function summarizeChatOnce(completionModel: string): Promise<string> {
        const response = await openai.chat.completions.create({
            model: completionModel,
            temperature: 0.25,
            max_completion_tokens: maxTokens,
            messages: [
                { role: "system", content: system },
                { role: "user", content: userContent },
            ],
        });
        const raw = chatCompletionAssistantText(response.choices?.[0]?.message);
        return sanitizeStudyKitModelOutput(raw);
    }

    async function summarizeChatWithFallback(preferred: string): Promise<string> {
        const order = [preferred, ...CHAT_MODEL_FALLBACKS.filter((m) => m !== preferred)];
        let lastErr: unknown;
        for (const m of order) {
            try {
                const out = await summarizeChatOnce(m);
                if (out)
                    return out;
            }
            catch (e) {
                lastErr = e;
                if (e instanceof APIError) {
                    if (e.status === 401 || e.status === 429)
                        throw e;
                    if (e.status === 400 || e.status === 404 || e.status === 403) {
                        console.warn(`${SK_LOG} chat_model_retry`, m, e.status, e.message);
                        continue;
                    }
                }
                throw e;
            }
        }
        throw lastErr ?? new Error("empty completion");
    }

    console.info(`${SK_LOG} openai_call`, { model, maxTokens });

    if (useResponsesApiForModel(model)) {
        try {
            const response = await openai.responses.create({
                model,
                instructions: system,
                input: userContent,
                max_output_tokens: maxTokens,
                reasoning: { effort: reasoningEffort },
                text: { verbosity },
            });
            if (response.error)
                throw new Error(response.error.message ?? "response error");
            const summary = extractStudyKitResponsesText(response);
            if (!summary)
                throw new Error("empty assistant output");
            return summary;
        }
        catch (responsesErr) {
            console.warn(`${SK_LOG} responses_failed_fallback_chat`, responsesErr);
            return summarizeChatWithFallback("gpt-4o");
        }
    }
    return summarizeChatWithFallback(model);
}
