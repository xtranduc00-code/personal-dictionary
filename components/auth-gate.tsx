"use client";
import { LogIn, Lock } from "lucide-react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/components/i18n-provider";
const PORTFOLIO_PUBLIC = new Set(["/", "/profile", "/contact", "/about", "/resume"]);
/** Must render children while logged out (e.g. password reset link). */
const AUTH_FLOW_PUBLIC = new Set(["/reset-password"]);
function isPublicPath(pathname: string | null) {
    if (!pathname)
        return false;
    if (PORTFOLIO_PUBLIC.has(pathname))
        return true;
    if (AUTH_FLOW_PUBLIC.has(pathname))
        return true;
    return false;
}
export function AuthGate({ children }: {
    children: React.ReactNode;
}) {
    const { t } = useI18n();
    const pathname = usePathname();
    const { user, isLoading, openAuthModal } = useAuth();
    if (isPublicPath(pathname)) {
        return (<div className="flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col md:min-h-0">
        {children}
      </div>);
    }
    /** Chỉ chặn khi chưa có user từ session cache — tránh kẹt Loading khi `/api/auth/me` treo nhưng đã có token + user trong localStorage. */
    if (isLoading && !user) {
        return (<div className="flex flex-1 items-center justify-center px-4 py-12">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{t("loading")}</p>
      </div>);
    }
    if (!user) {
        return (<div className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <div className="flex max-w-sm flex-col items-center gap-8">
          <div className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-2xl bg-zinc-100 ring-1 ring-zinc-200/80 dark:bg-zinc-800/50 dark:ring-zinc-700/60" aria-hidden>
            <Lock className="h-9 w-9 text-zinc-400 dark:text-zinc-500" strokeWidth={1.5}/>
          </div>
          <div className="space-y-2">
            <p className="text-lg font-semibold tracking-tight text-zinc-800 dark:text-zinc-100">
              {t("logInToUseApp")}
            </p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {t("authGateEmptySubtext")}
            </p>
          </div>
          <button type="button" onClick={() => openAuthModal()} className="inline-flex items-center gap-2 rounded-xl border border-zinc-800/80 bg-[#1f1f23] px-8 py-3.5 text-base font-semibold text-white transition hover:bg-[#2a2a2f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-50 dark:border-white/10 dark:bg-[#18181b] dark:focus-visible:ring-zinc-500/30 dark:focus-visible:ring-offset-zinc-950 dark:hover:bg-[#18181b] dark:hover:shadow-[0_0_0_1px_rgba(255,255,255,0.12),0_12px_32px_rgba(0,0,0,0.45)]">
            <LogIn className="h-5 w-5"/>
            {t("logIn")}
          </button>
        </div>
      </div>);
    }
    return (<div className="flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col md:min-h-0">
      {children}
    </div>);
}
