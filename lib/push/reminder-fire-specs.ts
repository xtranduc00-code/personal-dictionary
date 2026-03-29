/** Shared timing + copy for calendar and study-schedule web push reminders. */

export const REMINDER_WINDOW_MS = 90_000;
export const REMINDER_DATE_WINDOW_DAYS = 8;

const MS_MIN = 60_000;
const MS_HOUR = 60 * MS_MIN;
const MS_DAY = 24 * MS_HOUR;

export type ReminderFireSpec = {
  offsetMs: number;
  kind: string;
  title: string;
  /** `whenLocal` = date/time string in push display TZ (e.g. Czech, from CALENDAR_EVENT_STORAGE_TIMEZONE). */
  calendarBody: (eventTitle: string, whenLocal: string) => string;
  scheduleBody: (
    booker: string,
    column: string,
    whenLocal: string,
  ) => string;
};

/** Fire once when cron hits within REMINDER_WINDOW_MS of (start - offset). */
export const REMINDER_FIRE_SPECS: readonly ReminderFireSpec[] = [
  {
    offsetMs: MS_DAY,
    kind: "before_24h",
    title: "Lịch · 1 day left",
    calendarBody: (t, when) =>
      `${t} — ${when} · 1 day until start · còn 1 ngày`,
    scheduleBody: (booker, column, when) =>
      `${booker} (${column}) — ${when} · 1 day until start · còn 1 ngày`,
  },
  {
    offsetMs: MS_HOUR,
    kind: "before_1h",
    title: "Lịch · 1 hour left",
    calendarBody: (t, when) =>
      `${t} — ${when} · 1 hour until start · còn 1 giờ`,
    scheduleBody: (booker, column, when) =>
      `${booker} (${column}) — ${when} · 1 hour until start · còn 1 giờ`,
  },
  {
    offsetMs: 10 * MS_MIN,
    kind: "before_10",
    title: "Sắp đến giờ · Up soon",
    calendarBody: (t, when) => `${t} — ${when} · 10 minutes · 10 phút nữa`,
    scheduleBody: (booker, column, when) =>
      `${booker} (${column}) — ${when} · 10 minutes · 10 phút nữa`,
  },
];
