import type { Part1CellPart } from "./listening-part-content";
export type InlinePart = {
    type: "text";
    text: string;
    boldLabel?: boolean;
} | {
    type: "blank";
    qNum: number;
};
export type NotesNode = {
    type: "title";
    text: string;
} | {
    type: "paragraph";
    parts: InlinePart[];
} | {
    type: "bullet";
    level: number;
    parts: InlinePart[];
} | {
    type: "row";
    parts: InlinePart[];
};
export type NotesSection = {
    sectionTitle?: string;
    nodes: NotesNode[];
};
function trimLine(s: string): string {
    return s.trim();
}
/** Dòng bullet dạng sách Cambridge: en-dash (–) hoặc gạch ngang ASCII (-). */
function getBulletLevel(line: string, keepDashBullet: boolean): number | null {
    const t = line.trimStart();
    if (keepDashBullet && /^(?:\u2013|-)\s/.test(t))
        return 1;
    if (/^(●|•)\s/.test(t) || /^\s*(●|•)\s/.test(line))
        return 0;
    return null;
}
function splitLabelAndTail(line: string): [
    string,
    string
] | null {
    const t = line.trim();
    const match = t.match(/^(.+?):\s*(.*)$/);
    if (!match)
        return null;
    const [, beforeColon, afterColon] = match;
    const labelPart = beforeColon.trim();
    if (labelPart.length === 0 || labelPart.length > 50)
        return null;
    if (/[.!?]/.test(labelPart))
        return null;
    return [labelPart + ":", afterColon.trim() ? " " + afterColon.trim() : ""];
}
function toStream(content: Part1CellPart[], keepDashBullet: boolean, bulletChar: "•" | "●"): Array<{
    kind: "text";
    line: string;
} | {
    kind: "blank";
    qNum: number;
}> {
    const stream: Array<{
        kind: "text";
        line: string;
    } | {
        kind: "blank";
        qNum: number;
    }> = [];
    for (const part of content) {
        if ("blank" in part) {
            stream.push({ kind: "blank", qNum: part.blank });
            continue;
        }
        let text = part.text;
        if (!keepDashBullet) {
            text = text.replace(/(^|\n)–\s*/g, `$1${bulletChar} `);
        }
        const lines = text.split("\n");
        for (const line of lines) {
            stream.push({ kind: "text", line });
        }
    }
    return stream;
}
export function parseNotesSection(content: Part1CellPart[], options?: {
    sectionTitle?: string;
    bulletChar?: "•" | "●";
    keepDashBullet?: boolean;
}): NotesSection {
    const keepDashBullet = options?.keepDashBullet ?? false;
    const bulletChar = options?.bulletChar ?? "•";
    const sectionTitle = options?.sectionTitle?.trim();
    const stream = toStream(content, keepDashBullet, bulletChar);
    const nodes: NotesNode[] = [];
    let i = 0;
    while (i < stream.length) {
        const item = stream[i];
        if (item.kind === "blank") {
            nodes.push({
                type: "row",
                parts: [
                    { type: "text", text: "" },
                    { type: "blank", qNum: item.qNum },
                ],
            });
            i++;
            continue;
        }
        const line = item.line;
        const trimmed = trimLine(line);
        if (!trimmed) {
            i++;
            continue;
        }
        const bulletLevel = getBulletLevel(line, keepDashBullet);
        if (bulletLevel !== null) {
            const parts: InlinePart[] = [{ type: "text", text: line }];
            i++;
            const next1 = stream[i];
            if (i < stream.length && next1.kind === "blank") {
                parts.push({ type: "blank", qNum: next1.qNum });
                i++;
            }
            const next2 = stream[i];
            if (i < stream.length && next2.kind === "text") {
                const nextTrimmed = trimLine(next2.line);
                if (nextTrimmed && getBulletLevel(next2.line, keepDashBullet) === null) {
                    parts.push({ type: "text", text: " " + next2.line.trim() });
                    i++;
                }
            }
            nodes.push({ type: "bullet", level: bulletLevel, parts });
            continue;
        }
        const labelTail = splitLabelAndTail(trimmed);
        if (labelTail) {
            const [labelText, sameLineTail] = labelTail;
            const parts: InlinePart[] = [
                { type: "text", text: labelText, boldLabel: true },
            ];
            if (sameLineTail)
                parts.push({ type: "text", text: sameLineTail });
            i++;
            const next1 = stream[i];
            if (i < stream.length && next1.kind === "blank") {
                parts.push({ type: "blank", qNum: next1.qNum });
                i++;
            }
            const next2 = stream[i];
            if (i < stream.length && next2.kind === "text") {
                const nextTrimmed = trimLine(next2.line);
                if (nextTrimmed && getBulletLevel(next2.line, keepDashBullet) === null) {
                    parts.push({ type: "text", text: " " + next2.line.trim() });
                    i++;
                }
            }
            nodes.push({ type: "row", parts });
            continue;
        }
        const parts: InlinePart[] = [{ type: "text", text: line }];
        i++;
        const next1 = stream[i];
        if (i < stream.length && next1.kind === "blank") {
            parts.push({ type: "blank", qNum: next1.qNum });
            i++;
        }
        const next2 = stream[i];
        if (i < stream.length && next2.kind === "text") {
            const nextTrimmed = trimLine(next2.line);
            if (nextTrimmed && getBulletLevel(next2.line, keepDashBullet) === null) {
                parts.push({ type: "text", text: " " + next2.line.trim() });
                i++;
            }
        }
        nodes.push({ type: "row", parts });
    }
    return { sectionTitle: sectionTitle || undefined, nodes };
}
