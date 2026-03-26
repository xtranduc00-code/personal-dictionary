/**
 * Engnovate-hosted MP3s use varying /uploads/YEAR/MON/ and filenames per book/test.
 * Used as fallback when R2 (or local) does not serve the file (e.g. missing part 4).
 */
const ENGNOVATE_BASE = "https://engnovate.com/wp-content/uploads";

/** YYYY/MM folder per Cambridge book (from live HTML on engnovate). */
const UPLOAD_SUBDIR: Record<number, string> = {
  10: "2023/07",
  11: "2023/07",
  12: "2023/07",
  13: "2023/07",
  14: "2023/07",
  15: "2023/12",
  16: "2023/07",
  17: "2023/07",
  18: "2023/08",
  19: "2024/08",
  20: "2025/07",
};

/**
 * Ordered candidates: try in order until one loads (see AudioPlayer onError chain).
 */
export function engnovateListeningAudioCandidates(
  book: number,
  testNum: number,
  part: number,
): string[] {
  const sub = UPLOAD_SUBDIR[book];
  if (!sub || part < 1 || part > 4) return [];

  const base = `${ENGNOVATE_BASE}/${sub}/`;

  if (book === 10) {
    return [
      `${base}ielts-listening-testscambridge-ielts-${book}-academic-listening-${testNum}-audio-${part}.mp3`,
    ];
  }

  const stem = `cambridge-ielts-${book}-academic-listening-${testNum}`;
  if (part === 1) {
    return [
      `${base}${stem}-audio-1.mp3`,
      `${base}${stem}-audio-part-1.mp3`,
      `${base}${stem}-audio1.mp3`,
    ];
  }
  return [
    `${base}${stem}-audio-${part}.mp3`,
    `${base}${stem}-audio-part-${part}.mp3`,
  ];
}
