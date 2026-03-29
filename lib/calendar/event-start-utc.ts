import { fromZonedTime } from "date-fns-tz";

/**
 * Calendar events store `date` + `start_time` as wall clock in this zone
 * (aligned with the app’s “CZ baseline” when saving timed events).
 */
export function getCalendarEventStorageTimeZone(): string {
  return (
    process.env.CALENDAR_EVENT_STORAGE_TIMEZONE?.trim() || "Europe/Prague"
  );
}

/** UTC instant for event start, or null if all-day / missing time. */
export function eventStartUtc(
  dateYmd: string,
  startTimeHm: string | null | undefined,
): Date | null {
  if (!startTimeHm || !/^\d{1,2}:\d{2}$/.test(startTimeHm)) return null;
  const [hh, mm] = startTimeHm.split(":").map(Number);
  const wall = `${dateYmd} ${String(hh ?? 0).padStart(2, "0")}:${String(mm ?? 0).padStart(2, "0")}:00`;
  return fromZonedTime(wall, getCalendarEventStorageTimeZone());
}
