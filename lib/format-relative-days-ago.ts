/** RSS pubDate or ISO-ish strings → “TODAY” / “N DAYS AGO”. */
export function formatRelativeDaysAgo(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const days = Math.floor((Date.now() - t) / 86_400_000);
  if (days < 0) return "";
  if (days === 0) return "TODAY";
  if (days === 1) return "1 DAY AGO";
  return `${days} DAYS AGO`;
}
