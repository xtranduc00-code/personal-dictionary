export const STUDY_PRESETS = ["summary_bullets", "mindmap", "quiz"] as const;
export type StudyPreset = (typeof STUDY_PRESETS)[number];

/** Stable order in the model output and in UI checkboxes. */
export const PRESET_OUTPUT_ORDER: StudyPreset[] = ["summary_bullets", "mindmap", "quiz"];

export function parseStudyPreset(v: string | null | undefined): StudyPreset {
    const s = (v ?? "").trim();
    return (STUDY_PRESETS as readonly string[]).includes(s)
        ? (s as StudyPreset)
        : "summary_bullets";
}

function normalizePresetList(presets: StudyPreset[]): StudyPreset[] {
    const set = new Set(presets.filter((p) => (STUDY_PRESETS as readonly string[]).includes(p)));
    const ordered = PRESET_OUTPUT_ORDER.filter((p) => set.has(p));
    return ordered.length > 0 ? ordered : ["summary_bullets"];
}

/** Comma-separated presets, or legacy single `preset`. Dedupes, orders, defaults to summary. */
export function parseStudyPresets(
    rawList: string | null | undefined,
    legacySingle: string | null | undefined,
): StudyPreset[] {
    const raw = (rawList ?? "").trim();
    const tokens = raw
        ? raw.split(",").map((s) => s.trim()).filter(Boolean)
        : legacySingle?.trim()
          ? [legacySingle.trim()]
          : [];
    const seen = new Set<string>();
    const picked: StudyPreset[] = [];
    for (const tok of tokens) {
        if (!(STUDY_PRESETS as readonly string[]).includes(tok) || seen.has(tok))
            continue;
        seen.add(tok);
        picked.push(tok as StudyPreset);
    }
    return normalizePresetList(picked);
}

export function studyKitMaxOutputTokens(presets: StudyPreset[]): number {
    const p = normalizePresetList(presets);
    let n = 4096;
    /** 30 full-stem questions + key need more headroom than a short 10-Q sheet. */
    if (p.includes("quiz"))
        n = Math.max(n, 12288);
    if (p.length >= 2)
        n = Math.min(16384, n + 2048 * (p.length - 1));
    return n;
}

/**
 * Exam-oriented system message; only requested outputs (summary / mindmap / quiz) are included.
 */
