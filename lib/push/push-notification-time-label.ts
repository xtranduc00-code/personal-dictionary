import { addMinutes } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { getCalendarEventStorageTimeZone } from "@/lib/calendar/event-start-utc";

/** Same as calendar event wall clock: push bodies show this zone (default Asia/Ho_Chi_Minh). */
export function getPushNotificationTimeZone(): string {
  return getCalendarEventStorageTimeZone();
}

/** One line for a timed calendar event start (storage TZ). */
export function formatPushEventStartLabel(startUtc: Date, tz: string): string {
  return formatInTimeZone(startUtc, tz, "yyyy-MM-dd HH:mm");
}

/** Study grid: 30-minute interval from VN slot start, labeled in display TZ. */
export function formatPushStudySlotLabel(startUtc: Date, tz: string): string {
  const endUtc = addMinutes(startUtc, 30);
  const ds = formatInTimeZone(startUtc, tz, "yyyy-MM-dd");
  const de = formatInTimeZone(endUtc, tz, "yyyy-MM-dd");
  const ts = formatInTimeZone(startUtc, tz, "HH:mm");
  const te = formatInTimeZone(endUtc, tz, "HH:mm");
  if (ds === de) return `${ds} ${ts}–${te}`;
  return `${ds} ${ts} – ${de} ${te}`;
}
