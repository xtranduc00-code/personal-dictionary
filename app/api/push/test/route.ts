import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { getSiteUrl } from "@/lib/site-url";
import {
  ensureWebPushConfigured,
  isWebPushConfigured,
  webpush,
} from "@/lib/push/web-push-config";
import { shouldDropPushSubscription } from "@/lib/push/should-drop-push-subscription";
import { supabaseForUserData } from "@/lib/supabase-server";

/**
 * POST — send one test notification to every saved subscription for this user.
 */
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
  ensureWebPushConfigured();
  const db = supabaseForUserData();
  const { data: rows, error } = await db
    .from("push_subscriptions")
    .select("endpoint,p256dh,auth")
    .eq("user_id", user.id);
  if (error) {
    console.error("push test select", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  if (!rows?.length) {
    return NextResponse.json(
      { error: "No subscription", sent: 0, failed: 0 },
      { status: 400 },
    );
  }

  const siteUrl = getSiteUrl().replace(/\/$/, "");
  const tag = `push-test-${Date.now()}`;
  const payload = JSON.stringify({
    title: "Test · Ken",
    body: "Push is working.",
    url: `${siteUrl}/calendar`,
    tag,
  });

  let sent = 0;
  let failed = 0;
  let lastStatusCode: number | undefined;
  let lastDetail: string | undefined;

  for (const row of rows) {
    try {
      await webpush.sendNotification(
        {
          endpoint: row.endpoint as string,
          keys: {
            p256dh: row.p256dh as string,
            auth: row.auth as string,
          },
        },
        payload,
        { TTL: 120 },
      );
      sent += 1;
    } catch (e: unknown) {
      failed += 1;
      const wpe = e as {
        statusCode?: number;
        body?: string;
        message?: string;
      };
      const status = wpe.statusCode;
      const detail =
        typeof wpe.body === "string" && wpe.body.trim()
          ? wpe.body.trim().slice(0, 280)
          : (wpe.message ?? String(e)).slice(0, 280);
      lastStatusCode = status ?? lastStatusCode;
      lastDetail = detail || lastDetail;
      console.error("push test send failed", {
        statusCode: status,
        detail,
        endpointPrefix: String(row.endpoint).slice(0, 64),
      });
      const bodyRaw =
        typeof wpe.body === "string" ? wpe.body : undefined;
      if (shouldDropPushSubscription(status, bodyRaw)) {
        await db.from("push_subscriptions").delete().eq("endpoint", row.endpoint);
      }
    }
  }

  const dev = process.env.NODE_ENV === "development";
  return NextResponse.json({
    ok: true,
    sent,
    failed,
    ...(failed > 0
      ? {
          lastStatusCode,
          ...(dev && lastDetail ? { lastDetail } : {}),
        }
      : {}),
  });
}
