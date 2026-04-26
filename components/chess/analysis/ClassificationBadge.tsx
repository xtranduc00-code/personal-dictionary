"use client";

import {
  Check,
  ThumbsUp,
  Minus,
  AlertTriangle,
  X,
  XCircle,
  Sparkles,
  Target,
  BookOpen,
  Lock,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { Classification } from "@/lib/chess/analysis/wintrchess/constants/Classification";

export interface ClassificationStyle {
  label: string;
  short: string;
  icon: LucideIcon;
  /** Solid hex color used for the badge background (label colour). */
  solid: string;
  /** Square highlight overlay rendered through react-chessboard squareStyles. */
  squareColor: string;
  /** Tailwind-on-hover row colour for the stats table. */
  rowText: string;
}

// Palette: distinct hue families instead of muddled green→olive→amber gradient.
//   - Cyan / blue: special "noteworthy" moves (Brilliant, Critical)
//   - Green tones: good moves (Best deep, Excellent light) — same hue, different
//     intensity so the eye reads them as a tier rather than two unrelated colours
//   - Pure zinc gray: neutral "Okay" — clearly off the green axis
//   - Warm tones: bad moves (Inaccuracy yellow, Mistake orange, Blunder red)
//   - Brown / indigo: book / forced moves
export const CLASSIFICATION_STYLES: Record<Classification, ClassificationStyle> = {
  [Classification.BRILLIANT]: {
    label: "Brilliant",
    short: "!!",
    icon: Sparkles,
    solid: "#06b6d4", // cyan-500
    squareColor: "rgba(6, 182, 212, 0.55)",
    rowText: "text-cyan-600 dark:text-cyan-300",
  },
  [Classification.CRITICAL]: {
    label: "Critical",
    short: "!",
    icon: Target,
    solid: "#3b82f6", // blue-500
    squareColor: "rgba(59, 130, 246, 0.50)",
    rowText: "text-blue-600 dark:text-blue-300",
  },
  [Classification.BEST]: {
    label: "Best",
    short: "★",
    icon: Check,
    solid: "#059669", // emerald-600
    squareColor: "rgba(5, 150, 105, 0.55)",
    rowText: "text-emerald-600 dark:text-emerald-300",
  },
  [Classification.EXCELLENT]: {
    label: "Excellent",
    short: "✓",
    icon: ThumbsUp,
    solid: "#34d399", // emerald-400 — same hue, lighter
    squareColor: "rgba(52, 211, 153, 0.45)",
    rowText: "text-emerald-500 dark:text-emerald-200",
  },
  [Classification.OKAY]: {
    label: "Okay",
    short: "·",
    icon: Minus,
    solid: "#71717a", // zinc-500 — pure gray, off the green axis
    squareColor: "rgba(113, 113, 122, 0.40)",
    rowText: "text-zinc-500 dark:text-zinc-400",
  },
  [Classification.INACCURACY]: {
    label: "Inaccuracy",
    short: "?!",
    icon: AlertTriangle,
    solid: "#f59e0b", // amber-500
    squareColor: "rgba(245, 158, 11, 0.55)",
    rowText: "text-amber-600 dark:text-amber-300",
  },
  [Classification.MISTAKE]: {
    label: "Mistake",
    short: "?",
    icon: X,
    solid: "#ea580c", // orange-600
    squareColor: "rgba(234, 88, 12, 0.55)",
    rowText: "text-orange-600 dark:text-orange-300",
  },
  [Classification.BLUNDER]: {
    label: "Blunder",
    short: "??",
    icon: XCircle,
    solid: "#dc2626", // red-600
    squareColor: "rgba(220, 38, 38, 0.55)",
    rowText: "text-red-600 dark:text-red-300",
  },
  [Classification.THEORY]: {
    label: "Theory",
    short: "📖",
    icon: BookOpen,
    solid: "#b45309", // amber-700 (book brown)
    squareColor: "rgba(180, 83, 9, 0.40)",
    rowText: "text-amber-700 dark:text-amber-200",
  },
  [Classification.FORCED]: {
    label: "Forced",
    short: "□",
    icon: Lock,
    solid: "#6366f1", // indigo-500 — distinct from gray Okay
    squareColor: "rgba(99, 102, 241, 0.40)",
    rowText: "text-indigo-600 dark:text-indigo-300",
  },
  [Classification.RISKY]: {
    label: "Risky",
    short: "?!",
    icon: Zap,
    solid: "#e11d48", // rose-600
    squareColor: "rgba(225, 29, 72, 0.50)",
    rowText: "text-rose-600 dark:text-rose-300",
  },
};

export function ClassificationBadge({
  classification,
  size = 20,
  className = "",
}: {
  classification: Classification;
  /** Outer pixel size; icon scales to ~60% of this. */
  size?: number;
  className?: string;
}) {
  const style = CLASSIFICATION_STYLES[classification];
  const Icon = style.icon;
  return (
    <span
      title={style.label}
      className={`inline-flex shrink-0 items-center justify-center rounded-full ring-1 ring-white/80 dark:ring-zinc-900/80 ${className}`.trim()}
      style={{ width: size, height: size, background: style.solid }}
    >
      <Icon className="text-white" style={{ width: size * 0.6, height: size * 0.6 }} aria-hidden />
    </span>
  );
}
