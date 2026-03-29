import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { isWebPushConfigured } from "@/lib/push/web-push-config";
import { supabaseForUserData } from "@/lib/supabase-server";

type PushSubBody = {
  subscription?: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
};

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isWebPushConfigured()) {
    return NextResponse.json(
      { error: "Push is not configured on the server" },
      { status: 503 },
    );
  }
  const body = (await req.json().catch(() => ({}))) as PushSubBody;
  const sub = body.subscription;
  const endpoint = sub?.endpoint?.trim();
  const p256dh = sub?.keys?.p256dh?.trim();
  const auth = sub?.keys?.auth?.trim();
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json(
      { error: "Invalid subscription payload" },
      { status: 400 },
    );
  }
  try {
    const { error } = await supabaseForUserData()
      .from("push_subscriptions")
      .upsert(
        {
          user_id: user.id,
          endpoint,
          p256dh,
          auth,
          user_agent: req.headers.get("user-agent")?.slice(0, 512) ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "endpoint" },
      );
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("push subscribe", e);
    return NextResponse.json({ error: "Failed to save subscription" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const user = await getAuthUser(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { endpoint?: string };
  const endpoint = body.endpoint?.trim();
  try {
    let q = supabaseForUserData()
      .from("push_subscriptions")
      .delete()
      .eq("user_id", user.id);
    if (endpoint) q = q.eq("endpoint", endpoint);
    const { error } = await q;
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("push unsubscribe", e);
    return NextResponse.json({ error: "Failed to remove subscription" }, { status: 500 });
  }
}
