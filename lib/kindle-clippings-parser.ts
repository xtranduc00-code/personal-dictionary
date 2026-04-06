export type KindleClipping = {
  bookTitle: string;
  author: string;
  type: "highlight" | "note";
  page?: string;
  location?: string;
  text: string;
};

/**
 * Parses the content of a Kindle "My Clippings.txt" file.
 * Each entry is separated by "==========" lines.
 */
export function parseKindleClippings(content: string): KindleClipping[] {
  // Normalise Windows line endings and strip BOM characters
  const normalised = content
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\uFEFF/g, ""); // strip BOM (appears at start of many lines in Kindle files)
  const entries = normalised.split("==========").map((e) => e.trim()).filter(Boolean);
  const results: KindleClipping[] = [];

  for (const entry of entries) {
    const lines = entry.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length < 3) continue;

    // Line 0: "Book Title (Author Name)"
    const titleLine = lines[0];
    const authorMatch = titleLine.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    const bookTitle = (authorMatch ? authorMatch[1] : titleLine).trim();
    const author = authorMatch ? authorMatch[2].trim() : "";

    // Line 1: "- Your Highlight on page X | location X-X | Added on …"
    const metaLine = lines[1] ?? "";
    if (metaLine.includes("Bookmark")) continue; // skip plain bookmarks

    const type: "highlight" | "note" = metaLine.includes("Note") ? "note" : "highlight";
    const pageMatch = metaLine.match(/page\s+([^\s|]+)/i);
    const locationMatch = metaLine.match(/location\s+([^\s|]+)/i);

    // Remaining lines are the highlighted / note text
    const text = lines.slice(2).join(" ").trim();
    // Skip empty or single-character entries (e.g. accidental notes like "A")
    if (!text || text.length < 2) continue;

    results.push({
      bookTitle,
      author,
      type,
      page: pageMatch?.[1],
      location: locationMatch?.[1],
      text,
    });
  }

  return results;
}

/** Group clippings by book title. */
export function groupByBook(
  clippings: KindleClipping[],
): Map<string, KindleClipping[]> {
  const map = new Map<string, KindleClipping[]>();
  for (const c of clippings) {
    const list = map.get(c.bookTitle) ?? [];
    list.push(c);
    map.set(c.bookTitle, list);
  }
  return map;
}
