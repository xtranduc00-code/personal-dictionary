export function engooLevelLabelFromNumber(level: number): string {
  if (level >= 1 && level <= 4) return "Beginner";
  if (level >= 5 && level <= 7) return "Intermediate";
  return "Advanced";
}
