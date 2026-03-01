import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseForUserData } from "@/lib/supabase-server";
type Row = {
    id: string;
    title: string;
    date: string;
    end_date: string | null;
    start_time: string | null;
    end_time: string | null;
    note: string | null;
    color: string;
};
function toEvent(r: Row) {
    return {
        id: r.id,
        title: r.title,
        date: r.date,
        endDate: r.end_date ?? undefined,
        startTime: r.start_time ?? undefined,
        endTime: r.end_time ?? undefined,
        note: r.note ?? undefined,
        color: r.color,
    };
}
export async function GET(req: Request) {
    const user = await getAuthUser(req);
    if (!user)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
        const { data, error } = await supabaseForUserData()
            .from("calendar_events")
            .select("id,title,date,end_date,start_time,end_time,note,color")
            .eq("user_id", user.id)
            .order("date", { ascending: true })
            .order("start_time", { ascending: true });
        if (error)
            throw error;
        return NextResponse.json((data ?? []).map(toEvent));
    }
    catch (e) {
        console.error("calendar GET", e);
        return NextResponse.json({ error: "Failed to load events" }, { status: 500 });
    }
}
export async function POST(req: Request) {
    const user = await getAuthUser(req);
    if (!user)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
        const body = await req.json().catch(() => ({}));
        if (!body?.title || !body?.date) {
            return NextResponse.json({ error: "title and date are required" }, { status: 400 });
        }
        const { data, error } = await supabaseForUserData()
            .from("calendar_events")
            .insert({
            user_id: user.id,
            title: body.title,
            date: body.date,
            end_date: body.endDate ?? null,
            start_time: body.startTime ?? null,
            end_time: body.endTime ?? null,
            note: body.note ?? null,
            color: body.color ?? "blue",
        })
            .select("id,title,date,end_date,start_time,end_time,note,color")
            .single();
        if (error)
            throw error;
        return NextResponse.json(toEvent(data));
    }
    catch (e) {
        console.error("calendar POST", e);
        return NextResponse.json({ error: "Failed to create event" }, { status: 500 });
    }
}
