/**
 * Light normalization pass on raw study-kit summary markdown before display.
 * Collapses excessive blank lines and trims trailing whitespace per line.
 */
export function normalizeStudyKitSheetMarkdown(markdown: string): string {
    if (!markdown) return markdown;
    return markdown
        .split("\n")
        .map((line) => line.trimEnd())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}
