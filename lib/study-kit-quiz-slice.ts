const QUIZ_HEADING = /^##\s+Quiz\s*$/im;
const ANSWER_HEADING = /^##\s+Answer\s+key\s*$/im;

/** Split body into numbered top-level items (`1.` / `2)` at line start). Preamble before first number stays with first item. */
export function splitStudyKitNumberedBlocks(body: string): string[] {
    const lines = body.split("\n");
    const blocks: string[] = [];
    let cur: string[] = [];
    const isNumberedStart = (line: string) => /^\d{1,2}[\.\)]\s/.test(line);

    const flush = () => {
        const s = cur.join("\n").trim();
        if (s)
            blocks.push(s);
        cur = [];
    };

    for (const line of lines) {
        if (isNumberedStart(line)) {
            if (cur.length > 0 && isNumberedStart(cur[0]!))
                flush();
            cur.push(line);
        }
        else {
            cur.push(line);
        }
    }
    flush();
    return blocks;
}

function renumberBlocks(blocks: string[]): string {
    const out = blocks.map((block, i) => {
        const lines = block.split("\n");
        if (lines.length === 0)
            return block;
        lines[0] = lines[0]!.replace(/^\s*\d{1,2}[\.\)]\s*/, `${i + 1}. `);
        return lines.join("\n");
    });
    return out.join("\n\n");
}

/** Text after the last numbered answer block (e.g. another `##` section). */
function suffixAfterBlocks(full: string, blocks: string[]): string {
    if (blocks.length === 0)
        return full.trim();
    const last = blocks[blocks.length - 1]!;
    const idx = full.lastIndexOf(last);
    if (idx < 0)
        return "";
    const tail = full.slice(idx + last.length).trim();
    return tail;
}

export function studyKitMarkdownHasQuiz(markdown: string): boolean {
    return QUIZ_HEADING.test(markdown) && ANSWER_HEADING.test(markdown);
}

export function countStudyKitQuizQuestions(markdown: string): number {
    const m = markdown.match(QUIZ_HEADING);
    const a = markdown.match(ANSWER_HEADING);
    if (m?.index === undefined || a?.index === undefined || a.index <= m.index)
        return 0;
    const quizBody = markdown.slice(m.index + m[0].length, a.index);
    return splitStudyKitNumberedBlocks(quizBody).length;
}

/**
 * Show at most `maxQuestions` quiz items + the same count of answer-key items (when present).
 * Renumbers `1…n` when a strict subset is shown. Returns original markdown if nothing to trim.
 */
export function sliceStudyKitQuizMarkdown(markdown: string, maxQuestions: number): string {
    if (maxQuestions <= 0)
        return markdown;

    const quizMatch = markdown.match(QUIZ_HEADING);
    const ansMatch = markdown.match(ANSWER_HEADING);
    if (quizMatch?.index === undefined || ansMatch?.index === undefined)
        return markdown;
    if (ansMatch.index <= quizMatch.index)
        return markdown;

    const quizHeaderEnd = quizMatch.index + quizMatch[0].length;
    const answerHeaderStart = ansMatch.index;
    const answerHeaderEnd = ansMatch.index + ansMatch[0].length;

    const quizBody = markdown.slice(quizHeaderEnd, answerHeaderStart);
    const afterAnswer = markdown.slice(answerHeaderEnd);

    const qBlocks = splitStudyKitNumberedBlocks(quizBody);
    if (qBlocks.length === 0)
        return markdown;

    const aBlocks = splitStudyKitNumberedBlocks(afterAnswer.trim());
    const answerCap = aBlocks.length > 0 ? aBlocks.length : qBlocks.length;
    const n = Math.min(maxQuestions, qBlocks.length, answerCap);
    if (n === qBlocks.length)
        return markdown;

    const qPick = qBlocks.slice(0, n);
    const aPick = aBlocks.length > 0 ? aBlocks.slice(0, n) : [];

    const beforeQuiz = markdown.slice(0, quizHeaderEnd).replace(/\s+$/, "");
    const quizOut = renumberBlocks(qPick);
    const answerHdr = ansMatch[0].trimEnd();
    const answerOut = aPick.length > 0 ? renumberBlocks(aPick) : "";
    const suffix = suffixAfterBlocks(afterAnswer, aBlocks);

    const parts = [beforeQuiz, "", quizOut, "", answerHdr, "", answerOut];
    if (suffix)
        parts.push("", suffix);
    return parts.join("\n");
}
