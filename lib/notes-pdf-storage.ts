export const NOTES_PDF_BUCKET = "notes-pdfs";

export function notesPdfStoragePath(userId: string, noteId: string): string {
  return `${userId}/${noteId}.pdf`;
}

export function sanitizePdfFileName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  const safe = trimmed.replace(/[^\w. \-()[\]]/g, "_");
  return safe.slice(0, 200) || "document.pdf";
}
