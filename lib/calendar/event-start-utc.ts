import { fromZonedTime } from "date-fns-tz";

/**
 * Calendar events store `date` + `start_time` as wall clock in this zone
 * (aligned with the app’s “CZ baseline” when saving timed events).
 */
export function getCalendarEventStorageTimeZone(): string {
  return (
    process.env.NEXT_PUBLIC_CALENDAR_EVENT_STORAGE_TIMEZONE?.trim() ||
    process.env.CALENDAR_EVENT_STORAGE_TIMEZONE?.trim() ||
    "Asia/Ho_Chi_Minh"
  );
}

/** Parses DB/API time strings like `19:00` or `19:00:00`. */
export function parseCalendarTimeHm(
  s: string | null | undefined,
): { hh: number; mm: number } | null {
  if (!s?.trim()) return null;
  const m = s.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return { hh, mm };
}

/** UTC instant for event start, or null if all-day / missing time. */
export function eventStartUtc(
  dateYmd: string,
  startTimeHm: string | null | undefined,
): Date | null {
  const ymd = String(dateYmd).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const parsed = parseCalendarTimeHm(startTimeHm);
  if (!parsed) return null;
  const wall = `${ymd} ${String(parsed.hh).padStart(2, "0")}:${String(parsed.mm).padStart(2, "0")}:00`;
  return fromZonedTime(wall, getCalendarEventStorageTimeZone());
}
