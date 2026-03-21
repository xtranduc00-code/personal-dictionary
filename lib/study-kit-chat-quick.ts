import { normalizeStudyKitSheetMarkdown } from "@/lib/study-kit-markdown-normalize";
import { extractMarkdownSection } from "@/lib/study-kit-section";
import type { TranslationKey } from "@/lib/i18n";

export const QUICK_SECTION_BODY_MAX = 6000;

export type StudyKitQuickActionSpec = { labelKey: TranslationKey; prompt: string };

export const STUDY_KIT_QUICK_ACTIONS: StudyKitQuickActionSpec[] = [
    {
        labelKey: "studyKitChatQuickDeeper",
        prompt:
            "Explain the hardest ideas on this study sheet in more depth — intuition first, then why they matter for exams.",
    },
    {
        labelKey: "studyKitChatQuickExample",
        prompt:
            "Give one concrete step-by-step example (you may use small numbers) for the main algorithm or concept on this sheet.",
    },
    {
        labelKey: "studyKitChatQuickTraps",
        prompt:
            "List common mistakes and exam traps for this material, and how to avoid them.",
    },
];

/** When `sectionTitle` is null/empty, the prompt applies to the whole sheet (no excerpt). */
export function buildQuickUserMessageForSection(
    prompt: string,
    studyContext: string,
    sectionTitle: string | null,
): string {
    const focus = sectionTitle?.trim() ?? "";
    if (!focus)
        return prompt;
    const ctx = normalizeStudyKitSheetMarkdown(studyContext);
    let block = extractMarkdownSection(ctx, focus);
    if (!block)
        block = `## ${focus}`;
    if (block.length > QUICK_SECTION_BODY_MAX) {
        block = `${block.slice(0, QUICK_SECTION_BODY_MAX)}\n\n[truncated]`;
    }
    return `${prompt}\n\n---\nApply this request only to the section below (heading: "${focus}"). Do not give equal depth to other sections unless a one-line contrast is needed.\n\n${block}\n---`;
}
