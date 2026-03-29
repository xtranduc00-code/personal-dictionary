/**
 * Vietnam wall clock + slot string → UTC instant at slot start.
 * Matches the study grid: keys are VN calendar dates and `HH:mm - HH:mm` / `… - 24:00` slot labels.
 */

const VN_TIME_SLOTS: readonly string[] = (() => {
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

function shiftDateKey(key: string, deltaDays: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return key;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() + deltaDays);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function vnWallToUtc(dateKey: string, hhmm: string): Date | null {
  if (hhmm === "24:00") {
    return vnWallToUtc(shiftDateKey(dateKey, 1), "00:00");
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) return null;
  const [hhS, mmS] = hhmm.split(":");
  const hh = Number(hhS);
  const mm = Number(mmS ?? 0);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  const yStr = m[1]!;
  const moStr = m[2]!;
  const dStr = m[3]!;
  const hhStr = String(hh).padStart(2, "0");
  const mmStr = String(mm).padStart(2, "0");
  return new Date(
    `${yStr}-${moStr}-${dStr}T${hhStr}:${mmStr}:00+07:00`,
  );
}

/** Start of the 30-minute Vietnam slot on `vnDateKey`, or null if invalid. */
export function studyVnSlotStartUtc(
  vnDateKey: string,
  vnSlot: string,
): Date | null {
  const parts = vnSlot.split(" - ");
  if (parts.length !== 2) return null;
  const start = parts[0]!.trim();
  if (!/^\d{2}:\d{2}$/.test(start)) return null;
  const d = vnWallToUtc(vnDateKey, start);
  if (!d || Number.isNaN(d.getTime())) return null;
  return d;
}

export function allVnTimeSlots(): readonly string[] {
  return VN_TIME_SLOTS;
}
