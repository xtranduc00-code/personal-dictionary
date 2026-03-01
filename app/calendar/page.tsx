"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, } from "react";
import { authFetch, useAuth } from "@/lib/auth-context";
import { useI18n } from "@/components/i18n-provider";
import type { Locale, TranslationKey } from "@/lib/i18n";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, List, MapPin, Pencil, Plus, Trash2, X, } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
type EventColor = "blue" | "green" | "orange" | "red" | "purple" | "pink" | "teal" | "lime";
type CalendarEvent = {
    id: string;
    date: string;
    endDate?: string;
    title: string;
    startTime?: string;
    endTime?: string;
    note?: string;
    color: EventColor;
};
const COLOR_CLASSES: Record<EventColor, {
    dot: string;
    border: string;
    bar: string;
    barMuted: string;
}> = {
    blue: { dot: "bg-blue-600", border: "border-blue-500", bar: "bg-blue-600 border-l-[4px] border-blue-950/45 shadow-md ring-1 ring-black/10 dark:ring-white/10", barMuted: "bg-blue-600/88 border-l-[4px] border-blue-950/35 shadow-sm ring-1 ring-black/5" },
    green: { dot: "bg-green-600", border: "border-green-500", bar: "bg-green-600 border-l-[4px] border-green-950/45 shadow-md ring-1 ring-black/10 dark:ring-white/10", barMuted: "bg-green-600/88 border-l-[4px] border-green-950/35 shadow-sm ring-1 ring-black/5" },
    orange: { dot: "bg-orange-600", border: "border-orange-500", bar: "bg-orange-600 border-l-[4px] border-orange-950/45 shadow-md ring-1 ring-black/10 dark:ring-white/10", barMuted: "bg-orange-600/88 border-l-[4px] border-orange-950/35 shadow-sm ring-1 ring-black/5" },
    red: { dot: "bg-red-600", border: "border-red-500", bar: "bg-red-600 border-l-[4px] border-red-950/45 shadow-md ring-1 ring-black/10 dark:ring-white/10", barMuted: "bg-red-600/88 border-l-[4px] border-red-950/35 shadow-sm ring-1 ring-black/5" },
    purple: { dot: "bg-purple-600", border: "border-purple-500", bar: "bg-purple-600 border-l-[4px] border-purple-950/45 shadow-md ring-1 ring-black/10 dark:ring-white/10", barMuted: "bg-purple-600/88 border-l-[4px] border-purple-950/35 shadow-sm ring-1 ring-black/5" },
    pink: { dot: "bg-pink-600", border: "border-pink-500", bar: "bg-pink-600 border-l-[4px] border-pink-950/45 shadow-md ring-1 ring-black/10 dark:ring-white/10", barMuted: "bg-pink-600/88 border-l-[4px] border-pink-950/35 shadow-sm ring-1 ring-black/5" },
    teal: { dot: "bg-teal-600", border: "border-teal-500", bar: "bg-teal-600 border-l-[4px] border-teal-950/45 shadow-md ring-1 ring-black/10 dark:ring-white/10", barMuted: "bg-teal-600/88 border-l-[4px] border-teal-950/35 shadow-sm ring-1 ring-black/5" },
    lime: { dot: "bg-lime-600", border: "border-lime-500", bar: "bg-lime-600 border-l-[4px] border-lime-900/50 text-zinc-950 shadow-md ring-1 ring-black/15", barMuted: "bg-lime-600/90 text-zinc-950 border-l-[4px] shadow-sm ring-1 ring-black/10" },
};
const TIME_SLOT_MINUTES = 15;
function buildTimeOptions(): string[] {
    const out: string[] = [];
    for (let h = 0; h < 24; h++) {
        for (let m = 0; m < 60; m += TIME_SLOT_MINUTES) {
            out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
        }
    }
    return out;
}
const TIME_OPTIONS = buildTimeOptions();
function snapTimeToSlot(timeStr: string | undefined): string {
    if (!timeStr || !/^\d{1,2}:\d{2}$/.test(timeStr))
        return TIME_OPTIONS[0] ?? "00:00";
    const [hh, mm] = timeStr.split(":").map(Number);
    const mins = (hh ?? 0) * 60 + (mm ?? 0);
    const slot = TIME_SLOT_MINUTES;
    const snapped = Math.round(mins / slot) * slot;
    const maxM = 24 * 60 - slot;
    const capped = Math.min(Math.max(0, snapped), maxM);
    const h = Math.floor(capped / 60);
    const m = capped % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
const COLOR_OPTIONS: EventColor[] = [
    "blue", "green", "orange", "red", "purple", "pink", "teal", "lime",
];
function appLocaleToBcp47(locale: Locale): string {
    return locale === "vi" ? "vi-VN" : "en-US";
}
function weekdayShortLabels(bcp47: string): string[] {
    const sun = new Date(Date.UTC(2024, 0, 7));
    return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(sun);
        d.setUTCDate(7 + i);
        return d.toLocaleDateString(bcp47, { weekday: "short" });
    });
}
function monthShortLabels(bcp47: string): string[] {
    return Array.from({ length: 12 }, (_, m) =>
        new Date(Date.UTC(2024, m, 15)).toLocaleDateString(bcp47, { month: "short" }),
    );
}
function formatMonthLongYear(bcp47: string, year: number, monthIndex: number): string {
    return new Date(Date.UTC(year, monthIndex, 1)).toLocaleDateString(bcp47, {
        month: "long",
        year: "numeric",
    });
}
function toDateKey(year: number, month: number, day: number) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function todayKey() {
    const d = new Date();
    return toDateKey(d.getFullYear(), d.getMonth(), d.getDate());
}
type DayCell = {
    dateKey: string;
    day: number;
    month: number;
    year: number;
};
function generateCalendarWeeks(fromYear: number, fromMonth: number, numMonths: number): DayCell[][] {
    const firstOfRange = new Date(fromYear, fromMonth, 1);
    const lastOfRange = new Date(fromYear, fromMonth + numMonths, 0);
    const start = new Date(firstOfRange);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(lastOfRange);
    end.setDate(end.getDate() + (6 - end.getDay()));
    const weeks: DayCell[][] = [];
    const cur = new Date(start);
    while (cur <= end) {
        const week: DayCell[] = [];
        for (let i = 0; i < 7; i++) {
            week.push({
                dateKey: toDateKey(cur.getFullYear(), cur.getMonth(), cur.getDate()),
                day: cur.getDate(),
                month: cur.getMonth(),
                year: cur.getFullYear(),
            });
            cur.setDate(cur.getDate() + 1);
        }
        weeks.push(week);
    }
    return weeks;
}
function formatTime(timeStr: string) {
    const parts = timeStr.split(":");
    const h = Number(parts[0]) || 0;
    const m = Number(parts[1]) || 0;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function roundedNowTime(): string {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    if (m === 0)
        return `${String(h).padStart(2, "0")}:00`;
    if (m <= 30)
        return `${String(h).padStart(2, "0")}:30`;
    return `${String((h + 1) % 24).padStart(2, "0")}:00`;
}
function defaultStartFor(dateKey: string) {
    return `${dateKey}T${roundedNowTime()}`;
}
function defaultEndFor(startDatetime: string) {
    const [date, time] = startDatetime.split("T");
    const parts = (time ?? "00:00").split(":");
    const h = Number(parts[0]) || 0;
    const min = Number(parts[1]) || 0;
    return `${date}T${String((h + 1) % 24).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
function shiftHours(datetime: string, hours: number): string {
    const d = new Date(`${datetime}:00`);
    d.setHours(d.getHours() + hours);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    return `${date}T${time}`;
}
function timeZoneOptions(t: (key: TranslationKey) => string): {
    value: string;
    label: string;
    offsetFromCZ: number;
}[] {
    return [
        { value: "CZ", label: t("calendarTzNoConversion"), offsetFromCZ: 0 },
        { value: "VN", label: t("calendarTzVN"), offsetFromCZ: -6 },
    ];
}
function DateTimeRow({ value, onChange, min, dateLabel, timeLabel, }: {
    value: string;
    onChange: (v: string) => void;
    min?: string;
    dateLabel: string;
    timeLabel: string;
}) {
    const [date, timeRaw] = value.split("T");
    const time = snapTimeToSlot(timeRaw);
    const baseCls = "rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-blue-400";
    const lbl = "text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400";
    return (<div className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1 space-y-1">
        <div className={lbl}>{dateLabel}</div>
        <input type="date" value={date} min={min?.split("T")[0]} onChange={(e) => onChange(`${e.target.value}T${time}`)} className={`${baseCls} w-full min-w-0`}/>
      </div>
      <div className="w-[5.75rem] shrink-0 space-y-1">
        <div className={lbl}>{timeLabel}</div>
        <select value={time} onChange={(e) => onChange(`${date}T${e.target.value}`)} className={`${baseCls} w-full tabular-nums`} aria-label={timeLabel}>
          {TIME_OPTIONS.map((slot) => (<option key={slot} value={slot}>{slot}</option>))}
        </select>
      </div>
    </div>);
}
function EventModal({ initialDate, editEvent, onSave, onUpdate, onClose, }: {
    initialDate: string;
    editEvent?: CalendarEvent;
    onSave: (ev: Omit<CalendarEvent, "id">) => void;
    onUpdate: (ev: CalendarEvent) => void;
    onClose: () => void;
}) {
    const { t } = useI18n();
    const timezones = useMemo(() => timeZoneOptions(t), [t]);
    const isEdit = !!editEvent;
    const editAllDay = !!(editEvent && !editEvent.startTime && !editEvent.endTime);
    const [title, setTitle] = useState(() => editEvent?.title ?? "");
    const [allDay, setAllDay] = useState(editAllDay);
    const [startDay, setStartDay] = useState(() => editEvent?.date ?? initialDate);
    const [endDay, setEndDay] = useState(() => editEvent?.endDate ?? editEvent?.date ?? initialDate);
    const [start, setStart] = useState(() => editEvent && !editAllDay
        ? `${editEvent.date}T${snapTimeToSlot(editEvent.startTime)}`
        : defaultStartFor(initialDate));
    const [end, setEnd] = useState(() => {
        if (editEvent && !editAllDay) {
            const d = editEvent.endDate ?? editEvent.date;
            const t0 = snapTimeToSlot(editEvent.endTime ?? editEvent.startTime);
            return `${d}T${t0}`;
        }
        return defaultEndFor(defaultStartFor(initialDate));
    });
    const [note, setNote] = useState(() => editEvent?.note ?? "");
    const [color, setColor] = useState<EventColor>(() => editEvent?.color ?? "blue");
    const [timezone, setTimezone] = useState("CZ");
    const [errors, setErrors] = useState<{
        start?: string;
        end?: string;
    }>({});
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape")
                onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);
    const toMinutes = (dt: string) => {
        const d = new Date(`${dt}:00`);
        return isNaN(d.getTime()) ? 0 : d.getTime();
    };
    const nowMinutes = () => new Date().getTime();
    const validate = () => {
        const errs: {
            start?: string;
            end?: string;
        } = {};
        if (allDay) {
            if (endDay < startDay)
                errs.end = t("calendarValidationEnd");
        }
        else {
            if (!isEdit && toMinutes(start) < nowMinutes()) {
                errs.start = t("calendarValidationPast");
            }
            if (toMinutes(end) <= toMinutes(start)) {
                errs.end = t("calendarValidationEnd");
            }
        }
        setErrors(errs);
        return Object.keys(errs).length === 0;
    };
    const handleSave = (e?: FormEvent) => {
        e?.preventDefault();
        if (!title.trim())
            return;
        if (!validate())
            return;
        if (allDay) {
            const payload: Omit<CalendarEvent, "id"> = {
                date: startDay,
                endDate: endDay !== startDay ? endDay : undefined,
                title: title.trim(),
                note: note.trim() || undefined,
                color,
            };
            if (isEdit && editEvent) {
                onUpdate({
                    ...payload,
                    id: editEvent.id,
                    startTime: null as unknown as CalendarEvent["startTime"],
                    endTime: null as unknown as CalendarEvent["endTime"],
                } as CalendarEvent);
            }
            else {
                onSave(payload);
            }
            return;
        }
        const tz = timezones.find((x) => x.value === timezone)!;
        const adjStart = tz.offsetFromCZ !== 0 ? shiftHours(start, tz.offsetFromCZ) : start;
        const adjEnd = tz.offsetFromCZ !== 0 ? shiftHours(end, tz.offsetFromCZ) : end;
        const startDate = adjStart.split("T")[0];
        const endDateVal = adjEnd.split("T")[0];
        const payload = {
            date: startDate,
            endDate: endDateVal !== startDate ? endDateVal : undefined,
            title: title.trim(),
            startTime: adjStart.split("T")[1],
            endTime: adjEnd.split("T")[1],
            note: note.trim() || undefined,
            color,
        };
        if (isEdit && editEvent) {
            onUpdate({ ...payload, id: editEvent.id });
        }
        else {
            onSave(payload);
        }
    };
    const toggleAllDay = (next: boolean) => {
        setAllDay(next);
        setErrors({});
        if (next) {
            const sd = start.split("T")[0] ?? startDay;
            const ed = end.split("T")[0] ?? endDay;
            setStartDay(sd);
            setEndDay(ed < sd ? sd : ed);
        }
        else {
            const ds = defaultStartFor(startDay);
            setStart(ds);
            setEnd(defaultEndFor(ds));
        }
    };
    const inputCls = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-blue-400 dark:focus:ring-blue-900/30";
    const errorCls = "mt-1 text-xs text-red-500";
    const dateOnlyCls = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100";
    return (<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose} role="presentation">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-700">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{isEdit ? t("calendarModalEditTitle") : t("calendarModalAddTitle")}</h2>
          <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200">
            <X className="h-4 w-4"/>
          </button>
        </div>

        <form className="space-y-3 px-5 py-4" onSubmit={handleSave}>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{t("calendarEventName")}</label>
            <input type="text" placeholder={t("calendarTitlePlaceholder")} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus className={inputCls}/>
          </div>

          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800/80">
            <input type="checkbox" checked={allDay} onChange={(e) => toggleAllDay(e.target.checked)} className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"/>
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{t("calendarAllDay")}</span>
          </label>

          {allDay ? (<>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{t("calendarLabelStartDate")}</label>
                  <input type="date" value={startDay} onChange={(e) => {
                setStartDay(e.target.value);
                setErrors((er) => ({ ...er, end: undefined }));
            }} className={dateOnlyCls}/>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{t("calendarLabelEndDate")}</label>
                  <input type="date" value={endDay} min={startDay} onChange={(e) => {
                setEndDay(e.target.value);
                setErrors((er) => ({ ...er, end: undefined }));
            }} className={dateOnlyCls}/>
                </div>
              </div>
              {errors.end && <p className={errorCls}>{errors.end}</p>}
            </>) : (<>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{t("calendarLabelStart")}</label>
                <DateTimeRow dateLabel={t("calendarFieldDate")} timeLabel={t("calendarFieldTime")} value={start} onChange={(v) => {
                setStart(v);
                if (v >= end)
                    setEnd(defaultEndFor(v));
                setErrors((e) => ({ ...e, start: undefined }));
            }}/>
                {errors.start && <p className={errorCls}>{errors.start}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{t("calendarLabelEnd")}</label>
                <DateTimeRow dateLabel={t("calendarFieldDate")} timeLabel={t("calendarFieldTime")} value={end} min={start} onChange={(v) => {
                setEnd(v);
                setErrors((e) => ({ ...e, end: undefined }));
            }}/>
                {errors.end && <p className={errorCls}>{errors.end}</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{t("calendarTzLabel")}</label>
                <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={inputCls}>
                  {timezones.map((tz) => (<option key={tz.value} value={tz.value}>{tz.label}</option>))}
                </select>
                {timezone !== "CZ" && (<p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                    {t("calendarTzHint").replace("{offset}", String(timezones.find((x) => x.value === timezone)!.offsetFromCZ))}
                  </p>)}
              </div>
            </>)}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{t("calendarNotesLabel")} <span className="font-normal text-zinc-400">{t("calendarNotesOptional")}</span></label>
            <textarea placeholder={t("calendarNotesPlaceholder")} value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={`${inputCls} resize-none`}/>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{t("calendarColorLabel")}</label>
            <div className="flex flex-wrap gap-2">
              {COLOR_OPTIONS.map((c) => (<button key={c} type="button" onClick={() => setColor(c)} className={["h-7 w-7 rounded-full transition-transform", COLOR_CLASSES[c].dot, color === c ? "scale-110 ring-2 ring-offset-2 ring-zinc-500 dark:ring-zinc-300 dark:ring-offset-zinc-900" : "opacity-80 hover:opacity-100 hover:scale-105"].join(" ")}/>))}
            </div>
          </div>

          <div className="flex gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-700">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-zinc-300 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 active:scale-[0.99] dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800">{t("calendarCancel")}</button>
            <button type="submit" disabled={!title.trim()} className="flex-[1.15] rounded-xl bg-blue-700 py-3 text-sm font-bold text-white shadow-lg shadow-blue-700/35 transition hover:bg-blue-800 hover:shadow-xl hover:shadow-blue-800/30 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:font-semibold disabled:text-zinc-500 disabled:shadow-none dark:disabled:bg-zinc-600 dark:disabled:text-zinc-400">{t("calendarSave")}</button>
          </div>
        </form>
      </div>
    </div>);
}
function nextDay(dateKey: string): string {
    const d = new Date(dateKey + "T12:00:00");
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function formatEventRange(ev: CalendarEvent, bcp47: string): string {
    const fmt = (dk: string) => new Date(dk + "T12:00:00").toLocaleDateString(bcp47, {
        month: "long", day: "numeric", year: "numeric",
    });
    const startStr = fmt(ev.date);
    const evEndDate = ev.endDate ?? ev.date;
    const isSameDay = ev.date === evEndDate;
    if (!ev.startTime) {
        return isSameDay ? startStr : `${startStr} – ${fmt(evEndDate)}`;
    }
    if (isSameDay) {
        if (ev.endTime)
            return `${startStr} ${formatTime(ev.startTime)} – ${formatTime(ev.endTime)}`;
        return `${startStr} · ${formatTime(ev.startTime)}`;
    }
    const endDateStr = fmt(evEndDate);
    const endTimeStr = ev.endTime ? ` ${formatTime(ev.endTime)}` : "";
    return `${startStr} ${formatTime(ev.startTime)} – ${endDateStr}${endTimeStr}`;
}
type EventStatus = "ended" | "today" | "upcoming";
function getEventStatus(ev: CalendarEvent): EventStatus {
    const today = todayKey();
    const evEnd = ev.endDate ?? ev.date;
    if (evEnd < today)
        return "ended";
    if (ev.date > today)
        return "upcoming";
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    if (ev.date === today && ev.startTime) {
        const [sh, sm] = ev.startTime.split(":").map(Number);
        const startMins = (sh ?? 0) * 60 + (sm ?? 0);
        if (nowMins < startMins)
            return "upcoming";
    }
    if (evEnd === today && ev.endTime) {
        const [eh, em] = ev.endTime.split(":").map(Number);
        const endMins = (eh ?? 0) * 60 + (em ?? 0);
        if (nowMins >= endMins)
            return "ended";
    }
    return "today";
}
const STATUS_BADGE: Record<EventStatus, string> = {
    ended: "bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400",
    today: "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300",
    upcoming: "bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-300",
};
function eventStatusLabel(t: (key: TranslationKey) => string, status: EventStatus): string {
    switch (status) {
        case "ended":
            return t("calendarStatusEnded");
        case "today":
            return t("calendarStatusInProgress");
        case "upcoming":
            return t("calendarStatusUpcoming");
    }
}
function weekBoundsFromToday(todayK: string): {
    weekStart: string;
    weekEnd: string;
} {
    const d = new Date(todayK + "T12:00:00");
    const day = d.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(d);
    monday.setDate(d.getDate() + mondayOffset);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
        weekStart: toDateKey(monday.getFullYear(), monday.getMonth(), monday.getDate()),
        weekEnd: toDateKey(sunday.getFullYear(), sunday.getMonth(), sunday.getDate()),
    };
}
function listTouchesToday(ev: CalendarEvent, todayK: string): boolean {
    const end = ev.endDate ?? ev.date;
    return ev.date <= todayK && end >= todayK;
}
type ModalListGroup = "today" | "thisWeek" | "upcoming" | "past";
function groupEventForModalList(ev: CalendarEvent, todayK: string): ModalListGroup {
    const st = getEventStatus(ev);
    if (st === "ended")
        return "past";
    if (listTouchesToday(ev, todayK))
        return "today";
    const { weekStart, weekEnd } = weekBoundsFromToday(todayK);
    if (ev.date >= weekStart && ev.date <= weekEnd)
        return "thisWeek";
    return "upcoming";
}
const MODAL_GROUP_ORDER: ModalListGroup[] = ["today", "thisWeek", "upcoming", "past"];
function AllEventsModal({ events, onDelete, onEdit, onDayClick, onClose, }: {
    events: CalendarEvent[];
    onDelete: (id: string) => void;
    onEdit: (ev: CalendarEvent) => void;
    onDayClick: (date: string) => void;
    onClose: () => void;
}) {
    const { t, locale } = useI18n();
    const bcp47 = appLocaleToBcp47(locale);
    const todayK = todayKey();
    const [query, setQuery] = useState("");
    const [colorFilter, setColorFilter] = useState<EventColor | "all">("all");
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape")
                onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);
    const filtered = useMemo(() => {
        const q = query.toLowerCase().trim();
        const dateMatch = /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : null;
        return [...events]
            .filter((ev) => {
            if (colorFilter !== "all" && ev.color !== colorFilter)
                return false;
            if (!q)
                return true;
            if (dateMatch && (ev.date === dateMatch || (ev.endDate && ev.endDate >= dateMatch && ev.date <= dateMatch)))
                return true;
            return ev.title.toLowerCase().includes(q) || (ev.note ?? "").toLowerCase().includes(q) || ev.date.includes(q) || (ev.endDate ?? "").includes(q);
        })
            .sort((a, b) => {
            const d = a.date.localeCompare(b.date);
            return d !== 0 ? d : (a.startTime ?? "").localeCompare(b.startTime ?? "");
        });
    }, [events, query, colorFilter]);
    const grouped = useMemo(() => {
        const buckets: Record<ModalListGroup, CalendarEvent[]> = {
            today: [],
            thisWeek: [],
            upcoming: [],
            past: [],
        };
        for (const ev of filtered) {
            buckets[groupEventForModalList(ev, todayK)].push(ev);
        }
        return buckets;
    }, [filtered, todayK]);
    const groupTitle = (g: ModalListGroup) => {
        switch (g) {
            case "today":
                return t("calendarGroupToday");
            case "thisWeek":
                return t("calendarGroupThisWeek");
            case "upcoming":
                return t("calendarGroupUpcomingLater");
            case "past":
                return t("calendarGroupPast");
        }
    };
    const hasAny = filtered.length > 0;
    return (<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose} role="presentation">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-700">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{t("calendarAllSavedEventsTitle")}</h2>
          <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X className="h-4 w-4"/>
          </button>
        </div>

        <div className="space-y-2 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <input type="text" placeholder={t("calendarSearchPlaceholder")} value={query} onChange={(e) => setQuery(e.target.value)} className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100" autoFocus/>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">{t("calendarFilterColor")}</span>
            <button type="button" onClick={() => setColorFilter("all")} className={["rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 transition", colorFilter === "all" ? "bg-blue-600 text-white ring-blue-600" : "bg-zinc-100 text-zinc-600 ring-zinc-200 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-600"].join(" ")}>
              {t("calendarAllColors")}
            </button>
            {COLOR_OPTIONS.map((c) => (<button key={c} type="button" onClick={() => setColorFilter(c)} className={["h-6 w-6 rounded-full ring-2 ring-offset-1 transition dark:ring-offset-zinc-900", COLOR_CLASSES[c].dot, colorFilter === c ? "ring-zinc-900 dark:ring-zinc-100" : "ring-transparent opacity-80 hover:opacity-100"].join(" ")}/>))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {!hasAny ? (<p className="py-12 text-center text-sm text-zinc-400">
              {query || colorFilter !== "all" ? t("calendarSearchNoResults") : t("calendarSearchEmpty")}
            </p>) : (<div className="pb-2">
              {MODAL_GROUP_ORDER.map((g) => {
                const list = grouped[g];
                if (list.length === 0)
                    return null;
                return (<div key={g}>
                    <div className="sticky top-0 z-[1] border-b border-zinc-200 bg-white/95 px-4 py-2.5 text-sm font-bold text-zinc-800 backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-100">
                      {groupTitle(g)}
                    </div>
                    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {list.map((ev) => {
                        const status = getEventStatus(ev);
                        return (<li key={ev.id} className={`group flex gap-3 border-l-[5px] py-3.5 pl-3 pr-4 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60 ${COLOR_CLASSES[ev.color].border}`}>
                            <button type="button" onClick={() => { onDayClick(ev.date); onClose(); }} className="min-w-0 flex-1 text-left">
                              <div className="flex flex-wrap items-start gap-2">
                                <span className="text-[15px] font-bold leading-snug text-zinc-900 dark:text-zinc-50">{ev.title}</span>
                                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_BADGE[status]}`}>
                                  {eventStatusLabel(t, status)}
                                </span>
                              </div>
                              <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                                {formatEventRange(ev, bcp47)}
                              </p>
                              {ev.note && (<p className="mt-2 line-clamp-2 text-xs text-zinc-400 dark:text-zinc-500">{ev.note}</p>)}
                            </button>
                            <div className="flex shrink-0 items-start gap-1 pt-0.5 opacity-60 transition group-hover:opacity-100">
                              <button type="button" onClick={() => { onEdit(ev); onClose(); }} className="rounded-md p-1 text-zinc-400 hover:bg-zinc-200 hover:text-blue-600 dark:hover:bg-zinc-700 dark:hover:text-blue-400" aria-label="Edit">
                                <Pencil className="h-3.5 w-3.5"/>
                              </button>
                              <button type="button" onClick={() => onDelete(ev.id)} className="rounded-md p-1 text-zinc-400 hover:bg-zinc-200 hover:text-red-600 dark:hover:bg-zinc-700 dark:hover:text-red-400" aria-label="Delete">
                                <Trash2 className="h-3.5 w-3.5"/>
                              </button>
                            </div>
                          </li>);
                    })}
                    </ul>
                  </div>);
            })}
            </div>)}
        </div>
      </div>
    </div>);
}
export default function CalendarPage() {
    const { t, locale } = useI18n();
    const bcp47 = useMemo(() => appLocaleToBcp47(locale), [locale]);
    const weekdays = useMemo(() => weekdayShortLabels(bcp47), [bcp47]);
    const monthsShort = useMemo(() => monthShortLabels(bcp47), [bcp47]);
    const { user, isLoading: authLoading } = useAuth();
    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth());
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [selectedDate, setSelectedDate] = useState<string | null>(() => todayKey());
    const [showEventModal, setShowEventModal] = useState(false);
    const [showAllEvents, setShowAllEvents] = useState(false);
    const [addModalDate, setAddModalDate] = useState(todayKey());
    const [editingEvent, setEditingEvent] = useState<CalendarEvent | undefined>(undefined);
    const [loading, setLoading] = useState(true);
    const [previewDateKey, setPreviewDateKey] = useState<string | null>(null);
    const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);
    const [pulseDateKey, setPulseDateKey] = useState<string | null>(null);
    const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [quickAddDate, setQuickAddDate] = useState<string | null>(null);
    const [quickTitle, setQuickTitle] = useState("");
    const scrollRef = useRef<HTMLDivElement>(null);
    const calStart = useMemo(() => {
        const d = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        return { year: d.getFullYear(), month: d.getMonth() };
    }, []);
    const allWeeks = useMemo(() => generateCalendarWeeks(calStart.year, calStart.month, 24), [calStart]);
    const fetchEvents = useCallback(() => {
        authFetch("/api/calendar")
            .then((r) => (r.ok ? r.json() : []))
            .then((data) => {
            if (Array.isArray(data))
                setEvents(data);
            else
                setEvents([]);
        })
            .catch(() => setEvents([]))
            .finally(() => setLoading(false));
    }, []);
    useEffect(() => {
        if (authLoading)
            return;
        if (!user) {
            setEvents([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        setEvents([]);
        fetchEvents();
    }, [user?.id, authLoading, fetchEvents]);
    /** Không dùng window "focus" — trong dev nó bắn rất dày (DevTools, click lại trang…) → spam GET /api/calendar. */
    const CALENDAR_POLL_MS = 60_000;
    useEffect(() => {
        if (!user?.id)
            return;
        const interval = setInterval(fetchEvents, CALENDAR_POLL_MS);
        let visDebounce: ReturnType<typeof setTimeout> | null = null;
        const onVisibility = () => {
            if (typeof document === "undefined" || document.visibilityState !== "visible")
                return;
            if (visDebounce)
                clearTimeout(visDebounce);
            visDebounce = setTimeout(() => {
                visDebounce = null;
                fetchEvents();
            }, 400);
        };
        document.addEventListener("visibilitychange", onVisibility);
        return () => {
            clearInterval(interval);
            if (visDebounce)
                clearTimeout(visDebounce);
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, [fetchEvents, user?.id]);
    const scrollToDateKey = useCallback((dk: string, behavior: ScrollBehavior = "smooth") => {
        const el = scrollRef.current?.querySelector(`[data-date="${dk}"]`);
        if (el)
            el.scrollIntoView({ behavior, block: "center" });
    }, []);
    /** Sau khi lưới lịch thật mount (hết loading), luôn cuộn + chọn đúng hôm nay — tránh scroll lúc skeleton không có data-date. */
    useEffect(() => {
        if (authLoading || loading)
            return;
        const dk = todayKey();
        const d = new Date();
        setSelectedDate(dk);
        setYear(d.getFullYear());
        setMonth(d.getMonth());
        const snap = () => scrollToDateKey(dk, "auto");
        snap();
        const t0 = window.setTimeout(snap, 0);
        const t1 = window.setTimeout(snap, 80);
        const t2 = window.setTimeout(snap, 250);
        return () => {
            clearTimeout(t0);
            clearTimeout(t1);
            clearTimeout(t2);
        };
    }, [authLoading, loading, scrollToDateKey]);
    const eventsByDate = useMemo(() => {
        const map: Record<string, CalendarEvent[]> = {};
        for (const ev of events) {
            const evEnd = ev.endDate ?? ev.date;
            let cur = ev.date;
            let guard = 0;
            while (cur <= evEnd && guard < 366) {
                if (!map[cur])
                    map[cur] = [];
                map[cur].push(ev);
                const [y, m, d] = cur.split("-").map(Number);
                const next = new Date(y, m - 1, d + 1);
                cur = toDateKey(next.getFullYear(), next.getMonth(), next.getDate());
                guard++;
            }
        }
        return map;
    }, [events]);
    const goToToday = () => {
        const t = todayKey();
        setSelectedDate(t);
        setYear(now.getFullYear());
        setMonth(now.getMonth());
        scrollToDateKey(t);
    };
    const openDay = useCallback((dateKey: string) => {
        setSelectedDate(dateKey);
        const [y, m] = dateKey.split("-").map(Number);
        setYear(y);
        setMonth(m - 1);
        scrollToDateKey(dateKey);
    }, [scrollToDateKey]);
    const triggerDayPulse = useCallback((dk: string) => {
        setPulseDateKey(dk);
        if (pulseTimerRef.current)
            clearTimeout(pulseTimerRef.current);
        pulseTimerRef.current = setTimeout(() => {
            setPulseDateKey(null);
            pulseTimerRef.current = null;
        }, 420);
    }, []);
    useEffect(() => () => {
        if (pulseTimerRef.current)
            clearTimeout(pulseTimerRef.current);
    }, []);
    const handleCalendarDayClick = useCallback((dk: string) => {
        openDay(dk);
        triggerDayPulse(dk);
    }, [openDay, triggerDayPulse]);
    const openAddModal = (dateKey: string) => {
        setEditingEvent(undefined);
        setAddModalDate(dateKey);
        setShowEventModal(true);
    };
    const openEditModal = (ev: CalendarEvent) => {
        setEditingEvent(ev);
        setAddModalDate(ev.date);
        setShowEventModal(true);
    };
    const notify = (msg: string) => toast.success(msg, { containerId: "cal", position: "top-center" });
    const saveEvent = async (ev: Omit<CalendarEvent, "id">) => {
        setShowEventModal(false);
        try {
            const res = await authFetch("/api/calendar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(ev),
            });
            const created: CalendarEvent = await res.json();
            setEvents(prev => [...prev, created]);
            openDay(created.date);
            notify(t("calendarToastAdded").replace("{title}", created.title));
        }
        catch {
            toast.error(t("calendarErrorSave"), { containerId: "cal", position: "top-center" });
        }
    };
    const updateEvent = async (ev: CalendarEvent) => {
        setShowEventModal(false);
        try {
            const res = await authFetch(`/api/calendar/${ev.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(ev),
            });
            const updated: CalendarEvent = await res.json();
            setEvents(prev => prev.map(e => e.id === updated.id ? updated : e));
            openDay(updated.date);
            notify(t("calendarToastUpdated").replace("{title}", updated.title));
        }
        catch {
            toast.error(t("calendarErrorUpdate"), { containerId: "cal", position: "top-center" });
        }
    };
    const deleteEvent = async (id: string) => {
        const ev = events.find(e => e.id === id);
        setEvents(prev => prev.filter(e => e.id !== id));
        try {
            await authFetch(`/api/calendar/${id}`, { method: "DELETE" });
            if (ev)
                notify(t("calendarToastDeleted").replace("{title}", ev.title));
        }
        catch {
            if (ev)
                setEvents(prev => [...prev, ev]);
            toast.error(t("calendarErrorDelete"), { containerId: "cal", position: "top-center" });
        }
    };
    useEffect(() => {
        if (!quickAddDate)
            return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setQuickAddDate(null);
                setQuickTitle("");
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [quickAddDate]);
    const saveQuickEvent = async () => {
        const title = quickTitle.trim();
        const dateKey = quickAddDate;
        if (!title || !dateKey)
            return;
        setQuickAddDate(null);
        setQuickTitle("");
        try {
            const res = await authFetch("/api/calendar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title,
                    date: dateKey,
                    color: "blue",
                }),
            });
            const created: CalendarEvent = await res.json();
            setEvents(prev => [...prev, created]);
            openDay(created.date);
            notify(t("calendarToastAdded").replace("{title}", created.title));
        }
        catch {
            toast.error(t("calendarErrorSave"), { containerId: "cal", position: "top-center" });
        }
    };
    const today = todayKey();
    const selectedEvents = selectedDate ? (eventsByDate[selectedDate] ?? []) : [];
    if (authLoading || loading) {
        return (<div className="mx-auto max-w-[1400px] space-y-4 px-4 py-6">
          <div className="h-12 animate-pulse rounded-2xl bg-zinc-200/80 dark:bg-zinc-800"/>
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <div className="grid grid-cols-7 border-b border-zinc-100 dark:border-zinc-800">
                {Array.from({ length: 7 }, (_, i) => (<div key={i} className="py-2"><div className="mx-auto h-3 w-8 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700"/></div>))}
              </div>
              <div className="grid grid-cols-7 gap-px bg-zinc-200 p-px dark:bg-zinc-700">
                {Array.from({ length: 35 }, (_, i) => (<div key={i} className="min-h-[88px] animate-pulse bg-zinc-50 dark:bg-zinc-900/80"/>))}
              </div>
            </div>
            <div className="space-y-4">
              <div className="h-48 animate-pulse rounded-2xl bg-zinc-200/80 dark:bg-zinc-800"/>
              <div className="h-64 animate-pulse rounded-2xl bg-zinc-200/80 dark:bg-zinc-800"/>
            </div>
          </div>
        </div>);
    }
    return (<div className="mx-auto max-w-[1400px] space-y-4 px-4 py-6">
      
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        
        <div className="flex flex-wrap items-center gap-2">
          
          <div className="relative">
            <select value={month} onChange={(e) => {
            const m = Number(e.target.value);
            setMonth(m);
            scrollToDateKey(`${year}-${String(m + 1).padStart(2, "0")}-01`);
        }} className="h-9 appearance-none rounded-lg border border-zinc-200 bg-zinc-50 pl-3 pr-7 text-sm font-medium text-zinc-800 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100">
              {monthsShort.map((m, i) => (<option key={i} value={i}>{m}</option>))}
            </select>
            <ChevronRight className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rotate-90 text-zinc-400"/>
          </div>

          
          <button type="button" onClick={goToToday} className="h-9 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700">
            {t("calendarToday")}
          </button>

          
          <button type="button" onClick={() => openAddModal(selectedDate ?? todayKey())} className="flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700">
            <Plus className="h-4 w-4"/>
            {t("calendarAddEvent")}
          </button>

          
          <button type="button" onClick={() => setShowAllEvents(true)} className="flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700">
            <List className="h-4 w-4"/>
            {t("calendarAllEvents")}
          </button>
        </div>

        
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => {
            const y = year - 1;
            setYear(y);
            scrollToDateKey(`${y}-${String(month + 1).padStart(2, "0")}-01`);
        }} className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700">
            <ChevronLeft className="h-4 w-4"/>
          </button>
          <span className="min-w-[3rem] text-center text-sm font-semibold text-zinc-900 dark:text-zinc-100">{year}</span>
          <button type="button" onClick={() => {
            const y = year + 1;
            setYear(y);
            scrollToDateKey(`${y}-${String(month + 1).padStart(2, "0")}-01`);
        }} className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700">
            <ChevronRight className="h-4 w-4"/>
          </button>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
        
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          
          <div className="sticky top-0 z-10 grid grid-cols-7 border-b border-zinc-300 bg-zinc-50/80 dark:border-zinc-600 dark:bg-zinc-900">
            {weekdays.map((d) => (<div key={d} className="py-2 text-center text-xs font-semibold text-zinc-500 dark:text-zinc-400">{d}</div>))}
          </div>

          
          <div ref={scrollRef} className="max-h-[calc(100vh-13rem)] overflow-y-auto">
            <div className="grid grid-cols-7">
              {allWeeks.map((week) => week.map((cell, ci) => {
            const { dateKey, day, month: cm, year: cy } = cell;
            const dayEvents = eventsByDate[dateKey] ?? [];
            const isToday = dateKey === today;
            const isSelected = dateKey === selectedDate;
            const isPast = dateKey < today;
            const isLastCol = ci === 6;
            const visible = dayEvents.slice(0, 3);
            const overflow = dayEvents.length - visible.length;
            const isMonthStart = day === 1;
            const isPreviewed = previewDateKey === dateKey;
            const pillTone = (c: EventColor, faded: boolean) => {
                const cls = COLOR_CLASSES[c];
                const base = faded ? cls.barMuted : cls.bar;
                const txt = c === "lime" ? "text-zinc-950" : "text-white";
                return `${base} ${txt}`;
            };
            return (<div key={dateKey} data-date={dateKey} role="button" tabIndex={0} onClick={() => handleCalendarDayClick(dateKey)} onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleCalendarDayClick(dateKey);
                    }
                }} onDoubleClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openAddModal(dateKey);
                }} className={[
                    "group relative flex min-h-[96px] cursor-pointer flex-col gap-0 text-left outline-none transition-[background-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-900 active:bg-blue-100/50 dark:active:bg-blue-950/40",
                    "border-b border-r border-zinc-300 dark:border-zinc-600",
                    isLastCol ? "border-r-0" : "",
                    isToday ? "z-[1] bg-blue-100/95 shadow-inner ring-2 ring-inset ring-blue-500/85 hover:bg-blue-200/90 dark:bg-blue-950/45 dark:ring-blue-400/75 dark:hover:bg-blue-900/50" : "",
                    pulseDateKey === dateKey ? "z-[2] ring-2 ring-blue-600 ring-offset-2 ring-offset-white dark:ring-offset-zinc-900" : "",
                    isPreviewed && pulseDateKey !== dateKey ? "ring-2 ring-inset ring-blue-400/55 dark:ring-blue-500/40" : "",
                    isPast && !isToday
                        ? "bg-zinc-50/90 hover:bg-zinc-100 dark:bg-zinc-900/75 dark:hover:bg-zinc-800/85"
                        : isSelected && !isToday
                            ? "bg-blue-50/95 ring-1 ring-inset ring-blue-300/70 dark:bg-blue-950/35 dark:ring-blue-700/50"
                            : !isToday
                                ? "hover:bg-sky-50/90 hover:ring-1 hover:ring-inset hover:ring-sky-200/80 dark:hover:bg-zinc-800/75 dark:hover:ring-zinc-500/40"
                                : "",
                ].filter(Boolean).join(" ")}>
                      <button type="button" className="absolute right-1 top-1 z-[1] flex h-6 w-6 items-center justify-center rounded-md border border-zinc-200/80 bg-white/95 text-zinc-500 opacity-0 shadow-sm transition hover:border-blue-300 hover:text-blue-600 group-hover:opacity-100 dark:border-zinc-600 dark:bg-zinc-800/95 dark:text-zinc-400 dark:hover:border-blue-500" aria-label={t("calendarQuickAddTitle")} onClick={(e) => {
                    e.stopPropagation();
                    setQuickAddDate(dateKey);
                    setQuickTitle("");
                }}>
                        <Plus className="h-3.5 w-3.5"/>
                      </button>

                      <div className="px-2 pt-2 pb-0.5">
                        <span className={[
                    "flex items-center justify-center rounded-full text-sm font-semibold tabular-nums",
                    isToday
                        ? "h-8 w-8 bg-blue-600 text-white shadow-md shadow-blue-600/25 ring-2 ring-blue-400/80 ring-offset-2 ring-offset-white dark:ring-offset-zinc-900"
                        : isPast
                            ? "h-7 w-7 text-zinc-400 dark:text-zinc-600"
                            : isSelected
                                ? "h-7 w-7 bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200"
                                : "h-7 w-7 text-zinc-800 group-hover:bg-zinc-200/80 dark:text-zinc-200 dark:group-hover:bg-zinc-700/70",
                ].join(" ")}>{day}</span>
                        {isMonthStart && (<span className="mt-0.5 block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                            {formatMonthLongYear(bcp47, cy, cm)}
                          </span>)}
                      </div>

                      <div className="flex w-full flex-col gap-0.5 pb-1" onMouseLeave={() => setHoveredEventId(null)}>
                        {visible.map((ev) => {
                    const evEnd = ev.endDate ?? ev.date;
                    const isStart = ev.date === dateKey;
                    const isEnd = evEnd === dateKey;
                    const isMultiDay = ev.date !== evEnd;
                    const faded = isPast;
                    if (!isMultiDay) {
                        return (<div key={ev.id} role="presentation" onMouseEnter={() => setHoveredEventId(ev.id)} className={`mx-2 flex cursor-default items-center gap-0.5 truncate rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-5 ${pillTone(ev.color, faded)}`}>
                                <MapPin className="h-2.5 w-2.5 shrink-0 opacity-90" aria-hidden/>
                                <span className="truncate">{ev.title}</span>
                              </div>);
                    }
                    return (<div key={ev.id} role="presentation" onMouseEnter={() => setHoveredEventId(ev.id)} className={`flex cursor-default items-center gap-0.5 truncate text-[11px] font-semibold leading-5 ${pillTone(ev.color, faded)}`} style={{
                            marginLeft: isStart ? "8px" : "0",
                            marginRight: isEnd ? "8px" : "0",
                            paddingLeft: "6px",
                            borderRadius: `${isStart ? "6px" : "0"} ${isEnd ? "6px" : "0"} ${isEnd ? "6px" : "0"} ${isStart ? "6px" : "0"}`,
                        }}>
                              {isStart ? (<>
                                  <MapPin className="h-2.5 w-2.5 shrink-0 opacity-90" aria-hidden/>
                                  <span className="truncate">{ev.title}</span>
                                </>) : "\u00A0"}
                            </div>);
                })}
                        {overflow > 0 && (<span className="px-2 text-[10px] font-medium text-zinc-500 dark:text-zinc-400">{t("calendarEventsMore").replace("{n}", String(overflow))}</span>)}
                      </div>
                    </div>);
        }))}
            </div>
          </div>
        </div>

        
        <div className="sticky top-4 flex max-h-[calc(100vh-6rem)] flex-col gap-4 overflow-y-auto pb-2 pr-0.5">
          {selectedDate ? (<div className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
                <div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {new Date(selectedDate + "T12:00:00").toLocaleDateString(bcp47, { weekday: "long", month: "long", day: "numeric" })}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {selectedEvents.length === 1
                        ? t("calendarEventCountOne")
                        : t("calendarEventCountMany").replace("{n}", String(selectedEvents.length))}
                  </p>
                </div>
                <button type="button" onClick={() => setSelectedDate(null)} className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200">
                  <X className="h-4 w-4"/>
                </button>
              </div>

              <div className="space-y-2 p-4">
                {selectedEvents.length === 0 && (<p className="py-4 text-center text-sm text-zinc-400 dark:text-zinc-500">{t("calendarSidebarEmpty")}</p>)}
                {selectedEvents.map((ev) => (<div key={ev.id} className={`flex items-start gap-3 rounded-xl border-l-4 bg-zinc-50 px-3 py-2.5 transition-shadow dark:bg-zinc-800/60 ${COLOR_CLASSES[ev.color].border} ${hoveredEventId === ev.id ? "bg-blue-50 ring-2 ring-blue-400/50 ring-offset-1 dark:bg-blue-950/40 dark:ring-blue-500/45" : ""}`}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{ev.title}</p>
                      {(ev.startTime || ev.endTime) && (<p className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                          <Clock className="h-3 w-3"/>
                          {ev.startTime && formatTime(ev.startTime)}
                          {ev.startTime && ev.endTime && " – "}
                          {ev.endTime && formatTime(ev.endTime)}
                        </p>)}
                      {ev.note && <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">{ev.note}</p>}
                    </div>
                    <div className="mt-0.5 flex shrink-0 items-center gap-1">
                      <button type="button" onClick={() => openEditModal(ev)} className="text-zinc-400 hover:text-blue-500 dark:hover:text-blue-400">
                        <Pencil className="h-3.5 w-3.5"/>
                      </button>
                      <button type="button" onClick={() => deleteEvent(ev.id)} className="text-zinc-400 hover:text-red-500 dark:hover:text-red-400">
                        <Trash2 className="h-3.5 w-3.5"/>
                      </button>
                    </div>
                  </div>))}
                <button type="button" onClick={() => openAddModal(selectedDate)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 py-2.5 text-sm font-medium text-zinc-500 transition hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-zinc-200">
                  <Plus className="h-4 w-4"/>
                  {t("calendarSidebarAdd")}
                </button>
              </div>
            </div>) : (<div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-zinc-200 py-12 text-center dark:border-zinc-800">
              <CalendarDays className="h-8 w-8 text-zinc-300 dark:text-zinc-600"/>
              <p className="text-sm text-zinc-400 dark:text-zinc-500">{t("calendarPickDayHint")}</p>
            </div>)}

          <UpcomingEvents bcp47={bcp47} events={events} onDelete={deleteEvent} onEdit={openEditModal} onDayClick={openDay} previewDateKey={previewDateKey} hoveredEventId={hoveredEventId} onHoverDate={setPreviewDateKey} onLeaveDate={() => setPreviewDateKey(null)}/>
        </div>
      </div>

      {showEventModal && (<EventModal initialDate={addModalDate} editEvent={editingEvent} onSave={saveEvent} onUpdate={updateEvent} onClose={() => setShowEventModal(false)}/>)}
      {showAllEvents && (<AllEventsModal events={events} onDelete={deleteEvent} onEdit={openEditModal} onDayClick={openDay} onClose={() => setShowAllEvents(false)}/>)}

      {quickAddDate && (<div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4" onClick={() => { setQuickAddDate(null); setQuickTitle(""); }} role="presentation">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t("calendarQuickAddTitle")}</h2>
              <button type="button" onClick={() => { setQuickAddDate(null); setQuickTitle(""); }} className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                <X className="h-4 w-4"/>
              </button>
            </div>
            <form className="space-y-3 p-4" onSubmit={(e) => { e.preventDefault(); void saveQuickEvent(); }}>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {new Date(quickAddDate + "T12:00:00").toLocaleDateString(bcp47, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
              </p>
              <input type="text" placeholder={t("calendarTitlePlaceholder")} value={quickTitle} onChange={(e) => setQuickTitle(e.target.value)} autoFocus className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"/>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{t("calendarAllDay")}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button type="button" onClick={() => { const d = quickAddDate; setQuickAddDate(null); setQuickTitle(""); if (d) { setAddModalDate(d); setEditingEvent(undefined); setShowEventModal(true); } }} className="flex-1 rounded-lg border border-zinc-300 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800">
                  {t("calendarQuickAddFullForm")}
                </button>
                <button type="submit" disabled={!quickTitle.trim()} className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white shadow-md shadow-blue-600/25 hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:shadow-none dark:disabled:bg-zinc-600">
                  {t("calendarQuickAddSave")}
                </button>
              </div>
            </form>
          </div>
        </div>)}

      <ToastContainer containerId="cal" position="top-center" autoClose={3000} hideProgressBar={false} newestOnTop closeOnClick pauseOnHover draggable theme="colored" style={{ zIndex: 99999 }}/>
    </div>);
}
function UpcomingEvents({ bcp47, events, onDelete, onEdit, onDayClick, previewDateKey, hoveredEventId, onHoverDate, onLeaveDate, }: {
    bcp47: string;
    events: CalendarEvent[];
    onDelete: (id: string) => void;
    onEdit: (ev: CalendarEvent) => void;
    onDayClick: (date: string) => void;
    previewDateKey: string | null;
    hoveredEventId: string | null;
    onHoverDate: (dk: string) => void;
    onLeaveDate: () => void;
}) {
    const { t } = useI18n();
    const upcoming = useMemo(() => {
        const today = todayKey();
        return events
            .filter((e) => (e.endDate ?? e.date) >= today)
            .sort((a, b) => {
            const d = a.date.localeCompare(b.date);
            return d !== 0 ? d : (a.startTime ?? "").localeCompare(b.startTime ?? "");
        })
            .slice(0, 8);
    }, [events]);
    if (upcoming.length === 0)
        return null;
    return (<div className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <p className="border-b border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-900 dark:border-zinc-800 dark:text-zinc-100">{t("calendarUpcoming")}</p>
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {upcoming.map((ev) => {
            const highlighted = previewDateKey === ev.date || hoveredEventId === ev.id;
            return (<li key={ev.id} className={["group flex items-center gap-3 px-4 py-2.5 transition-colors", highlighted ? "bg-blue-50/90 ring-1 ring-inset ring-blue-200/60 dark:bg-blue-950/35 dark:ring-blue-800/40" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"].join(" ")} onMouseEnter={() => onHoverDate(ev.date)} onMouseLeave={onLeaveDate}>
                <span className={`h-2 w-2 shrink-0 rounded-full ${COLOR_CLASSES[ev.color].dot}`}/>
                <Tooltip content={ev.title} placement="top">
                  <button type="button" onClick={() => onDayClick(ev.date)} className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{ev.title}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {new Date(ev.date + "T12:00:00").toLocaleDateString(bcp47, { month: "short", day: "numeric", weekday: "short" })}
                      {ev.startTime && ` · ${formatTime(ev.startTime)}`}
                    </p>
                  </button>
                </Tooltip>
                <div className="flex shrink-0 items-center gap-1 opacity-70 transition group-hover:opacity-100">
                  <button type="button" onClick={() => onEdit(ev)} className="rounded-md p-1 text-zinc-400 hover:bg-zinc-200 hover:text-blue-600 dark:hover:bg-zinc-700 dark:hover:text-blue-400">
                    <Pencil className="h-3.5 w-3.5"/>
                  </button>
                  <button type="button" onClick={() => onDelete(ev.id)} className="rounded-md p-1 text-zinc-400 hover:bg-zinc-200 hover:text-red-600 dark:hover:bg-zinc-700 dark:hover:text-red-400">
                    <Trash2 className="h-3.5 w-3.5"/>
                  </button>
                </div>
              </li>);
        })}
      </ul>
    </div>);
}
