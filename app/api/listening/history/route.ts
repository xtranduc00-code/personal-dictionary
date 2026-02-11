import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseServer } from "@/lib/supabase-server";
export async function GET(req: Request) {
    const user = await getAuthUser(req);
    if (!user)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
        const { data, error } = await supabaseServer
            .from("listening_history")
            .select("id,set_id,test_id,set_label,test_label,correct_count,total_count,band,date")
            .eq("user_id", user.id)
            .order("date", { ascending: false })
            .limit(100);
        if (error)
            throw error;
        const list = (data ?? []).map((r) => ({
            setId: r.set_id,
            testId: r.test_id,
            setLabel: r.set_label,
            testLabel: r.test_label,
            correctCount: r.correct_count,
            totalCount: r.total_count,
            band: r.band,
            date: r.date,
        }));
        return NextResponse.json(list);
    }
    catch (e) {
        console.error("listening history GET", e);
        return NextResponse.json({ error: "Failed to load history" }, { status: 500 });
    }
}
export async function POST(req: Request) {
    const user = await getAuthUser(req);
    if (!user)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
        const body = await req.json();
        const setId = body?.setId;
        const testId = body?.testId;
        const setLabel = body?.setLabel;
        const testLabel = body?.testLabel;
        const correctCount = body?.correctCount;
        const totalCount = body?.totalCount;
        const band = body?.band;
        const date = body?.date ?? new Date().toISOString();
        if (typeof setId !== "string" ||
            typeof testId !== "string" ||
            typeof setLabel !== "string" ||
            typeof testLabel !== "string" ||
            typeof correctCount !== "number" ||
            typeof totalCount !== "number") {
            return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
        }
        const { error } = await supabaseServer.from("listening_history").insert({
            user_id: user.id,
            set_id: setId,
            test_id: testId,
            set_label: setLabel,
            test_label: testLabel,
            correct_count: correctCount,
            total_count: totalCount,
            band: band == null ? null : Number(band),
            date,
        });
        if (error)
            throw error;
        return NextResponse.json({ ok: true });
    }
    catch (e) {
        console.error("listening history POST", e);
        return NextResponse.json({ error: "Failed to save result" }, { status: 500 });
    }
}
