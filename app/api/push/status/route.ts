import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { isWebPushConfigured } from "@/lib/push/web-push-config";
import { supabaseForUserData } from "@/lib/supabase-server";

export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const configured = isWebPushConfigured();
  if (!configured) {
    return NextResponse.json({
      configured: false,
      subscriptionCount: 0,
      pushSupported: false,
    });
  }
  try {
    const { count, error } = await supabaseForUserData()
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    if (error) throw error;
    return NextResponse.json({
      configured: true,
      subscriptionCount: count ?? 0,
      pushSupported: true,
    });
  } catch (e) {
    console.error("push status", e);
    return NextResponse.json({ error: "Failed to load status" }, { status: 500 });
  }
}
