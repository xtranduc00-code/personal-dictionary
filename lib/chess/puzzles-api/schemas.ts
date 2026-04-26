import { z } from "zod";
import {
  VALID_DIFFICULTIES,
  VALID_LEVELS,
  VALID_PROGRESS,
  VALID_SORTS,
} from "./constants";

/** Helpers ─────────────────────────────────────────────────────────────── */

const csv = (max = 16) =>
  z
    .string()
    .optional()
    .transform((s) =>
      (s ?? "")
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
        .slice(0, max),
    );

const intInRange = (min: number, max: number, fallback: number) =>
  z
    .string()
    .optional()
    .transform((s) => {
      const n = Number.parseInt(s ?? "", 10);
      if (!Number.isFinite(n)) return fallback;
      return Math.min(max, Math.max(min, n));
    });

/** /api/chess/puzzles/library query params ─────────────────────────────── */

export const LibraryQuerySchema = z.object({
  level: z
    .enum([...VALID_LEVELS] as [string, ...string[]])
    .optional(),
  ratingMin: z
    .string()
    .optional()
    .transform((s) => {
      const n = Number.parseInt(s ?? "", 10);
      return Number.isFinite(n) ? n : undefined;
    }),
  ratingMax: z
    .string()
    .optional()
    .transform((s) => {
      const n = Number.parseInt(s ?? "", 10);
      return Number.isFinite(n) ? n : undefined;
    }),
  themes: csv(),
  openings: csv(),
  progress: z.enum(VALID_PROGRESS).optional().default("all"),
  sort: z.enum(VALID_SORTS).optional().default("newest"),
  limit: intInRange(1, 100, 20),
  offset: intInRange(0, 1_000_000, 0),
  // Legacy single-theme param. Kept for backwards compatibility.
  theme: z.string().trim().optional().default(""),
});

export type LibraryQuery = z.infer<typeof LibraryQuerySchema>;

/** /api/chess/puzzles/next query params ────────────────────────────────── */

export const NextQuerySchema = z.object({
  // Either a theme key or an opening key — Lichess uses one umbrella param.
  angle: z.string().trim().optional().default(""),
  difficulty: z
    .enum(VALID_DIFFICULTIES)
    .optional()
    .default("normal"),
  // The user's current puzzle rating, so we can offset relative to it.
  // If absent, we fall back to DEFAULT_PUZZLE_RATING.
  rating: z
    .string()
    .optional()
    .transform((s) => {
      const n = Number.parseInt(s ?? "", 10);
      return Number.isFinite(n) ? n : undefined;
    }),
});

export type NextQuery = z.infer<typeof NextQuerySchema>;

/** Unified validation error response shape. */
export function flatZodError(err: z.ZodError): { error: string; fields: Record<string, string> } {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) {
    const path = issue.path.join(".") || "_";
    if (!fields[path]) fields[path] = issue.message;
  }
  return { error: "Invalid request", fields };
}
