/**
 * Engoo embeds pronunciation / display hints as `{{prn:shown|spoken}}`.
 * For reading UI, keep the left segment (before `|`); if no pipe, use whole inner text.
 */
export function stripEngooPrnPlaceholders(raw: string): string {
  if (!raw.includes("{{prn:")) return raw;
  return raw.replace(/\{\{prn:([^}]+)\}\}/gi, (_, inner: string) => {
    const pipe = inner.indexOf("|");
    const display =
      pipe === -1 ? inner : inner.slice(0, Math.max(0, pipe));
    return display.trim();
  });
}

export type EngooItalicRange = { start: number; end: number };

/**
 * Engoo article strings often use Markdown-style `_Publication Name_` for
 * italics. Returns display plain text (no underscores) and ranges in that plain
 * string to wrap with `<em>` — matches browser `textContent` offsets for
 * highlights.
 */
export function parseEngooUnderscoreItalic(raw: string): {
  plain: string;
  italicRanges: EngooItalicRange[];
} {
  const text = stripEngooPrnPlaceholders(raw);
  const italicRanges: EngooItalicRange[] = [];
  let plain = "";
  const re = /_([^_]+)_/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    plain += text.slice(last, m.index);
    const start = plain.length;
    plain += m[1];
    italicRanges.push({ start, end: plain.length });
    last = re.lastIndex;
  }
  plain += text.slice(last);
  return { plain, italicRanges };
}

/** IPA shown as `/fɛr/` whether API sends `fɛr`, `/fɛr`, or `/fɛr/`. */
export function formatEngooPhoneticForDisplay(raw: string): string {
  const inner = raw.trim().replace(/^\/+/, "").replace(/\/+$/, "").trim();
  if (!inner) return "";
  return `/${inner}/`;
}
