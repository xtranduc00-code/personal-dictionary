export const STUDY_PRESETS = [
    "summary_bullets",
    "exam_notes",
    "quiz",
    "flashcards",
    "definitions",
] as const;
export type StudyPreset = (typeof STUDY_PRESETS)[number];

export const STUDY_FOCUS_LEVELS = ["general", "important", "exam"] as const;
export type StudyFocusLevel = (typeof STUDY_FOCUS_LEVELS)[number];

export function parseStudyPreset(v: string | null | undefined): StudyPreset {
    const s = (v ?? "").trim();
    return (STUDY_PRESETS as readonly string[]).includes(s)
        ? (s as StudyPreset)
        : "summary_bullets";
}

export function parseStudyFocus(v: string | null | undefined): StudyFocusLevel {
    const s = (v ?? "").trim();
    return (STUDY_FOCUS_LEVELS as readonly string[]).includes(s)
        ? (s as StudyFocusLevel)
        : "general";
}

export type StudyKitPromptOptions = {
    preset: StudyPreset;
    focus: StudyFocusLevel;
    optQuiz: boolean;
    optHighlight: boolean;
    optStripFluff: boolean;
};

const PRESET_BLOCK: Record<StudyPreset, string> = {
    summary_bullets:
        "Primary deliverable: Markdown with clear headings and bullet lists that capture the main ideas, steps, and takeaways. Keep a logical hierarchy.",
    exam_notes:
        'Primary deliverable: "Exam-ready" revision notes with sections such as: Overview, Key definitions & facts, Relationships or comparisons (if relevant), Pitfalls or common mistakes (only if grounded in the text), and a short recap checklist.',
    quiz: "Primary deliverable: A practice quiz built strictly from the document. Mix short-answer and multiple-choice style items (list options for MCQs). Finish with a separate section titled exactly ## Answer key listing correct answers and 1–2 sentence explanations grounded in the document.",
    flashcards:
        "Primary deliverable: Markdown flashcard-style items. For each card use two lines: **Front:** … then **Back:** … One concept per card; cover key terms and ideas from the document only.",
    definitions:
        "Primary deliverable: A glossary of important terms from the document. Format: **Term** — concise definition. Group or alphabetize if helpful. Omit terms not present in the source.",
};

const FOCUS_BLOCK: Record<StudyFocusLevel, string> = {
    general:
        "Depth: Balanced coverage — explain main ideas without over-speculating about what an exam might ask.",
    important:
        "Depth: Emphasize central themes, core definitions, and relationships that hold the material together.",
    exam: "Depth: Optimize for tests — prioritize high-yield, recall-friendly facts, comparisons, dates, formulas, and crisp phrasing a student could rehearse before an exam.",
};

export function buildStudyKitSystemMessage(o: StudyKitPromptOptions): string {
    const parts = [
        "You are a study-kit assistant for learners preparing for exams.",
        "Rules:",
        "- Use ONLY what the source text supports. If the text is ambiguous, say so briefly instead of inventing.",
        "- Do not fabricate citations, quotations, or facts.",
        "- Write in Markdown (headings, bullets, tables when useful).",
        "- If the source is very short, keep the output proportionate.",
        "",
        FOCUS_BLOCK[o.focus],
        "",
        PRESET_BLOCK[o.preset],
    ];
    if (o.optStripFluff) {
        parts.push("");
        parts.push("Editing: Omit anecdotes, humor, off-topic asides, and repetitive examples unless they are essential to understand a tested idea.");
    }
    if (o.optHighlight) {
        parts.push("");
        parts.push('Emphasis: Use **bold** for must-know terms, formulas, dates, laws, and critical claims the learner should memorize.');
    }
    if (o.optQuiz && o.preset !== "quiz") {
        parts.push("");
        parts.push('Add-on: After the primary deliverable, add sections ## Practice quiz and ## Answer key with 5–12 new questions (varied types) grounded only in the document, then answers with brief explanations.');
    }
    return parts.join("\n");
}

export function studyKitMaxOutputTokens(o: StudyKitPromptOptions): number {
    if (o.preset === "quiz" || o.optQuiz)
        return 8192;
    if (o.preset === "flashcards" || o.preset === "exam_notes")
        return 6144;
    return 4096;
}
