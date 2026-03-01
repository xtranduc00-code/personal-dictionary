import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseForUserData } from "@/lib/supabase-server";
type Params = {
    params: Promise<{
        eventId: string;
    }>;
};
export async function PATCH(req: Request, { params }: Params) {
    const user = await getAuthUser(req);
    if (!user)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { eventId } = await params;
    try {
        const body = await req.json().catch(() => ({}));
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (body.title !== undefined)
            updates.title = body.title;
        if (body.date !== undefined)
            updates.date = body.date;
        if (body.endDate !== undefined)
            updates.end_date = body.endDate ?? null;
        if (body.startTime !== undefined)
            updates.start_time = body.startTime ?? null;
        if (body.endTime !== undefined)
            updates.end_time = body.endTime ?? null;
        if (body.note !== undefined)
            updates.note = body.note ?? null;
        if (body.color !== undefined)
            updates.color = body.color;
        const { data, error } = await supabaseForUserData()
            .from("calendar_events")
            .update(updates)
            .eq("id", eventId)
            .eq("user_id", user.id)
            .select("id,title,date,end_date,start_time,end_time,note,color")
            .single();
        if (error)
            throw error;
        return NextResponse.json({
            id: data.id,
            title: data.title,
            date: data.date,
            endDate: data.end_date ?? undefined,
            startTime: data.start_time ?? undefined,
            endTime: data.end_time ?? undefined,
            note: data.note ?? undefined,
            color: data.color,
        });
    }
    catch (e) {
        console.error("calendar PATCH", e);
        return NextResponse.json({ error: "Failed to update event" }, { status: 500 });
    }
}
export async function DELETE(req: Request, { params }: Params) {
    const user = await getAuthUser(req);
    if (!user)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { eventId } = await params;
    try {
        const { error } = await supabaseForUserData()
            .from("calendar_events")
            .delete()
            .eq("id", eventId)
            .eq("user_id", user.id);
        if (error)
            throw error;
        return NextResponse.json({ ok: true });
    }
    catch (e) {
        console.error("calendar DELETE", e);
        return NextResponse.json({ error: "Failed to delete event" }, { status: 500 });
    }
}
