"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  List,
  Loader2,
  Pencil,
  X,
} from "lucide-react";
import { toast } from "react-toastify";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { authFetch } from "@/lib/auth-context";
import { useI18n } from "@/components/i18n-provider";

/** Full day in 30-minute steps: 00:00–00:30 … 23:30–24:00 (48 rows). */
const TIME_SLOTS: readonly string[] = (() => {
  const slots: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const startM of [0, 30]) {
      let eh = h;
      let em = startM + 30;
      if (em >= 60) {
        em -= 60;
        eh += 1;
      }
      const sh = `${String(h).padStart(2, "0")}:${String(startM).padStart(2, "0")}`;
      const endStr =
        eh === 24 && em === 0
          ? "24:00"
          : `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
      slots.push(`${sh} - ${endStr}`);
    }
  }
  return slots;
})();

/** Old hourly keys (e.g. 12:00 - 13:00) map to two half-hour rows for migration. */
function legacyHourlySlotKey(vnSlot: string): string | null {
  const parts = vnSlot.split(" - ");
  if (parts.length !== 2) return null;
  const [shs, sms] = parts[0]!.split(":");
  const sh = Number(shs);
  const sm = Number(sms ?? 0);
  if (!Number.isFinite(sh) || !Number.isFinite(sm)) return null;
  if (sm !== 0 && sm !== 30) return null;
  const endH = sh + 1;
  const endStr =
    endH === 24 ? "24:00" : `${String(endH).padStart(2, "0")}:00`;
  return `${String(sh).padStart(2, "0")}:00 - ${endStr}`;
}

function dateKeyInVietnam(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const mo = parts.find((p) => p.type === "month")?.value;
  const da = parts.find((p) => p.type === "day")?.value;
  if (!y || !mo || !da) return "";
  return `${y}-${mo}-${da}`;
}

const DEFAULT_ACCOUNTS = [
  "Hồng 1",
  "Hồng 2",
  "Hồng 3",
  "Minh 1",
  "Minh 2",
];

/** Preset people for each cell (tutor-style colored blocks). */
const SCHEDULE_PRESETS = [
  { name: "Duy", color: "#1e293b" },
  { name: "Quang", color: "#0f766e" },
  { name: "Thư", color: "#6d28d9" },
] as const;

const PRESET_NAME_SET: ReadonlySet<string> = new Set(
  SCHEDULE_PRESETS.map((p) => p.name),
);

/** Matches sticky time column width for “now” line + dot (Preply-style). */
const TIME_AXIS_COL_PX = 72;

type PresetName = (typeof SCHEDULE_PRESETS)[number]["name"];

function colorForScheduleName(name: string): string {
  return SCHEDULE_PRESETS.find((p) => p.name === name)?.color ?? "";
}

type TimeDisplayTz = "vn" | "local";

function minutesSinceMidnightInScheduleTz(
  now: Date,
  timeDisplay: TimeDisplayTz,
  displayTzId: string,
): number {
  const tz = timeDisplay === "vn" ? "Asia/Ho_Chi_Minh" : displayTzId || "UTC";
  const hm = formatInTimeZone(now, tz, "HH:mm");
  const [h, m] = hm.split(":").map(Number);
  return Math.min(24 * 60, Math.max(0, (h ?? 0) * 60 + (m ?? 0)));
}

function isScheduleViewingToday(
  selectedDateKey: string,
  timeDisplay: TimeDisplayTz,
  displayTzId: string,
): boolean {
  const now = new Date();
  if (timeDisplay === "vn") return selectedDateKey === dateKeyInVietnam(now);
  return (
    selectedDateKey ===
    formatInTimeZone(now, displayTzId || "UTC", "yyyy-MM-dd")
  );
}

type CellData = { text: string; color: string };
/** One day: time slot → account → cell */
type DayCells = Record<string, Record<string, CellData>>;
/** All days: YYYY-MM-DD → day grid */
type ByDateState = Record<string, DayCells>;

/**
 * Columns 0–2 = one shared “person” (Hồng); 3–4 = another (Minh).
 * Only one booking per group per time slot; extra columns are independent.
 */
function accountShareGroupId(colIdx: number): number {
  if (colIdx >= 0 && colIdx < 3) return 0;
  if (colIdx >= 3 && colIdx < 5) return 1;
  return 1000 + colIdx;
}

function isEmptyCellBlockedBySiblingGroup(
  time: string,
  colIdx: number,
  dayCells: DayCells,
  accList: string[],
): boolean {
  for (let j = 0; j < accList.length; j++) {
    if (accountShareGroupId(j) !== accountShareGroupId(colIdx)) continue;
    if (j === colIdx) continue;
    const o = dayCells[time]?.[accList[j]!]?.text?.trim() ?? "";
    if (o) return true;
  }
  return false;
}

/** One visible row: label + which Vietnam storage bucket to read/write. */
type ScheduleGridRow = {
  displayLabel: string;
  vnDateKey: string;
  vnSlot: string;
};

/** Preply-style left axis: one label per hour (rowSpan 2 over half-hour rows). */
function hourAxisLabelForRow(
  rows: ScheduleGridRow[],
  rowIdx: number,
): string | null {
  if (rowIdx % 2 !== 0) return null;
  const row = rows[rowIdx];
  if (!row) return null;
  const part = row.displayLabel.split(" - ")[0]?.trim() ?? "";
  const m = /^(\d{1,2}):(\d{2})$/.exec(part);
  if (!m) return part || null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return part;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function getCellFromByDate(
  byDate: ByDateState,
  accounts: string[],
  vnDateKey: string,
  vnSlot: string,
  account: string,
): CellData {
  const day = byDate[vnDateKey];
  if (!day) return { text: "", color: "" };
  return day[vnSlot]?.[account] ?? { text: "", color: "" };
}

/**
 * Vertical merge for one column: same trimmed text + color as rows below → one `<td rowSpan>`.
 * Empty cells never merge. Continuation rows return `null` (no `<td>` for that column).
 */
function getScheduleColumnRowSpan(
  byDate: ByDateState,
  accounts: string[],
  gridRows: ScheduleGridRow[],
  rowIdx: number,
  account: string,
): number | null {
  const row = gridRows[rowIdx];
  if (!row) return 1;
  const cell = getCellFromByDate(
    byDate,
    accounts,
    row.vnDateKey,
    row.vnSlot,
    account,
  );
  const myText = cell.text.trim();
  if (!myText) return 1;

  if (rowIdx > 0) {
    const prev = gridRows[rowIdx - 1]!;
    const prevCell = getCellFromByDate(
      byDate,
      accounts,
      prev.vnDateKey,
      prev.vnSlot,
      account,
    );
    if (
      myText === prevCell.text.trim() &&
      (cell.color || "") === (prevCell.color || "")
    ) {
      return null;
    }
  }

  let span = 1;
  for (let r = rowIdx + 1; r < gridRows.length; r++) {
    const nextR = gridRows[r]!;
    const nextCell = getCellFromByDate(
      byDate,
      accounts,
      nextR.vnDateKey,
      nextR.vnSlot,
      account,
    );
    if (
      myText === nextCell.text.trim() &&
      (cell.color || "") === (nextCell.color || "")
    ) {
      span++;
    } else break;
  }
  return span;
}

function isRunPastForGridRows(
  gridRows: ScheduleGridRow[],
  startRowIdx: number,
  rowSpan: number,
): boolean {
  const n = Math.max(1, rowSpan);
  for (let i = 0; i < n; i++) {
    const row = gridRows[startRowIdx + i];
    if (!row) return true;
    if (isSlotPastInVietnam(row.vnDateKey, row.vnSlot)) return true;
  }
  return false;
}

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDateKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function shiftDateKey(key: string, deltaDays: number): string {
  const d = parseDateKey(key);
  if (!d) return key;
  d.setDate(d.getDate() + deltaDays);
  return toDateKey(d);
}

function buildEmptyDay(accounts: string[]): DayCells {
  const init: DayCells = {};
  for (const t of TIME_SLOTS) {
    init[t] = {};
    for (const a of accounts) {
      init[t][a] = { text: "", color: "" };
    }
  }
  return init;
}

function normalizeDayCells(
  accounts: string[],
  raw: Record<string, Record<string, { text?: string; color?: string }>> | undefined,
): DayCells {
  const out = buildEmptyDay(accounts);
  if (!raw) return out;
  for (const t of TIME_SLOTS) {
    let row = raw[t];
    if (!row) {
      const legacy = legacyHourlySlotKey(t);
      if (legacy) row = raw[legacy];
    }
    if (!row) continue;
    for (const a of accounts) {
      const c = row[a];
      if (c && typeof c === "object") {
        const text = typeof c.text === "string" ? c.text : "";
        const presetColor = colorForScheduleName(text);
        const color =
          presetColor ||
          (typeof c.color === "string" ? c.color : "");
        out[t][a] = { text, color };
      }
    }
  }
  return out;
}

function renameAccountsInDay(
  day: DayCells | undefined,
  oldAccounts: string[],
  newAccounts: string[],
  idx: number,
  oldName: string,
): DayCells {
  const base = day ?? buildEmptyDay(newAccounts);
  const next: DayCells = {};
  for (const t of TIME_SLOTS) {
    next[t] = {};
    for (let i = 0; i < newAccounts.length; i++) {
      const a = newAccounts[i]!;
      const prevAccountName = oldAccounts[i]!;
      const sourceKey = i === idx ? oldName : prevAccountName;
      next[t][a] = base[t]?.[sourceKey] ?? { text: "", color: "" };
    }
  }
  return next;
}

/** Civil datetime in Vietnam (UTC+7, no DST) for a calendar date + HH:mm. */
function vnLocalToDate(dateKey: string, hhmm: string): Date {
  if (hhmm === "24:00") {
    return vnLocalToDate(shiftDateKey(dateKey, 1), "00:00");
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) return new Date(NaN);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const [hhS, mmS] = hhmm.split(":");
  const hh = Number(hhS);
  const mm = Number(mmS ?? 0);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return new Date(NaN);
  const yStr = String(y).padStart(4, "0");
  const moStr = String(mo).padStart(2, "0");
  const dStr = String(d).padStart(2, "0");
  const hhStr = String(hh).padStart(2, "0");
  const mmStr = String(mm).padStart(2, "0");
  return new Date(
    `${yStr}-${moStr}-${dStr}T${hhStr}:${mmStr}:00+07:00`,
  );
}

/** Slot end has passed in real time, relative to Vietnam calendar date `dateKey`. */
function isSlotPastInVietnam(dateKey: string, vnSlot: string): boolean {
  const todayVn = dateKeyInVietnam(new Date());
  if (dateKey < todayVn) return true;
  if (dateKey > todayVn) return false;
  const parts = vnSlot.split(" - ");
  if (parts.length !== 2) return false;
  const end = parts[1]!;
  const endInstant =
    end === "24:00"
      ? vnLocalToDate(shiftDateKey(dateKey, 1), "00:00")
      : vnLocalToDate(dateKey, end);
  return Date.now() >= endInstant.getTime();
}

/** Map an instant to the Vietnam calendar date + 30-min slot key used in `byDate`. */
function utcInstantToVnStorageKey(instant: Date): {
  vnDateKey: string;
  vnSlot: string;
} {
  const vnDateKey = formatInTimeZone(
    instant,
    "Asia/Ho_Chi_Minh",
    "yyyy-MM-dd",
  );
  const hm = formatInTimeZone(instant, "Asia/Ho_Chi_Minh", "HH:mm");
  const [hhS, mmS] = hm.split(":");
  const hh = Number(hhS);
  const mm = Number(mmS ?? 0);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) {
    return { vnDateKey, vnSlot: TIME_SLOTS[0]! };
  }
  const totalMin = hh * 60 + mm;
  const slotIdx = Math.min(47, Math.max(0, Math.floor(totalMin / 30)));
  return { vnDateKey, vnSlot: TIME_SLOTS[slotIdx]! };
}

/** 48 half-hour rows for `localDateKey` in `displayTzId`: labels 00:00–24:00 local, storage via VN keys. */
function buildLocalDayStudyRows(
  localDateKey: string,
  displayTzId: string,
): ScheduleGridRow[] {
  const rows: ScheduleGridRow[] = [];
  const tz = displayTzId || "UTC";
  for (let i = 0; i < 48; i++) {
    const totalStartMin = i * 30;
    const sh = Math.floor(totalStartMin / 60);
    const sm = totalStartMin % 60;
    const wallStart = `${localDateKey} ${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}:00`;
    const utcStart = fromZonedTime(wallStart, tz);

    let displayLabel: string;
    if (i < 47) {
      const nextTotal = (i + 1) * 30;
      const nh = Math.floor(nextTotal / 60);
      const nm = nextTotal % 60;
      const wallNext = `${localDateKey} ${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}:00`;
      const utcNext = fromZonedTime(wallNext, tz);
      const s0 = formatInTimeZone(utcStart, tz, "HH:mm");
      const s1 = formatInTimeZone(utcNext, tz, "HH:mm");
      displayLabel = `${s0} - ${s1}`;
    } else {
      const s0 = formatInTimeZone(utcStart, tz, "HH:mm");
      displayLabel = `${s0} - 24:00`;
    }

    const { vnDateKey, vnSlot } = utcInstantToVnStorageKey(utcStart);
    rows.push({ displayLabel, vnDateKey, vnSlot });
  }
  return rows;
}

function buildStudyScheduleGridRows(
  mode: TimeDisplayTz,
  anchorDateKey: string,
  displayTzId: string,
): ScheduleGridRow[] {
  if (mode === "vn") {
    return TIME_SLOTS.map((vnSlot) => ({
      displayLabel: vnSlot,
      vnDateKey: anchorDateKey,
      vnSlot,
    }));
  }
  return buildLocalDayStudyRows(anchorDateKey, displayTzId);
}

function stablePayload(
  acc: string[],
  byDate: ByDateState,
  timeDisplay: TimeDisplayTz,
): string {
  return JSON.stringify({ accounts: acc, byDate, timeDisplay });
}

export function StudyScheduleGrid() {
  const { t, locale } = useI18n();
  const [accounts, setAccounts] = useState<string[]>(() => [...DEFAULT_ACCOUNTS]);
  const [byDate, setByDate] = useState<ByDateState>({});
  const [selectedDateKey, setSelectedDateKey] = useState(() =>
    toDateKey(new Date()),
  );
  const [editingAccount, setEditingAccount] = useState<number | null>(null);
  const [timeDisplay, setTimeDisplay] = useState<TimeDisplayTz>("vn");
  const [boot, setBoot] = useState<"loading" | "ok" | "error">("loading");
  const [paintMode, setPaintMode] = useState(true);
  const [activeBrush, setActiveBrush] = useState<PresetName | "clear">("Duy");
  const [showAllShiftsModal, setShowAllShiftsModal] = useState(false);
  const [pastTick, setPastTick] = useState(0);

  const lastSyncedJsonRef = useRef("");
  const dragPaintingRef = useRef(false);
  const stateRef = useRef({ accounts, byDate, timeDisplay });
  stateRef.current = { accounts, byDate, timeDisplay };

  const browserTzLabel = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    } catch {
      return "";
    }
  }, []);

  const displayTimeZoneId = browserTzLabel || "UTC";

  const gridRows = useMemo(
    (): ScheduleGridRow[] =>
      buildStudyScheduleGridRows(
        timeDisplay,
        selectedDateKey,
        displayTimeZoneId,
      ),
    [timeDisplay, selectedDateKey, displayTimeZoneId],
  );

  const tableWrapRef = useRef<HTMLDivElement>(null);
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const firstBodyRowRef = useRef<HTMLTableRowElement>(null);
  const [nowLineTopPx, setNowLineTopPx] = useState<number | null>(null);

  const showNowLine = useMemo(() => {
    void pastTick;
    return isScheduleViewingToday(
      selectedDateKey,
      timeDisplay,
      displayTimeZoneId,
    );
  }, [selectedDateKey, timeDisplay, displayTimeZoneId, pastTick]);

  const updateNowLinePosition = useCallback(() => {
    void pastTick;
    if (!showNowLine) {
      setNowLineTopPx(null);
      return;
    }
    const thead = theadRef.current;
    const tr0 = firstBodyRowRef.current;
    if (!thead || !tr0) {
      setNowLineTopPx(null);
      return;
    }
    const theadH = thead.offsetHeight;
    const rowH = tr0.offsetHeight;
    if (rowH <= 0) {
      setNowLineTopPx(null);
      return;
    }
    const mins = minutesSinceMidnightInScheduleTz(
      new Date(),
      timeDisplay,
      displayTimeZoneId,
    );
    const bodyPx = 48 * rowH;
    setNowLineTopPx(theadH + (mins / (24 * 60)) * bodyPx);
  }, [showNowLine, timeDisplay, displayTimeZoneId, pastTick]);

  useLayoutEffect(() => {
    updateNowLinePosition();
  }, [updateNowLinePosition]);

  useEffect(() => {
    if (!showNowLine) return;
    const wrap = tableWrapRef.current;
    if (!wrap || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => updateNowLinePosition());
    ro.observe(wrap);
    window.addEventListener("resize", updateNowLinePosition);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateNowLinePosition);
    };
  }, [showNowLine, updateNowLinePosition]);

  const modalDateLabel = useMemo(() => {
    const d = parseDateKey(selectedDateKey);
    if (!d) return selectedDateKey;
    return d.toLocaleDateString(locale === "vi" ? "vi-VN" : "en-GB", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }, [selectedDateKey, locale]);

  const bookedRowsList = useMemo(() => {
    type Row = {
      rowIdx: number;
      time: string;
      timeLabel: string;
      columnTitle: string;
      booker: string;
      color: string;
    };
    const out: Row[] = [];
    gridRows.forEach((row, rowIdx) => {
      for (const acc of accounts) {
        const cell = getCellFromByDate(
          byDate,
          accounts,
          row.vnDateKey,
          row.vnSlot,
          acc,
        );
        const text = cell.text.trim();
        if (!text) continue;
        out.push({
          rowIdx,
          time: row.displayLabel,
          timeLabel: row.displayLabel,
          columnTitle: acc,
          booker: text,
          color: cell.color ?? "",
        });
      }
    });
    return out;
  }, [gridRows, byDate, accounts]);

  useEffect(() => {
    if (!showAllShiftsModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowAllShiftsModal(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showAllShiftsModal]);

  const loadSchedule = useCallback(async () => {
    setBoot("loading");
    try {
      const res = await authFetch("/api/study-schedule");
      if (!res.ok) {
        setBoot("error");
        toast.error(t("studyScheduleLoadFailed"));
        return;
      }
      const data = (await res.json()) as {
        accounts?: string[];
        byDate?: Record<string, Record<string, Record<string, { text?: string; color?: string }>>>;
        timeDisplay?: string;
      };
      let acc = Array.isArray(data.accounts)
        ? data.accounts.map((a) => String(a).trim() || "—")
        : [...DEFAULT_ACCOUNTS];
      if (acc.length === 0) acc = [...DEFAULT_ACCOUNTS];
      const nextByDate: ByDateState = {};
      if (data.byDate && typeof data.byDate === "object") {
        for (const [dk, rawDay] of Object.entries(data.byDate)) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(dk))
            nextByDate[dk] = normalizeDayCells(acc, rawDay);
        }
      }
      const td: TimeDisplayTz =
        data.timeDisplay === "local" || data.timeDisplay === "cz"
          ? "local"
          : "vn";
      setAccounts(acc);
      setByDate(nextByDate);
      setTimeDisplay(td);
      lastSyncedJsonRef.current = stablePayload(acc, nextByDate, td);
      setBoot("ok");
    } catch {
      setBoot("error");
      toast.error(t("studyScheduleLoadFailed"));
    }
  }, [t]);

  useEffect(() => {
    void loadSchedule();
  }, [loadSchedule]);

  useEffect(() => {
    const endDrag = () => {
      dragPaintingRef.current = false;
    };
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    return () => {
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setPastTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (boot !== "ok") return;
    const timer = window.setTimeout(() => {
      void (async () => {
        const s = stateRef.current;
        const payload = stablePayload(s.accounts, s.byDate, s.timeDisplay);
        if (payload === lastSyncedJsonRef.current) return;
        try {
          const res = await authFetch("/api/study-schedule", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: payload,
          });
          if (!res.ok) {
            toast.error(t("studyScheduleSaveFailed"));
            return;
          }
          lastSyncedJsonRef.current = payload;
        } catch {
          toast.error(t("studyScheduleSaveFailed"));
        }
      })();
    }, 650);
    return () => window.clearTimeout(timer);
  }, [accounts, byDate, timeDisplay, boot, t]);

  const applyCellChoice = useCallback(
    (
      startRowIdx: number,
      account: string,
      name: string,
      slotCount: number = 1,
    ) => {
      const colIdx = accounts.indexOf(account);
      if (colIdx < 0) return;
      const n = Math.max(
        1,
        Math.min(slotCount, gridRows.length - startRowIdx),
      );
      setByDate((prev) => {
        const text = name.trim();
        const dayMutations: Record<string, DayCells> = {};

        for (let offset = 0; offset < n; offset++) {
          const row = gridRows[startRowIdx + offset];
          if (!row) break;
          const { vnDateKey, vnSlot } = row;
          if (isSlotPastInVietnam(vnDateKey, vnSlot)) continue;

          const dayBase =
            dayMutations[vnDateKey] ??
            prev[vnDateKey] ??
            buildEmptyDay(accounts);

          if (
            text &&
            isEmptyCellBlockedBySiblingGroup(
              vnSlot,
              colIdx,
              dayBase,
              accounts,
            )
          )
            continue;

          const color = text ? colorForScheduleName(text) || "#475569" : "";
          dayMutations[vnDateKey] = {
            ...dayBase,
            [vnSlot]: {
              ...dayBase[vnSlot],
              [account]: { text, color },
            },
          };
        }

        if (Object.keys(dayMutations).length === 0) return prev;
        return { ...prev, ...dayMutations };
      });
    },
    [gridRows, accounts],
  );

  const handlePaintPointerDown = useCallback(
    (
      e: React.PointerEvent,
      rowIdx: number,
      account: string,
      slotCount: number = 1,
    ) => {
      if (!paintMode || e.button !== 0) return;
      e.preventDefault();
      dragPaintingRef.current = true;
      if (activeBrush === "clear")
        applyCellChoice(rowIdx, account, "", slotCount);
      else applyCellChoice(rowIdx, account, activeBrush, slotCount);
    },
    [paintMode, activeBrush, applyCellChoice],
  );

  const handlePaintPointerEnter = useCallback(
    (
      e: React.PointerEvent,
      rowIdx: number,
      account: string,
      slotCount: number = 1,
    ) => {
      if (!paintMode || !dragPaintingRef.current) return;
      if ((e.buttons & 1) === 0) return;
      if (activeBrush === "clear")
        applyCellChoice(rowIdx, account, "", slotCount);
      else applyCellChoice(rowIdx, account, activeBrush, slotCount);
    },
    [paintMode, activeBrush, applyCellChoice],
  );

  const renameAccount = (idx: number, newName: string) => {
    const trimmed = newName.trim() || accounts[idx];
    const oldName = accounts[idx];
    if (!oldName || trimmed === oldName) {
      setEditingAccount(null);
      return;
    }
    const newAccounts = accounts.map((a, i) => (i === idx ? trimmed : a));
    setByDate((prev) => {
      const next: ByDateState = {};
      for (const dk of Object.keys(prev)) {
        next[dk] = renameAccountsInDay(
          prev[dk],
          accounts,
          newAccounts,
          idx,
          oldName,
        );
      }
      return next;
    });
    setAccounts(newAccounts);
    setEditingAccount(null);
  };

  const exportCSV = () => {
    const dateCol = t("calendarFieldDate");
    const header = [dateCol, t("studyScheduleTimeColumn"), ...accounts].join(",");
    const rows = gridRows.map((row) =>
      [
        selectedDateKey,
        row.displayLabel,
        ...accounts.map((a) => {
          const text =
            getCellFromByDate(
              byDate,
              accounts,
              row.vnDateKey,
              row.vnSlot,
              a,
            ).text ?? "";
          return `"${text.replace(/"/g, '""')}"`;
        }),
      ].join(","),
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([`\uFEFF${csv}`], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lich_hoc_${selectedDateKey}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectCls =
    "h-9 appearance-none rounded-lg border border-zinc-200 bg-zinc-50 pl-3 pr-8 text-sm font-medium text-zinc-800 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100";
  const dateInputCls =
    "h-9 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-blue-400 dark:focus:ring-blue-900/30";
  const thInputCls =
    "mx-auto w-[min(100%,7.5rem)] rounded-lg border border-zinc-300 bg-white px-2 py-1 text-center text-xs font-medium text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-blue-400 dark:focus:ring-blue-900/30";

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 px-4 py-6">
      {boot === "error" && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/35 dark:text-red-200">
          <span>{t("studyScheduleLoadFailed")}</span>
          <button
            type="button"
            onClick={() => void loadSchedule()}
            className="shrink-0 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-900 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/50 dark:text-red-100 dark:hover:bg-red-900/40"
          >
            {t("studyScheduleRetry")}
          </button>
        </div>
      )}

      <h1 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        {t("studyScheduleHeading")}
      </h1>

      <div className="flex w-full min-w-0 items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setSelectedDateKey((k) => shiftDateKey(k, -1))}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            aria-label={t("studySchedulePrevDay")}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <input
            type="date"
            value={selectedDateKey}
            onChange={(e) => {
              const v = e.target.value;
              if (/^\d{4}-\d{2}-\d{2}$/.test(v)) setSelectedDateKey(v);
            }}
            className={`${dateInputCls} min-w-[10.5rem] shrink-0`}
            aria-label={t("calendarFieldDate")}
          />

          <button
            type="button"
            onClick={() => setSelectedDateKey(toDateKey(new Date()))}
            className="h-9 shrink-0 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm font-medium whitespace-nowrap text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            {t("calendarToday")}
          </button>

          <button
            type="button"
            onClick={() => setSelectedDateKey((k) => shiftDateKey(k, 1))}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            aria-label={t("studyScheduleNextDay")}
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <span
            className="h-6 w-px shrink-0 bg-zinc-200 dark:bg-zinc-600"
            aria-hidden
          />

          <label
            htmlFor="study-schedule-tz"
            className="shrink-0 text-xs font-medium whitespace-nowrap text-zinc-600 dark:text-zinc-400"
          >
            {t("studyScheduleTzLabel")}
          </label>
          <div className="relative min-w-[8.5rem] shrink-0">
            <select
              id="study-schedule-tz"
              value={timeDisplay}
              onChange={(e) =>
                setTimeDisplay(e.target.value === "local" ? "local" : "vn")
              }
              className={`${selectCls} w-full min-w-0`}
              aria-label={t("studyScheduleTzLabel")}
            >
              <option value="vn">{t("studyScheduleTzVN")}</option>
              <option value="local">{t("studyScheduleTzLocal")}</option>
            </select>
            <ChevronRight className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rotate-90 text-zinc-400" />
          </div>

          {boot === "ok" && (
            <>
              <span
                className="h-6 w-px shrink-0 bg-zinc-200 dark:bg-zinc-600"
                aria-hidden
              />
              <button
                type="button"
                onClick={() => {
                  setPaintMode((p) => {
                    const next = !p;
                    if (!next) dragPaintingRef.current = false;
                    return next;
                  });
                }}
                className={[
                  "h-9 shrink-0 rounded-lg border px-2.5 text-xs font-medium whitespace-nowrap transition-colors sm:px-3 sm:text-sm",
                  paintMode
                    ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 dark:border-emerald-500 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                    : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700",
                ].join(" ")}
              >
                {paintMode
                  ? t("studySchedulePaintModeOn")
                  : t("studySchedulePaintModeOff")}
              </button>
              {paintMode && (
                <>
                  {SCHEDULE_PRESETS.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => setActiveBrush(p.name)}
                      className={[
                        "h-8 shrink-0 rounded-md px-2 text-xs font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70 sm:px-2.5",
                        activeBrush === p.name
                          ? "ring-2 ring-inset ring-white/90"
                          : "opacity-90 hover:opacity-100",
                      ].join(" ")}
                      style={{ background: p.color }}
                    >
                      {p.name}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setActiveBrush("clear")}
                    className={[
                      "h-8 shrink-0 rounded-md border px-2 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-500 sm:px-2.5 dark:focus-visible:ring-zinc-400",
                      activeBrush === "clear"
                        ? "border-zinc-500 bg-zinc-200 text-zinc-900 ring-2 ring-inset ring-zinc-800 dark:border-zinc-400 dark:bg-zinc-700 dark:text-zinc-100 dark:ring-zinc-200"
                        : "border-zinc-300 bg-zinc-100 text-zinc-800 hover:bg-zinc-200 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700",
                    ].join(" ")}
                  >
                    {t("studySchedulePaintClear")}
                  </button>
                </>
              )}
              <span
                className="h-6 w-px shrink-0 bg-zinc-200 dark:bg-zinc-600"
                aria-hidden
              />
              <button
                type="button"
                onClick={() => setShowAllShiftsModal(true)}
                className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 px-2 text-xs font-medium whitespace-nowrap text-zinc-700 transition-colors hover:bg-zinc-100 sm:px-2.5 sm:text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                <List className="h-4 w-4 shrink-0" aria-hidden />
                <span className="max-w-[7.5rem] truncate sm:max-w-none">
                  {t("studyScheduleShowAllShifts")}
                </span>
              </button>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={exportCSV}
          disabled={boot !== "ok"}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-50 dark:focus-visible:ring-offset-zinc-900"
        >
          <Download className="h-4 w-4 shrink-0" aria-hidden />
          <span className="hidden sm:inline">{t("studyScheduleExportCsv")}</span>
          <span className="sm:hidden">CSV</span>
        </button>
      </div>

      {boot === "loading" && (
        <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <Loader2
            className="h-9 w-9 animate-spin text-zinc-400 dark:text-zinc-500"
            aria-hidden
          />
        </div>
      )}

      {boot === "ok" && (
      <div
        className={[
          "overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900",
          paintMode && "select-none",
        ].join(" ")}
      >
        <div className="max-h-[min(78vh,1120px)] overflow-auto">
          <div ref={tableWrapRef} className="relative min-w-[640px]">
            <table className="relative z-10 w-full min-w-[640px] border-collapse">
            <thead
              ref={theadRef}
              className="sticky top-0 z-20 border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/95"
            >
              <tr>
                <th
                  className="sticky left-0 z-30 w-[72px] min-w-[72px] max-w-[72px] border-b border-r border-zinc-200 bg-zinc-50 px-2 py-2.5 text-left text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/95 dark:text-zinc-200"
                  style={{ width: TIME_AXIS_COL_PX, minWidth: TIME_AXIS_COL_PX }}
                >
                  <span className="block">{t("studyScheduleTimeColumn")}</span>
                  <span className="mt-0.5 block text-[10px] font-normal normal-case text-zinc-500 dark:text-zinc-400">
                    {timeDisplay === "vn"
                      ? t("studyScheduleTzVN")
                      : browserTzLabel || t("studyScheduleTzLocal")}
                  </span>
                </th>
                {accounts.map((acc, idx) => (
                  <th
                    key={`${idx}-${acc}`}
                    className="min-w-[112px] border-b border-r border-zinc-200 px-2 py-2.5 text-center text-xs font-semibold text-zinc-700 last:border-r-0 dark:border-zinc-700 dark:text-zinc-200 sm:min-w-[124px]"
                  >
                    {editingAccount === idx ? (
                      <input
                        autoFocus
                        defaultValue={acc}
                        aria-label={t("studyScheduleRenameColumnTitle")}
                        onBlur={(e) => renameAccount(idx, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter")
                            renameAccount(idx, (e.target as HTMLInputElement).value);
                        }}
                        className={thInputCls}
                      />
                    ) : (
                      <span
                        role="button"
                        tabIndex={0}
                        onDoubleClick={() => setEditingAccount(idx)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setEditingAccount(idx);
                          }
                        }}
                        className="inline-flex cursor-pointer select-none items-center justify-center gap-1 text-zinc-800 dark:text-zinc-100"
                      >
                        <span className="truncate">{acc}</span>
                        <Pencil
                          className="h-3 w-3 shrink-0 text-zinc-400 dark:text-zinc-500"
                          aria-hidden
                        />
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gridRows.map((row, rowIdx) => {
                void pastTick;
                const hourLbl = hourAxisLabelForRow(gridRows, rowIdx);
                const rowBg =
                  rowIdx % 2 === 0
                    ? "bg-white dark:bg-zinc-900"
                    : "bg-zinc-50/80 dark:bg-zinc-800/25";
                const dayForRow =
                  byDate[row.vnDateKey] ?? buildEmptyDay(accounts);
                return (
                  <tr
                    ref={rowIdx === 0 ? firstBodyRowRef : undefined}
                    id={`study-schedule-slot-${rowIdx}`}
                    key={rowIdx}
                    aria-label={row.displayLabel}
                    className={[
                      "group border-b border-zinc-100 transition-colors last:border-b-0 dark:border-zinc-800",
                      rowIdx % 2 === 1 &&
                        "border-t border-zinc-200/80 dark:border-zinc-600/40",
                      rowBg,
                      "hover:bg-zinc-50 dark:hover:bg-zinc-800/40",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {hourLbl != null ? (
                      <td
                        rowSpan={2}
                        className={[
                          "sticky left-0 z-10 border-r border-zinc-200 px-2 py-0 align-top dark:border-zinc-700",
                          rowBg,
                          "group-hover:bg-zinc-50 dark:group-hover:bg-zinc-800/40",
                        ].join(" ")}
                        style={{
                          width: TIME_AXIS_COL_PX,
                          minWidth: TIME_AXIS_COL_PX,
                          maxWidth: TIME_AXIS_COL_PX,
                        }}
                      >
                        <span className="inline-block pt-1 text-[11px] font-semibold tabular-nums text-zinc-600 dark:text-zinc-300">
                          {hourLbl}
                        </span>
                      </td>
                    ) : null}
                    {accounts.flatMap((acc, colIdx) => {
                      const rowSpan = getScheduleColumnRowSpan(
                        byDate,
                        accounts,
                        gridRows,
                        rowIdx,
                        acc,
                      );
                      if (rowSpan === null) return [];

                      const cell = getCellFromByDate(
                        byDate,
                        accounts,
                        row.vnDateKey,
                        row.vnSlot,
                        acc,
                      );
                      const hasPresetName = PRESET_NAME_SET.has(cell.text);
                      const mergeBlock = rowSpan >= 2;
                      const past = isRunPastForGridRows(
                        gridRows,
                        rowIdx,
                        rowSpan,
                      );
                      const myText = cell.text.trim();
                      const blockedGroup =
                        !myText &&
                        isEmptyCellBlockedBySiblingGroup(
                          row.vnSlot,
                          colIdx,
                          dayForRow,
                          accounts,
                        );
                      const disabled = past || blockedGroup;

                      const paintBtnBase =
                        "touch-none cursor-crosshair border border-transparent text-center text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/70 disabled:cursor-not-allowed disabled:opacity-45 dark:focus-visible:ring-blue-400/70";

                      return [
                        <td
                          key={colIdx}
                          rowSpan={mergeBlock ? rowSpan : undefined}
                          className={[
                            "relative min-w-[112px] border-r border-zinc-200 last:border-r-0 dark:border-zinc-700 sm:min-w-[124px]",
                            mergeBlock
                              ? "p-0 align-stretch"
                              : "px-1 py-0.5 align-middle",
                          ].join(" ")}
                          style={{
                            backgroundColor: cell.color || undefined,
                          }}
                        >
                          {paintMode ? (
                            <button
                              type="button"
                              disabled={disabled}
                              className={[
                                mergeBlock
                                  ? "absolute inset-0 flex items-center justify-center rounded-md px-1 py-1"
                                  : "relative flex min-h-[30px] w-full items-center justify-center rounded-md px-1 py-1",
                                paintBtnBase,
                                cell.color
                                  ? "bg-transparent"
                                  : "bg-zinc-50/90 dark:bg-zinc-800/50",
                                cell.text
                                  ? "text-white"
                                  : "text-zinc-400 dark:text-zinc-500",
                              ].join(" ")}
                              aria-label={
                                myText
                                  ? mergeBlock
                                    ? `${myText} (${t("studyScheduleMergedSlotHint")})`
                                    : myText
                                  : t("studySchedulePickPerson")
                              }
                              aria-disabled={disabled}
                              onPointerDown={(e) =>
                                handlePaintPointerDown(
                                  e,
                                  rowIdx,
                                  acc,
                                  rowSpan,
                                )
                              }
                              onPointerEnter={(e) =>
                                handlePaintPointerEnter(
                                  e,
                                  rowIdx,
                                  acc,
                                  rowSpan,
                                )
                              }
                            >
                              {cell.text || "·"}
                            </button>
                          ) : (
                            <div
                              className={
                                mergeBlock
                                  ? "absolute inset-0 flex min-h-[30px] items-stretch"
                                  : "relative flex min-h-[30px] items-stretch"
                              }
                            >
                              <select
                                value={cell.text}
                                disabled={disabled}
                                onChange={(e) =>
                                  applyCellChoice(
                                    rowIdx,
                                    acc,
                                    e.target.value,
                                    rowSpan,
                                  )
                                }
                                className={[
                                  mergeBlock
                                    ? "h-full min-h-0 w-full flex-1"
                                    : "w-full min-h-[28px] flex-1",
                                  "appearance-none rounded-md border-0 px-1 py-1 pr-6 text-center text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/70 disabled:cursor-not-allowed disabled:opacity-45 dark:focus-visible:ring-blue-400/70",
                                  disabled
                                    ? "cursor-not-allowed"
                                    : "cursor-pointer",
                                  cell.text
                                    ? "text-white"
                                    : "text-zinc-500 dark:text-zinc-400",
                                ].join(" ")}
                                aria-label={
                                  myText
                                    ? mergeBlock
                                      ? `${myText} (${t("studyScheduleMergedSlotHint")})`
                                      : myText
                                    : t("studySchedulePickPerson")
                                }
                              >
                                <option value="">
                                  {t("studySchedulePickPerson")}
                                </option>
                                {SCHEDULE_PRESETS.map((p) => (
                                  <option key={p.name} value={p.name}>
                                    {p.name}
                                  </option>
                                ))}
                                {cell.text && !hasPresetName ? (
                                  <option value={cell.text}>{cell.text}</option>
                                ) : null}
                              </select>
                              <ChevronDown
                                className={[
                                  "pointer-events-none absolute right-1 top-1/2 h-3.5 w-3.5 -translate-y-1/2 opacity-80",
                                  cell.text
                                    ? "text-white/90"
                                    : "text-zinc-400 dark:text-zinc-500",
                                ].join(" ")}
                                aria-hidden
                              />
                            </div>
                          )}
                        </td>,
                      ];
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
            {showNowLine && nowLineTopPx != null && (
              <div
                className="pointer-events-none absolute z-[35] w-full"
                style={{ top: nowLineTopPx }}
                aria-hidden
              >
                <div
                  className="absolute h-2 w-2 rounded-full bg-red-500 shadow-sm ring-2 ring-white dark:ring-zinc-900"
                  style={{
                    left: TIME_AXIS_COL_PX / 2 - 4,
                    top: -3,
                  }}
                />
                <div
                  className="absolute right-0 top-0 h-px bg-red-500"
                  style={{ left: TIME_AXIS_COL_PX - 2 }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {boot === "ok" && showAllShiftsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowAllShiftsModal(false)}
          role="presentation"
        >
          <div
            className="flex min-h-0 max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="study-schedule-shifts-modal-title"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-700">
              <h2
                id="study-schedule-shifts-modal-title"
                className="text-base font-semibold text-zinc-900 dark:text-zinc-100"
              >
                {t("studyScheduleAllShiftsModalTitle")}
              </h2>
              <button
                type="button"
                onClick={() => setShowAllShiftsModal(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                aria-label={t("studyScheduleModalClose")}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <p className="border-b border-zinc-100 px-5 py-3 text-xs font-medium text-zinc-800 dark:border-zinc-800 dark:text-zinc-200">
              {modalDateLabel}
            </p>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {bookedRowsList.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-zinc-400 dark:text-zinc-500">
                  {t("studyScheduleListEmpty")}
                </p>
              ) : (
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {bookedRowsList.map((row, idx) => (
                    <li key={`${row.time}|${row.columnTitle}|${idx}`}>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAllShiftsModal(false);
                          window.requestAnimationFrame(() => {
                            document
                              .getElementById(
                                `study-schedule-slot-${row.rowIdx}`,
                              )
                              ?.scrollIntoView({
                                behavior: "smooth",
                                block: "center",
                              });
                          });
                        }}
                        className="flex w-full flex-col gap-2 px-4 py-3 text-left transition-colors hover:bg-zinc-50 sm:flex-row sm:items-start sm:gap-4 dark:hover:bg-zinc-800/60"
                      >
                        <div className="min-w-0 flex-1 sm:max-w-[38%]">
                          <p className="text-[10px] font-semibold tracking-wide text-zinc-400 uppercase dark:text-zinc-500">
                            {t("studyScheduleListTime")}
                          </p>
                          <p className="mt-0.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            {row.timeLabel}
                          </p>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-semibold tracking-wide text-zinc-400 uppercase dark:text-zinc-500">
                            {t("studyScheduleListBooker")}
                          </p>
                          <p
                            className="mt-0.5 inline-flex max-w-full items-center rounded-md px-2 py-0.5 text-sm font-semibold text-white"
                            style={{
                              backgroundColor:
                                row.color || "rgb(71 85 105)",
                            }}
                          >
                            {row.booker}
                          </p>
                        </div>
                        <div className="min-w-0 shrink-0 sm:w-28">
                          <p className="text-[10px] font-semibold tracking-wide text-zinc-400 uppercase dark:text-zinc-500">
                            {t("studyScheduleListColumn")}
                          </p>
                          <p className="mt-0.5 truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">
                            {row.columnTitle}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
