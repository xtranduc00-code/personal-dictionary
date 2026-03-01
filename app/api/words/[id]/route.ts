import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseServer } from "@/lib/supabase-server";
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
export async function PATCH(req: Request, { params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    const user = await getAuthUser(req);
    if (!user)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    try {
        const body = await req.json().catch(() => ({}));
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (typeof body.is_saved === "boolean")
            updates.is_saved = body.is_saved;
        if (typeof body.note === "string")
            updates.note = body.note || null;
        if (Array.isArray(body.tags))
            updates.tags = body.tags.map((t: unknown) => String(t).trim()).filter(Boolean);
        const { data, error } = await supabaseServer
            .from("words")
            .update(updates)
            .eq("id", id)
            .eq("user_id", user.id)
            .select()
            .single();
        if (error)
            throw error;
        return NextResponse.json(rowFromDb(data as Record<string, unknown>));
    }
    catch (e) {
        console.error("words PATCH", e);
        return NextResponse.json({ error: "Failed to update word" }, { status: 500 });
    }
}
export async function DELETE(req: Request, { params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    const user = await getAuthUser(req);
    if (!user)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    try {
        const { error } = await supabaseServer
            .from("words")
            .delete()
            .eq("id", id)
            .eq("user_id", user.id);
        if (error)
            throw error;
        return NextResponse.json({ ok: true });
    }
    catch (e) {
        console.error("words DELETE", e);
        return NextResponse.json({ error: "Failed to delete word" }, { status: 500 });
    }
}
