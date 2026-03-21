import { PRESET_OUTPUT_ORDER, type StudyPreset } from "@/lib/study-kit-prompt";

export const STUDY_KIT_WIP_META_KEY = "study-kit-wip-meta";

export const MAX_META_PASTE_CHARS = 80_000;
export const MAX_META_JSON_CHARS = 100_000;

export type StudyKitSessionMetaV1 = {
    v: 1;
    inputTab: "file" | "paste" | "url";
    customScope: string;
    formats: Record<StudyPreset, boolean>;
    sources: Array<
        | { k: "url"; url: string }
        | { k: "paste"; text: string }
        | { k: "file"; name: string; size: number }
    >;
};

type SourceRowLike =
    | { kind: "file"; file: File }
    | { kind: "url"; url: string }
    | { kind: "paste"; text: string }
    | { kind: "file_stub"; name: string; size: number };

export function buildSessionMetaV1(
    inputTab: "file" | "paste" | "url",
    sources: SourceRowLike[],
    formats: Record<StudyPreset, boolean>,
    customScope: string,
): StudyKitSessionMetaV1 {
    const metaSources: StudyKitSessionMetaV1["sources"] = [];
    for (const s of sources) {
        if (s.kind === "url")
            metaSources.push({ k: "url", url: s.url.slice(0, 4000) });
        else if (s.kind === "paste")
            metaSources.push({ k: "paste", text: s.text.slice(0, MAX_META_PASTE_CHARS) });
        else if (s.kind === "file")
            metaSources.push({ k: "file", name: s.file.name.slice(0, 500), size: s.file.size });
        else if (s.kind === "file_stub")
            metaSources.push({ k: "file", name: s.name.slice(0, 500), size: s.size });
    }
    const fmt = {} as Record<StudyPreset, boolean>;
    for (const p of PRESET_OUTPUT_ORDER)
        fmt[p] = Boolean(formats[p]);
    return {
        v: 1,
        inputTab,
        customScope: customScope.slice(0, 4000),
        formats: fmt,
        sources: metaSources,
    };
}

export function stringifyMetaSafe(meta: StudyKitSessionMetaV1): string {
    const s = JSON.stringify(meta);
    if (s.length > MAX_META_JSON_CHARS)
        return JSON.stringify({ ...meta, sources: meta.sources.slice(0, 5) });
    return s;
}

export function sanitizeMetaForStore(raw: unknown): Record<string, unknown> {
    if (raw === undefined || raw === null)
        return {};
    if (typeof raw !== "object" || Array.isArray(raw))
        return {};
    try {
        const s = JSON.stringify(raw);
        if (s.length > MAX_META_JSON_CHARS)
            return {};
        return JSON.parse(s) as Record<string, unknown>;
    }
    catch {
        return {};
    }
}

export function isStudyKitSessionMetaV1(x: unknown): x is StudyKitSessionMetaV1 {
    if (!x || typeof x !== "object")
        return false;
    const o = x as Record<string, unknown>;
    return o.v === 1 && (o.inputTab === "file" || o.inputTab === "paste" || o.inputTab === "url") && typeof o.customScope === "string" && typeof o.formats === "object" && o.formats !== null && Array.isArray(o.sources);
}
