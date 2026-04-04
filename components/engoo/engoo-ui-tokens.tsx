import type { ReactNode } from "react";
import { clsx } from "clsx";

/** Matches app shell `bg-[#F6F7F9]` — use Tailwind on wrappers, not this constant. */
export const engooPageBg = "#F6F7F9";

/** Engoo-style solid rules for vocabulary / content tables (light UI). */
export const engooTableBorderClass =
  "border-zinc-300 dark:border-zinc-600";

/** Engoo Daily News vocabulary tip bar: pale green panel, dark green copy. */
export const engooInstructionBannerClass =
  "border-l-[3px] border-[#8BC34A] bg-[#eef6e8] px-4 py-3.5 text-[15px] leading-relaxed text-[#2d4a22] dark:border-l-emerald-600/70 dark:bg-emerald-950/35 dark:text-emerald-100/90";

export function EngooInstructionBanner({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx(engooInstructionBannerClass, className)}>{children}</div>
  );
}
