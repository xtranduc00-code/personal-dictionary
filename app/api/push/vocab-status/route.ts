import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseForUserData } from "@/lib/supabase-server";
import { isWebPushConfigured } from "@/lib/push/web-push-config";

/**
 * GET — return diagnostic info about vocab sources for push notifications.
 * Shows counts from IELTS speaking topics and flashcard vocab notes.
 */
export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = supabaseForUserData();

  // Count push subscriptions
  const { data: subs } = await db
    .from("push_subscriptions")
    .select("endpoint")
    .eq("user_id", user.id);
  const subscriptionCount = subs?.length ?? 0;

  // Count IELTS speaking vocab (source 2: speaking section)
  let ieltsWordCount = 0;
  let ieltsTopicCount = 0;
  try {
    const { data: vocabRows } = await db
      .from("ielts_topic_vocab")
      .select("topic_id,items");
    for (const row of vocabRows ?? []) {
      if (Array.isArray(row.items)) {
        ieltsTopicCount += 1;
        ieltsWordCount += (row.items as unknown[]).filter(
          (i) => typeof (i as { word?: string })?.word === "string",
        ).length;
      }
    }
  } catch (e) {
    console.error("vocab-status: ielts_topic_vocab", e);
  }

  // Count flashcard vocab (source 1: vocabulary/notes section)
  let flashcardWordCount = 0;
  try {
    const { data: cards } = await db
      .from("flashcard_cards")
      .select("id")
      .eq("user_id", user.id);
    flashcardWordCount = cards?.length ?? 0;
  } catch (e) {
    console.error("vocab-status: flashcard_cards", e);
  }

  return NextResponse.json({
    pushConfigured: isWebPushConfigured(),
    subscriptionCount,
    sources: {
      speaking: {
        label: "IELTS Speaking topics",
        topicCount: ieltsTopicCount,
        wordCount: ieltsWordCount,
      },
      vocab: {
        label: "Vocabulary notes (flashcards)",
        wordCount: flashcardWordCount,
      },
    },
    totalWords: ieltsWordCount + flashcardWordCount,
  });
}
