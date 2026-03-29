import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import {
  getCalendarEventStorageTimeZone,
  parseCalendarTimeHm,
} from "@/lib/calendar/event-start-utc";

/** Vietnam wall clock when saving with “VN” in the calendar modal. */
export const CALENDAR_WALL_VIETNAM_TZ = "Asia/Ho_Chi_Minh";

/** Wall clock in `sourceIanaTz` → date + HH:mm in storage TZ (reminders use this). */
export function wallClockToStorageParts(
  dateYmd: string,
  timeHm: string,
  sourceIanaTz: string,
): { date: string; time: string } {
  const p = parseCalendarTimeHm(timeHm);
  if (!p) {
    return { date: dateYmd, time: "00:00" };
  }
  const wall = `${dateYmd} ${String(p.hh).padStart(2, "0")}:${String(p.mm).padStart(2, "0")}:00`;
  const utc = fromZonedTime(wall, sourceIanaTz);
  const storage = getCalendarEventStorageTimeZone();
  return {
    date: formatInTimeZone(utc, storage, "yyyy-MM-dd"),
    time: formatInTimeZone(utc, storage, "HH:mm"),
  };
}

/** Storage wall → same instant as date+time in `targetIanaTz` (for UI / timezone toggle). */
export function storageWallToWallClockParts(
  dateYmd: string,
  timeHm: string,
  targetIanaTz: string,
): { date: string; time: string } {
  const p = parseCalendarTimeHm(timeHm);
  if (!p) {
    return { date: dateYmd, time: "00:00" };
  }
  const storage = getCalendarEventStorageTimeZone();
  const wall = `${dateYmd} ${String(p.hh).padStart(2, "0")}:${String(p.mm).padStart(2, "0")}:00`;
  const utc = fromZonedTime(wall, storage);
  return {
    date: formatInTimeZone(utc, targetIanaTz, "yyyy-MM-dd"),
    time: formatInTimeZone(utc, targetIanaTz, "HH:mm"),
  };
}
