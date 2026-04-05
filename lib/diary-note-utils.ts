/** Local calendar date as YYYY-MM-DD (no UTC shift). */
export function localDateYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Long formatted title for a diary entry from YYYY-MM-DD. */
export function formatDiaryTitle(
  diaryYmd: string,
  locale: "en" | "vi",
): string {
  const parts = diaryYmd.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    return diaryYmd;
  }
  const [y, m, d] = parts;
  const date = new Date(y!, m! - 1, d!);
  return date.toLocaleDateString(locale === "vi" ? "vi-VN" : "en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** True when title still matches the auto-generated long date string for that day. */
export function isDefaultDiaryTitle(
  title: string,
  diaryYmd: string | null,
  locale: "en" | "vi",
): boolean {
  if (!diaryYmd) {
    return false;
  }
  return title.trim() === formatDiaryTitle(diaryYmd, locale);
}

export function diaryMonthLabel(
  diaryYmd: string,
  locale: "en" | "vi",
): string {
  const parts = diaryYmd.split("-").map(Number);
  if (parts.length < 2 || parts.some((n) => !Number.isFinite(n))) {
    return diaryYmd;
  }
  const [y, m] = parts;
  const date = new Date(y!, m! - 1, 1);
  return date.toLocaleDateString(locale === "vi" ? "vi-VN" : "en-US", {
    month: "long",
    year: "numeric",
  });
}
