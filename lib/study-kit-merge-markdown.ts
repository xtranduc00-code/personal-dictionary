/**
 * Merge two study-kit markdown strings by H2 sections (## …).
 * Same heading (normalized) → bodies concatenated with a divider.
 * Sections only in one sheet are kept; order: base sections first, then incoming-only sections.
 */

function normH2Heading(line: string): string {
    return line
        .replace(/^##\s+/, "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

export type H2Split = {
    /** Everything before the first top-level `##` (usually `# title` + preamble). */
    head: string;
    sections: { headingLine: string; key: string; body: string }[];
};

/** Split on `## ` lines (not `###`). */
export function splitStudyKitMarkdownByH2(markdown: string): H2Split {
    const lines = markdown.replace(/\r\n/g, "\n").split("\n");
    let i = 0;
    const headLines: string[] = [];
    while (i < lines.length) {
        const L = lines[i]!;
        if (/^##\s/.test(L) && !/^###/.test(L))
            break;
        headLines.push(L);
        i++;
    }
    const sections: H2Split["sections"] = [];
    while (i < lines.length) {
        const L = lines[i]!;
        if (!/^##\s/.test(L) || /^###/.test(L)) {
            i++;
            continue;
        }
        const headingLine = L;
        const key = normH2Heading(headingLine);
        i++;
        const bodyArr: string[] = [];
        while (i < lines.length) {
            const M = lines[i]!;
            if (/^##\s/.test(M) && !/^###/.test(M))
                break;
            bodyArr.push(M);
            i++;
        }
        sections.push({
            headingLine,
            key,
            body: bodyArr.join("\n").replace(/\s+$/, ""),
        });
    }
    return { head: headLines.join("\n").trimEnd(), sections };
}

const SECTION_MERGE_RULE = "\n\n---\n\n";

/**
 * Merge `incoming` into `base`. Overlapping H2 keys append bodies (after a rule line).
 * Prefer `base.head` when non-empty; otherwise `incoming.head`.
 */
export function mergeStudyKitSheetsMarkdown(base: string, incoming: string): string {
    const a = base.trim();
    const b = incoming.trim();
    if (!a)
        return b;
    if (!b)
        return a;

    const sa = splitStudyKitMarkdownByH2(a);
    const sb = splitStudyKitMarkdownByH2(b);

    const head = sa.head || sb.head;
    const byKey = new Map<string, { headingLine: string; body: string }>();
    const order: string[] = [];

    for (const s of sa.sections) {
        order.push(s.key);
        byKey.set(s.key, { headingLine: s.headingLine, body: s.body });
    }

    for (const s of sb.sections) {
        const cur = byKey.get(s.key);
        if (!cur) {
            order.push(s.key);
            byKey.set(s.key, { headingLine: s.headingLine, body: s.body });
        }
        else {
            const p1 = cur.body.trim();
            const p2 = s.body.trim();
            if (!p2) {
                /* keep base */
            }
            else if (!p1) {
                byKey.set(s.key, { headingLine: cur.headingLine, body: p2 });
            }
            else {
                byKey.set(s.key, {
                    headingLine: cur.headingLine,
                    body: `${p1}${SECTION_MERGE_RULE}${p2}`,
                });
            }
        }
    }

    const parts: string[] = [];
    if (head)
        parts.push(head);
    for (const key of order) {
        const s = byKey.get(key);
        if (!s)
            continue;
        parts.push(`${s.headingLine}\n${s.body}`.trimEnd());
    }
    return parts.join("\n\n").trimEnd() + "\n";
}

/** Loose match for “same week / same topic” sheet titles when saving. */
export function normalizeSheetTitleForMerge(title: string): string {
    return title
        .toLowerCase()
        .replace(/\s*\(summary\)\s*$/i, "")
        .replace(/\s*\(quiz\)\s*$/i, "")
        .replace(/\s*\(mind\s*map\)\s*$/i, "")
        .replace(/\s*[-–—]\s*quiz.*$/i, "")
        .replace(/\s*[-–—]\s*mind\s*map.*$/i, "")
        .replace(/\s+/g, " ")
        .trim();
}
