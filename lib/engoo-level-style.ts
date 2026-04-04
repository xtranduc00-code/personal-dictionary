/** Engoo-style level badge colors (design spec). */
export function engooLevelBadgeBackground(level: number): string {
  if (level >= 1 && level <= 4) return "#4CAF50";
  if (level >= 5 && level <= 7) return "#FF9800";
  return "#F44336";
}
