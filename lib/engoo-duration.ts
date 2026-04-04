/** Parse ISO-8601 duration strings from Engoo (e.g. PT3.788312S, PT1M45.144S). */
export function parseIso8601DurationToSeconds(d: string | undefined | null): number {
  if (!d || typeof d !== "string") return 0;
  const s = d.trim();
  if (!s.startsWith("PT")) return 0;
  let sec = 0;
  const h = s.match(/(\d+(?:\.\d+)?)H/);
  const m = s.match(/(\d+(?:\.\d+)?)M/);
  const secMatch = s.match(/(\d+(?:\.\d+)?)S/);
  if (h) sec += parseFloat(h[1]) * 3600;
  if (m) sec += parseFloat(m[1]) * 60;
  if (secMatch) sec += parseFloat(secMatch[1]);
  return sec;
}
