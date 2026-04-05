import { NextResponse } from "next/server";
import { sendVocabTestPushToUser } from "@/lib/push/send-vocab-reminder";
import { getAuthUser } from "@/lib/get-auth-user";
import { getSiteUrl } from "@/lib/site-url";
import { supabaseForUserData } from "@/lib/supabase-server";

/**
 * POST — send one vocabulary-style push to this user (same payload shape as cron).
 * Uses supabaseForUserData (service role when available) to read push_subscriptions
 * and vocab tables. If service role is absent the anon client is used — subscriptions
 * are still readable because the auth check above validates the user.
 */
export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = supabaseForUserData();

  try {
    const siteUrl = getSiteUrl();
    const result = await sendVocabTestPushToUser(db, user.id, siteUrl);
    if (result.skipped === "web-push not configured") {
      return NextResponse.json(
        { error: "Push is not configured on the server" },
        { status: 503 },
      );
    }
    if (result.skipped === "no push subscriptions") {
      return NextResponse.json(
        { error: "No subscription", sent: 0, failed: 0 },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      sent: result.sent,
      failed: result.failed,
      usedSample: result.usedSample,
      ieltsCount: result.ieltsCount ?? 0,
      flashcardCount: result.flashcardCount ?? 0,
    });
  } catch (e) {
    console.error("test-vocab push", e);
    return NextResponse.json({ error: "Vocab test push failed" }, { status: 500 });
  }
}
