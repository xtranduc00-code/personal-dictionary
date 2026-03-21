export type StudyKitH2Section = { title: string; body: string };

/** Split markdown at top-level `##` (not `###`). Preamble is text before the first `##`. */
export function splitMarkdownByTopLevelH2(markdown: string): {
    preamble: string;
    sections: StudyKitH2Section[];
} {
    const lines = markdown.split("\n");
    let i = 0;
    const preambleLines: string[] = [];
    while (i < lines.length) {
        const line = lines[i];
        if (line.startsWith("## ") && !line.startsWith("###"))
            break;
        preambleLines.push(line);
        i++;
    }
    const sections: StudyKitH2Section[] = [];
    while (i < lines.length) {
        const line = lines[i];
        if (line.startsWith("## ") && !line.startsWith("###")) {
            const title = line.slice(3).trim();
            i++;
            const body: string[] = [];
            while (i < lines.length) {
                const L = lines[i];
                if (L.startsWith("## ") && !L.startsWith("###"))
                    break;
                body.push(L);
                i++;
            }
            sections.push({ title, body: body.join("\n").trim() });
        }
        else {
            i++;
        }
    }
    return { preamble: preambleLines.join("\n").trim(), sections };
}

/** Top-level `## …` titles in order (excludes `###`). */
export function listStudyKitH2Headings(markdown: string): string[] {
    const lines = markdown.split("\n");
    const out: string[] = [];
    for (const line of lines) {
        if (line.startsWith("## ") && !line.startsWith("###"))
            out.push(line.slice(3).trim());
    }
    return out;
}

/** Extract `## …` block from markdown by matching heading text (from rendered h2). */
export function extractMarkdownSection(full: string, headingText: string): string {
    const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
    const target = norm(headingText);
    const lines = full.split("\n");
    let start = -1;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.startsWith("## ") || line.startsWith("###"))
            continue;
        const rest = line.slice(3).trim();
        const r = norm(rest);
        if (r === target || r.includes(target) || target.includes(r)) {
            start = i;
            break;
        }
    }
    if (start < 0)
        return "";
    let end = lines.length;
    for (let j = start + 1; j < lines.length; j++) {
        if (/^##\s/.test(lines[j])) {
            end = j;
            break;
        }
    }
    return lines.slice(start, end).join("\n").trim();
}
