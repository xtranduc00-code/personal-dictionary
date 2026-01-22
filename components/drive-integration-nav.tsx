"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signIn, signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { MoreHorizontal, Plug, RefreshCw, Unplug } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { useAuth } from "@/lib/auth-context";
type DriveSessionUser = {
    email?: string | null;
};
type DriveIntegrationNavBlockProps = {
    onLinkClick?: () => void;
};
export function DriveIntegrationNavBlock({ onLinkClick, }: DriveIntegrationNavBlockProps) {
    const pathname = usePathname();
    const [driveUser, setDriveUser] = useState<DriveSessionUser | null>(null);
    const [driveLoading, setDriveLoading] = useState(true);
    useEffect(() => {
        let cancelled = false;
        setDriveLoading(true);
        fetch("/api/drive-auth/session", { credentials: "include" })
            .then((r) => (r.ok ? r.json() : null))
            .then((data: {
            user?: DriveSessionUser;
        } | null) => {
            if (!cancelled)
                setDriveUser(data?.user?.email ? data.user : null);
        })
            .catch(() => {
            if (!cancelled)
                setDriveUser(null);
        })
            .finally(() => {
            if (!cancelled)
                setDriveLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [pathname]);
    const { user, isLoading: authLoading } = useAuth();
    const router = useRouter();
    const { t } = useI18n();
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        function close(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpen(false);
            }
        }
        if (menuOpen)
            document.addEventListener("click", close);
        return () => document.removeEventListener("click", close);
    }, [menuOpen]);
    if (authLoading) {
        return (<div className="mx-3 mt-2 rounded-lg border border-dashed border-zinc-200 px-3 py-2 text-xs text-zinc-400 dark:border-zinc-600">
        {t("loading")}
      </div>);
    }
    if (!user) {
        return (<div className="mx-3 mt-2 rounded-lg border border-zinc-200/80 bg-zinc-50/80 px-3 py-2.5 dark:border-zinc-700/80 dark:bg-zinc-900/40">
        <p className="text-center text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          {t("driveSidebarLoginHint")}
        </p>
      </div>);
    }
    if (driveLoading) {
        return (<div className="mx-3 mt-2 rounded-lg border border-dashed border-zinc-200 px-3 py-2 text-xs text-zinc-400 dark:border-zinc-600">
        {t("loading")}
      </div>);
    }
    if (driveUser?.email) {
        return (<div className="mx-3 mt-2 rounded-xl border border-zinc-200/80 bg-zinc-50/80 px-3 py-2.5 dark:border-zinc-700/80 dark:bg-zinc-900/50">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
              {t("driveIntegrationTitle")}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-600 dark:bg-emerald-500/[0.12] dark:text-emerald-400/95">
                {t("driveStatusConnected")}
              </span>
            </div>
            <p className="mt-1 truncate text-xs font-medium text-zinc-800 dark:text-zinc-100" title={driveUser.email ?? undefined}>
              {driveUser.email}
            </p>
          </div>
          <div className="relative shrink-0" ref={menuRef}>
            <button type="button" className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-200/70 hover:text-zinc-600 dark:hover:bg-zinc-700/80 dark:hover:text-zinc-300" aria-label={t("driveIntegrationMenuAria")} aria-expanded={menuOpen} onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((o) => !o);
            }}>
              <MoreHorizontal className="h-4 w-4"/>
            </button>
            {menuOpen ? (<div className="absolute right-0 top-full z-[100] mt-1.5 min-w-[188px] overflow-hidden rounded-xl border border-zinc-200/90 bg-white py-1 shadow-xl ring-1 ring-black/5 dark:border-zinc-600 dark:bg-zinc-900 dark:ring-white/5" role="menu">
                <p className="px-3 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  {t("driveMenuGroupPrimary")}
                </p>
                <button type="button" role="menuitem" className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-medium text-zinc-800 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800" onClick={() => {
                    setMenuOpen(false);
                    router.refresh();
                }}>
                  <RefreshCw className="h-3.5 w-3.5 shrink-0 text-zinc-500 dark:text-zinc-400"/>
                  {t("driveActionRefreshFiles")}
                </button>
                <div className="my-1 border-t border-zinc-100 dark:border-zinc-700/80"/>
                <p className="px-3 pb-1 pt-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  {t("driveMenuGroupSecondary")}
                </p>
                <button type="button" role="menuitem" className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800/80" onClick={() => {
                    setMenuOpen(false);
                    void signIn("google", {
                        callbackUrl: typeof window !== "undefined"
                            ? window.location.href
                            : "/drive",
                    });
                }}>
                  <Plug className="h-3.5 w-3.5 shrink-0 opacity-80"/>
                  {t("driveActionReconnectAccount")}
                </button>
                <div className="my-1 border-t border-zinc-100 dark:border-zinc-700/80"/>
                <button type="button" role="menuitem" className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/35" onClick={() => {
                    setMenuOpen(false);
                    void signOut({ callbackUrl: "/drive" });
                }}>
                  <Unplug className="h-3.5 w-3.5 shrink-0"/>
                  {t("driveActionDisconnect")}
                </button>
              </div>) : null}
          </div>
        </div>
      </div>);
    }
    return (<div className="mx-3 mt-2 rounded-lg border border-dashed border-amber-200/90 bg-amber-50/60 px-3 py-2.5 dark:border-amber-900/40 dark:bg-amber-950/25">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200/90">
        {t("driveStatusNotConnected")}
      </p>
      <p className="mt-1 text-xs leading-snug text-zinc-600 dark:text-zinc-400">
        {t("driveConnectHint")}
      </p>
      <Link href="/drive" onClick={onLinkClick} className="mt-2 inline-flex rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white">
        {t("driveConnectCta")}
      </Link>
    </div>);
}