export function buildExamRevisionSystemMessage(
    presets: StudyPreset[],
    customScope?: string,
): string {
    const p = normalizePresetList(presets);
    const parts: string[] = [
        "You are an exam-revision compression engine. Transform the source into only the outputs requested below. Do not include sections the user did not ask for (no empty headings).",
        "",
        "Do this internally (never list these steps in the output):",
        "1) Remove filler: greetings, thanks, apologies, housekeeping, off-topic chat, transcription noise, repetition.",
        "2) Extract and regroup by concept for exam recall — not by lecture order.",
        "3) Compress: short phrases; drop examples unless they lock a definition or trap.",
    ];

    parts.push("", "OUTPUT ORDER — include only requested parts, in this sequence:");
    let orderN = 1;
    if (p.includes("summary_bullets")) {
        parts.push(`${orderN}) Summary sheet (numbered topical sections — SUMMARY BLOCK below).`);
        orderN++;
    }
    if (p.includes("mindmap")) {
        parts.push(`${orderN}) One section \`## Mind map\` with a single \`\`\`tree\`\`\` fence.`);
        orderN++;
    }
    if (p.includes("quiz")) {
        parts.push(`${orderN}) \`## Quiz\` then \`## Answer key\`.`);
        orderN++;
    }

    parts.push(
        "",
        "First line of the document must be exactly: `# ` + a clear sheet title from the source (e.g. `# Week 3 – Transport protocols (summary)`). Then one blank line before the next heading.",
    );

    if (p.includes("summary_bullets")) {
        parts.push(
            "",
            "SUMMARY BLOCK — **compact and skimmable**: one fast pass must be enough to revise; avoid long notes or many tiny headings.",
            "- Use **numbered topical sections** only: `## 1. Short topic name`, `## 2. …`. Target **5–6** sections for a typical source; **hard max 7** sections — aggressively **merge** related ideas; never split into thin micro-sections.",
            "- **Under each `## N.`**: after the anchor line (below), use ONLY `-` bullets (no prose paragraphs). **Hard max 3 bullets** per section (aim **2–3**). One exam-recall idea per line; **≤ 9 words** per bullet when possible — phrasing you could **rewrite from memory in an exam**.",
            "- **Cut scope:** if the source is long, **drop** secondary examples, edge cases, and “nice to know” lines. Prefer fewer sections with fewer bullets over completeness.",
            "- **Order:** most important bullets first. **Avoid nested sub-bullets** unless absolutely necessary (at most **one** indented sub-line under **one** bullet in the whole summary, only if it prevents confusion).",
            "",
            "ANCHOR LINE (required once per section, for fast recall):",
            "- Right after the blank line following `## N. Title`, output **exactly one** Markdown blockquote line: `> ` + a single **equation-style** recall phrase using `=` and `+` where it fits, e.g. `> Transport = reliability + control + multiplexing`. **≤ 12 words.** No bullet `-` on this line.",
            "- Then one blank line, then the `-` bullets. The anchor is not part of the bullet list.",
            "",
            "WHITESPACE & LAYOUT (critical — user must be able to scan on screen):",
            "- Each `##` heading on its **own line** — never concatenate multiple headings or run a heading into bullet text on the same line.",
            "- **Blank line** immediately after every `##` line before the anchor `>` line.",
            "- **Blank line** after the last bullet of a section before the next `##`.",
            "- Never output the summary as one continuous paragraph. Never omit newlines between sections.",
            "",
            "CONTENT:",
            "- Group by **topic/concept** (e.g. \"Packet errors\", \"Sequence numbers\", \"TCP handshake\"), not by vague buckets like \"Overview\" only.",
            "- **Sharpen bullets:** prefer **one mechanism per line** over comma-stuffed lines; use parentheses for exam hooks (e.g. split into separate bullets: reliability (ACK + retransmission), flow control (receiver window), congestion control (network load)).",
            "- **Exam-grade formulas (math / algorithms):** use **KaTeX**, not backticks, so notation renders cleanly: inline `$...$`, display on its own lines as `$$...$$`. Example inline: `$D(w)=\\min(D(w),\\,D(v)+c(v,w))$` (escape backslashes in Markdown). For Bellman-Ford / distance-vector or Dijkstra relaxation, write the **exact** recurrence the course uses.",
            "- **Instant-read gloss (required when you show a formula):** add **one separate bullet** right after, in **plain English only** (no `$…$`), e.g. `**Read:** Best distance to w = min(current estimate, distance-to-v plus cost of edge v–w).` or `**Read:** Relaxation — keep the smaller of old distance and route through neighbor v.` The reader must get the idea **before** reading symbols.",
            "- **Tiny example after math:** still add **at most one** bullet with numbers or one substitution line when the source allows; keep the sheet compact.",
            "- **Mini diagrams (optional, max 1–2 per summary when it clarifies graphs / routing / flows):** use one fenced code block with language tag exactly `mermaid` (small flowchart or graph, ≤8 nodes). If Mermaid is awkward, use a short ASCII sketch in a fenced `text` block instead. Do not invent unrelated diagrams.",
            "- **Merge redundancy:** if two bullets say almost the same thing (e.g. two Go-Back-N sentences), combine into **one** sharper line (e.g. \"Go-Back-N: resend first missing + all packets after it\").",
            "- Optional **one** comparison block only if essential: `## Key comparison` or final `## N.` — **max 3 bullets** total (e.g. `**TCP:** …` / `**UDP:** …`). Put `**CORE:**` or `**Exam:**` on **1–2** lines only.",
            "- Markers (use on bullets that must pop at a glance; still keep the sheet sparse): `**CORE:**` (essential concept), `**MUST:**` (memorize exactly), `**Trap:**` (common mistake), `**Exam:**` (likely question angle). Optional: `**KNOW:**` for supporting context only.",
            "- After any marker (`**CORE:**`, `**Trap:**`, etc.), the **rest of that bullet** must start with a **capital letter** (sentence case), e.g. `**CORE:** Loss is…` not `**CORE:** loss is…`. Same for every normal `-` bullet line: start the phrase with a capital unless it is a proper formula/symbol.",
            "- **Do not** use the old four-part layout (Overview / Mechanisms / Comparisons / Must remember) for this summary.",
        );
    }

    if (p.includes("mindmap")) {
        parts.push(
            "",
            "MIND MAP BLOCK (`## Mind map`):",
            "- If a summary precedes this, leave a blank line before `## Mind map`.",
            "- Output ONLY one fenced code block with language tag exactly `tree` (three backticks + tree).",
            "- Inside: one line per node; each line starts with `- `; nest children with exactly two more leading spaces per level (no tabs); max depth 4; faithful to source structure.",
            "- **Branching:** use **one top-level `-` branch per major concept** (e.g. routing table vs Dijkstra vs Bellman–Ford), not one giant list that mixes them.",
            "- **Algorithm / procedure lines** must read as an **action flow**, not a paragraph: each node label is a **short step** (about **2–5 words**), e.g. `Init`, `Pick min unvisited`, `Relax edges`, `Repeat until done` — never long clauses like “Needs global topology…” as a single node.",
            "- **Color tags (use on branch roots so the UI can group visually):** start the visible label with exactly one of `[rt] ` (routing table / forwarding / FIB), `[dj] ` (Dijkstra / link-state), or `[bf] ` (Bellman–Ford / distance-vector) on **each separate top-level `-` line** and again when a nested branch switches topic. Example: `- [rt] Routing table` … `- [dj] Dijkstra` … `- Init` … `- Pick min` … Children inherit the same idea until you introduce another `[tag] ` line.",
            "- Do not put the mind map in a paragraph outside the fence.",
        );
    }

    if (p.includes("quiz")) {
        parts.push(
            "",
            "QUIZ BLOCK:",
            "- If prior sections exist, blank line before `## Quiz`.",
            "- Output **exactly 30 numbered questions** under `## Quiz`: use `1.` … `30.` (one question per number, no skipping).",
            "- **Diversity (spread across all 30):** include several **multiple-choice** (clear A/B/C/D or listed options), several **short free-response** (define / compare / explain briefly), **numeric or table-style** items where the source supports them, and at least a few **true/false or “which statement is wrong?”** if appropriate. Do not let one format dominate (avoid 25 MCQs only).",
            "- **Computational & exam-style exercises (priority when the source covers them):** for topics like **shortest-path / Dijkstra / link-state**, **distance-vector / Bellman–Ford**, **routing tables**, or any worked examples in the source, include **multiple full exercise stems** — e.g. a **small graph or edge list with weights**, then ask for **shortest path, path cost, or next-hop** from a given start (or one relaxation step). Reuse only **numbers/edges that you state in the question**; if the source lacks a graph, you may invent a **tiny consistent toy example** (≤6 nodes) that matches the algorithm taught.",
            "- Each question must be **self-contained**: reader can answer without opening other files; paste any needed data (graph, table header, distances) **inside that question**.",
            "- **Diagrams in the quiz (not optional for graph-style topics):** whenever a question depends on **network topology, weighted edges, or algorithm flow**, include a fenced block with language tag exactly `mermaid` **inside that same question** (before or after the stem). Use `graph LR` / `flowchart TD` with **≤8 nodes** and **edge labels for weights** where relevant. At least **several** questions on routing / shortest-path / Dijkstra / Bellman–Ford must ship with a Mermaid figure — do **not** rely on prose-only or loose ASCII for those.",
            "- Then heading exactly `## Answer key` with **30 matching entries** (`1.` … `30.`) — correct answer plus a **brief** explanation (≤15 words when possible; allow a short numeric line or one equation for calculation items).",
        );
    }

    parts.push(
        "",
        "GLOBAL:",
        "- Use only what the source supports.",
        "- No meta commentary about your process.",
        p.includes("quiz")
            ? "- **Brevity** applies to **summary and mind map** (keep those skimmable). **Do not** shorten or merge away the quiz: the `## Quiz` + `## Answer key` must still deliver **30 distinct questions** with the mix and exercise depth required in QUIZ BLOCK."
            : "- **Brevity over coverage:** the user needs a **short** sheet they can skim before an exam — if in doubt, shorten.",
    );

    const scope = customScope?.trim();
    if (scope) {
        parts.push(
            "",
            "CUSTOM SCOPE (apply only when the source clearly supports it; do not invent from skipped parts):",
            scope,
        );
    }

    return parts.join("\n");
}
