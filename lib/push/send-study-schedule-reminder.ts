import type { SupabaseClient } from "@supabase/supabase-js";
import { formatInTimeZone } from "date-fns-tz";
import {
  REMINDER_DATE_WINDOW_DAYS,
  REMINDER_FIRE_SPECS,
  REMINDER_WINDOW_MS,
} from "@/lib/push/reminder-fire-specs";
import { shouldDropPushSubscription } from "@/lib/push/should-drop-push-subscription";
import {
  formatPushStudySlotLabel,
  getPushNotificationTimeZone,
} from "@/lib/push/push-notification-time-label";
import {
  ensureWebPushConfigured,
  isWebPushConfigured,
  webpush,
} from "@/lib/push/web-push-config";
import {
  allVnTimeSlots,
  studyVnSlotStartUtc,
} from "@/lib/study-schedule/vn-slot-start-utc";

const ROW_ID = "global";

/** Only these column headers trigger study-grid web push; others stay silent. */
const STUDY_GRID_PUSH_COLUMNS = new Set(["Duy"]);

const DEFAULT_ACCOUNTS = [
  "Hồng 1",
  "Hồng 2",
  "Hồng 3",
  "Minh 1",
  "Minh 2",
];

/** Unit separator for dedupe slot_key (column names may contain other chars). */
const SK_SEP = "\u001f";

function loadVnDateWindow(): { from: string; to: string } {
  const tz = "Asia/Ho_Chi_Minh";
  const now = new Date();
  const fromD = new Date(now.getTime() - 86400000);
  const toD = new Date(
    now.getTime() + REMINDER_DATE_WINDOW_DAYS * 86400000,
  );
  return {
    from: formatInTimeZone(fromD, tz, "yyyy-MM-dd"),
    to: formatInTimeZone(toD, tz, "yyyy-MM-dd"),
  };
}

function parseAccounts(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...DEFAULT_ACCOUNTS];
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const s = x.trim().slice(0, 80) || "—";
    out.push(s);
    if (out.length >= 20) break;
  }
  return out.length > 0 ? out : [...DEFAULT_ACCOUNTS];
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseByDate(raw: unknown): Record<string, Record<string, unknown>> {
  if (!isPlainObject(raw)) return {};
  const out: Record<string, Record<string, unknown>> = {};
  for (const [k, day] of Object.entries(raw)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
    if (!isPlainObject(day)) continue;
    out[k] = day;
  }
  return out;
}

function cellText(
  dayRow: Record<string, unknown> | undefined,
  vnSlot: string,
  column: string,
): string {
  if (!dayRow) return "";
  const slot = dayRow[vnSlot];
  if (!isPlainObject(slot)) return "";
  const cell = slot[column];
  if (!isPlainObject(cell)) return "";
  const t = cell.text;
  return typeof t === "string" ? t.trim() : "";
}

async function tryLogSent(
  db: SupabaseClient,
  userId: string,
  kind: string,
  slotKey: string,
): Promise<boolean> {
  const { error } = await db.from("study_schedule_reminder_sent").insert({
    user_id: userId,
    kind,
    slot_key: slotKey,
  });
  if (error?.code === "23505") return false;
  if (error) throw error;
  return true;
}

async function removeDeadSubscription(db: SupabaseClient, endpoint: string) {
  await db.from("push_subscriptions").delete().eq("endpoint", endpoint);
}

export async function runStudyScheduleReminderSweep(
  db: SupabaseClient,
  siteUrl: string,
): Promise<{ checked: number; sent: number; errors: number }> {
  if (!isWebPushConfigured()) {
    return { checked: 0, sent: 0, errors: 0 };
  }
  ensureWebPushConfigured();

  const { data: row, error: rowErr } = await db
    .from("study_schedule_shared")
    .select("accounts,by_date")
    .eq("id", ROW_ID)
    .maybeSingle();
  if (rowErr) throw rowErr;

  const accounts = parseAccounts(row?.accounts);
  const byDate = parseByDate(row?.by_date);

  const { data: subs, error: subErr } = await db
    .from("push_subscriptions")
    .select("user_id,endpoint,p256dh,auth");
  if (subErr) throw subErr;
  const subsByUser = new Map<
    string,
    { endpoint: string; p256dh: string; auth: string }[]
  >();
  for (const s of subs ?? []) {
    const uid = s.user_id as string;
    if (!subsByUser.has(uid)) subsByUser.set(uid, []);
    subsByUser.get(uid)!.push({
      endpoint: s.endpoint as string,
      p256dh: s.p256dh as string,
      auth: s.auth as string,
    });
  }

  const { from, to } = loadVnDateWindow();
  const slots = allVnTimeSlots();
  const now = Date.now();
  let checked = 0;
  let sent = 0;
  let errors = 0;

  const baseUrl = siteUrl.replace(/\/$/, "");
  const pushTz = getPushNotificationTimeZone();

  for (const vnDateKey of Object.keys(byDate).sort()) {
    if (vnDateKey < from || vnDateKey > to) continue;
    const dayRow = byDate[vnDateKey];

    for (const vnSlot of slots) {
      const startUtc = studyVnSlotStartUtc(vnDateKey, vnSlot);
      if (!startUtc) continue;
      const startMs = startUtc.getTime();

      for (const column of accounts) {
        if (!STUDY_GRID_PUSH_COLUMNS.has(column.trim())) continue;
        const booker = cellText(dayRow, vnSlot, column);
        if (!booker) continue;

        const slotKey = `${vnDateKey}${SK_SEP}${vnSlot}${SK_SEP}${column}`;

        for (const spec of REMINDER_FIRE_SPECS) {
          const fireAt = startMs - spec.offsetMs;
          if (Math.abs(now - fireAt) > REMINDER_WINDOW_MS) continue;

          const whenLocal = formatPushStudySlotLabel(startUtc, pushTz);
          const body = spec.scheduleBody(booker, column, whenLocal);

          for (const [userId, userSubs] of subsByUser) {
            if (!userSubs.length) continue;
            checked += 1;
            const shouldSend = await tryLogSent(
              db,
              userId,
              spec.kind,
              slotKey,
            );
            if (!shouldSend) continue;

            const payload = JSON.stringify({
              title: spec.title,
              body,
              url: `${baseUrl}/study-schedule`,
              tag: `study-${spec.kind}-${slotKey.slice(0, 120)}`,
            });

            for (const sub of userSubs) {
              try {
                await webpush.sendNotification(
                  {
                    endpoint: sub.endpoint,
                    keys: { p256dh: sub.p256dh, auth: sub.auth },
                  },
                  payload,
                  { TTL: 3600, urgency: "high" },
                );
                sent += 1;
              } catch (e: unknown) {
                errors += 1;
                const wpe = e as { statusCode?: number; body?: string };
                const errBody =
                  typeof wpe.body === "string" ? wpe.body : undefined;
                if (shouldDropPushSubscription(wpe.statusCode, errBody)) {
                  await removeDeadSubscription(db, sub.endpoint);
                }
              }
            }
          }
        }
      }
    }
  }

  return { checked, sent, errors };
}
