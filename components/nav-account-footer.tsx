"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogIn, LogOut, Shield, User } from "lucide-react";
import { toast } from "react-toastify";
import { useAuth, getDisplayName } from "@/lib/auth-context";
import { withAvatarCacheBust } from "@/lib/avatar-display-url";
import { useI18n } from "@/components/i18n-provider";
type NavAccountFooterProps = {
    onOpenProfile: () => void;
    onOpenSecurity: () => void;
    /** 'drawer' = mobile drawer (plain buttons); 'sidebar' = desktop row + dropdown */
    variant: "drawer" | "sidebar";
};
function AccountTrigger({ avatarMark, name, menuOpen, onToggle, ariaLabel, }: {
    avatarMark: React.ReactNode;
    name: string;
    menuOpen: boolean;
    onToggle: () => void;
    ariaLabel: string;
}) {
    return (<button type="button" onClick={onToggle} className="flex w-full items-center gap-2 rounded-lg py-2 pl-1 pr-2 text-left transition-colors hover:bg-zinc-100/90 dark:hover:bg-zinc-800/80" aria-expanded={menuOpen} aria-haspopup="true" aria-label={ariaLabel}>
      {avatarMark}
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-800 dark:text-zinc-100" title={name || undefined}>
        {name}
      </span>
      <ChevronDown className={["h-4 w-4 shrink-0 text-zinc-400 transition", menuOpen ? "rotate-180" : ""].join(" ")}/>
    </button>);
}
function AccountDropdown({ onPickProfile, onPickSecurity, onPickLogout, }: {
    onPickProfile: () => void;
    onPickSecurity: () => void;
    onPickLogout: () => void;
}) {
    const { t } = useI18n();
    const item = "flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-zinc-800 hover:bg-zinc-50 dark:text-zinc-100 dark:hover:bg-zinc-800";
    return (<div className="absolute bottom-full left-0 right-0 z-20 mb-1 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-600 dark:bg-zinc-900">
      <button type="button" onClick={onPickProfile} className={item}>
        <User className="h-4 w-4 shrink-0 opacity-70"/>
        {t("profileNavLabel")}
      </button>
      <button type="button" onClick={onPickSecurity} className={item}>
        <Shield className="h-4 w-4 shrink-0 opacity-70"/>
        {t("navMenuSecurity")}
      </button>
      <button type="button" onClick={onPickLogout} className={item}>
        <LogOut className="h-4 w-4 shrink-0 opacity-70"/>
        {t("logOutApp")}
      </button>
    </div>);
}
export function NavAccountFooter({ onOpenProfile, onOpenSecurity, variant }: NavAccountFooterProps) {
    const { t } = useI18n();
    const { user, isLoading: authLoading, signOut, openAuthModal, avatarDisplayRev } = useAuth();
    const [menuOpen, setMenuOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!menuOpen) {
            return;
        }
        const onDoc = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
                setMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, [menuOpen]);
    if (authLoading) {
        return null;
    }
    const initial = (getDisplayName(user)?.trim() || "?").slice(0, 1).toUpperCase();
    const avatarSrc = withAvatarCacheBust(user?.avatarUrl, avatarDisplayRev);
    const avatarMark = avatarSrc ? (<img src={avatarSrc} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-zinc-200 dark:ring-zinc-600"/>) : (<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-sm font-semibold text-zinc-800 dark:bg-zinc-600 dark:text-zinc-100">
          {initial}
        </span>);
    const name = getDisplayName(user) || "";
    const closeAnd = (fn: () => void) => {
        setMenuOpen(false);
        fn();
    };
    if (variant === "drawer") {
        return (<div className="mt-4 shrink-0 border-t border-zinc-200 pt-4 dark:border-zinc-700">
          {user ? (<div className="relative" ref={wrapRef}>
              <AccountTrigger avatarMark={avatarMark} name={name} menuOpen={menuOpen} onToggle={() => setMenuOpen((o) => !o)} ariaLabel={t("profileOpenMenuAria")}/>
              {menuOpen ? (<AccountDropdown onPickProfile={() => closeAnd(onOpenProfile)} onPickSecurity={() => closeAnd(onOpenSecurity)} onPickLogout={() => {
                    closeAnd(() => {
                        signOut();
                        toast.success(t("toastLoggedOut"));
                    });
                }}/>) : null}
            </div>) : (<button type="button" onClick={() => openAuthModal()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 py-2.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
              <LogIn className="h-4 w-4"/>
              {t("logIn")}
            </button>)}
        </div>);
    }
    return (<div className="mt-4 shrink-0 border-t border-zinc-200 pt-3 dark:border-zinc-700">
      {user ? (<div className="relative" ref={wrapRef}>
          <AccountTrigger avatarMark={avatarMark} name={name} menuOpen={menuOpen} onToggle={() => setMenuOpen((o) => !o)} ariaLabel={t("profileOpenMenuAria")}/>
          {menuOpen ? (<AccountDropdown onPickProfile={() => closeAnd(onOpenProfile)} onPickSecurity={() => closeAnd(onOpenSecurity)} onPickLogout={() => {
                closeAnd(() => {
                    signOut();
                    toast.success(t("toastLoggedOut"));
                });
            }}/>) : null}
        </div>) : (<button type="button" onClick={() => openAuthModal()} className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white py-2.5 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700">
          <LogIn className="h-4 w-4"/>
          {t("logIn")}
        </button>)}
    </div>);
}
