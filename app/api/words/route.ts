import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseServer } from "@/lib/supabase-server";
const MAX_HISTORY_ITEMS = 150;
function rowFromDb(r: Record<string, unknown>) {
    const rawSenses = r.senses;
    const senses = Array.isArray(rawSenses) ? rawSenses : [];
    const first = senses[0] as Record<string, unknown> | undefined;
    return {
        id: String(r.id),
        word: String(r.word),
        normalized_word: String(r.normalized_word),
        ipa_us: r.ipa_us != null ? String(r.ipa_us) : (first?.ipaUs ?? ""),
        is_saved: Boolean(r.is_saved),
        part_of_speech: (r.part_of_speech ?? first?.partOfSpeech ?? "other") as string,
        level: (r.level ?? first?.level ?? "B1") as string,
        meaning: String(r.meaning ?? first?.meaning ?? ""),
        synonyms: Array.isArray(r.synonyms) ? r.synonyms.map(String) : [],
        antonyms: Array.isArray(r.antonyms) ? r.antonyms.map(String) : [],
        examples: Array.isArray(r.examples) ? r.examples.map(String) : [],
        note: r.note != null && r.note !== "" ? String(r.note) : null,
        tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
        senses: senses.length > 0 ? senses : undefined,
        created_at: new Date(String(r.created_at)).toISOString(),
        updated_at: new Date(String(r.updated_at)).toISOString(),
    };
}
export async function GET(req: Request) {
    const user = await getAuthUser(req);
    if (!user)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const wordParam = searchParams.get("word");
    try {
        let query = supabaseServer
            .from("words")
            .select("*")
            .eq("user_id", user.id)
            .order("updated_at", { ascending: false });
        if (wordParam?.trim()) {
            const normalized = wordParam.trim().toLowerCase();
            query = query.eq("normalized_word", normalized).limit(1);
        }
        else {
            query = query.limit(1000);
        }
        const { data, error } = await query;
        if (error)
            throw error;
        const rows = (data ?? []).map((r) => rowFromDb(r as Record<string, unknown>));
        if (wordParam?.trim()) {
            const one = rows[0] ?? null;
            return NextResponse.json(one);
        }
        return NextResponse.json(rows);
    }
    catch (e) {
        console.error("words GET", e);
        return NextResponse.json({ error: "Failed to load words" }, { status: 500 });
    }
}
export async function POST(req: Request) {
    const user = await getAuthUser(req);
    if (!user)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
        const body = await req.json().catch(() => ({}));
        const entry = body as {
            word?: string;
            senses?: Array<Record<string, unknown>>;
        };
        const word = (entry.word ?? "").trim();
        const normalizedWord = word.toLowerCase();
        if (!normalizedWord) {
            return NextResponse.json({ error: "word required" }, { status: 400 });
        }
        const senses = Array.isArray(entry.senses) ? entry.senses : [];
        const first = senses[0] as Record<string, unknown> | undefined ?? {
            partOfSpeech: "other",
            level: "B1",
            ipaUs: "N/A",
            meaning: "",
            synonyms: [],
            antonyms: [],
            examples: [],
        };
        const sensesPayload = senses.map((s) => ({
            partOfSpeech: s.partOfSpeech ?? first.partOfSpeech ?? "other",
            level: s.level ?? first.level ?? "B1",
            ipaUs: s.ipaUs ?? first.ipaUs ?? "N/A",
            meaning: s.meaning ?? first.meaning ?? "",
            synonyms: Array.isArray(s.synonyms) ? s.synonyms : [],
            antonyms: Array.isArray(s.antonyms) ? s.antonyms : [],
            examples: Array.isArray(s.examples) ? s.examples : [],
        }));
        const { data: existing } = await supabaseServer
            .from("words")
            .select("id, is_saved, created_at, note, tags")
            .eq("user_id", user.id)
            .eq("normalized_word", normalizedWord)
            .maybeSingle();
        const now = new Date().toISOString();
        const id = existing?.id ?? crypto.randomUUID();
        const payload = {
            id,
            user_id: user.id,
            word,
            normalized_word: normalizedWord,
            ipa_us: (first.ipaUs as string) ?? "N/A",
            is_saved: existing?.is_saved ?? false,
            part_of_speech: (first.partOfSpeech as string) ?? "other",
            level: (first.level as string) ?? "B1",
            meaning: (first.meaning as string) ?? "",
            synonyms: (first.synonyms as string[]) ?? [],
            antonyms: (first.antonyms as string[]) ?? [],
            examples: (first.examples as string[]) ?? [],
            note: (existing as {
                note?: string;
            } | null)?.note ?? null,
            tags: (existing as {
                tags?: string[];
            } | null)?.tags ?? [],
            senses: sensesPayload,
            updated_at: now,
            created_at: (existing as {
                created_at?: string;
            } | null)?.created_at ?? now,
        };
        if (existing) {
            const { error: updateErr } = await supabaseServer
                .from("words")
                .update({
                word: payload.word,
                ipa_us: payload.ipa_us,
                part_of_speech: payload.part_of_speech,
                level: payload.level,
                meaning: payload.meaning,
                synonyms: payload.synonyms,
                antonyms: payload.antonyms,
                examples: payload.examples,
                senses: payload.senses,
                updated_at: payload.updated_at,
            })
                .eq("id", existing.id)
                .eq("user_id", user.id);
            if (updateErr)
                throw updateErr;
        }
        else {
            const { error: insertErr } = await supabaseServer.from("words").insert(payload);
            if (insertErr)
                throw insertErr;
        }
        const { data: history } = await supabaseServer
            .from("words")
            .select("id")
            .eq("user_id", user.id)
            .eq("is_saved", false)
            .order("updated_at", { ascending: true });
        const toTrim = (history ?? []);
        if (toTrim.length > MAX_HISTORY_ITEMS) {
            const toDelete = toTrim.slice(0, toTrim.length - MAX_HISTORY_ITEMS).map((r) => r.id);
            await supabaseServer.from("words").delete().in("id", toDelete);
        }
        return NextResponse.json(rowFromDb({ ...payload, created_at: payload.created_at, updated_at: now }));
    }
    catch (e) {
        console.error("words POST", e);
        return NextResponse.json({ error: "Failed to upsert word" }, { status: 500 });
    }
}
