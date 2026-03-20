"use client";
import { useEffect, useState } from "react";
import { X, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "react-toastify";
import { useAuth, getAuthToken } from "@/lib/auth-context";
import { useI18n } from "@/components/i18n-provider";
import { PASSWORD_MIN, PASSWORD_MAX } from "@/lib/auth-credentials";
export function SecurityModal({ open, onClose }: {
    open: boolean;
    onClose: () => void;
}) {
    const { t } = useI18n();
    const { user, refreshUser, openAuthModalForgotPassword } = useAuth();
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showCur, setShowCur] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showCf, setShowCf] = useState(false);
    const [passwordLoading, setPasswordLoading] = useState(false);
    useEffect(() => {
        if (!open) {
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            setShowCur(false);
            setShowNew(false);
            setShowCf(false);
        }
    }, [open]);
    useEffect(() => {
        if (!open)
            return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape")
                onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);
    if (!open || !user) {
        return null;
    }
    const hasPw = Boolean(user.hasPassword);
    const email = user.email?.trim() || null;
    async function handleChangePassword(e: React.FormEvent) {
        e.preventDefault();
        if (!hasPw)
            return;
        if (newPassword.length < PASSWORD_MIN || newPassword.length > PASSWORD_MAX) {
            toast.error(t("toastPasswordRequirements"));
            return;
        }
        if (newPassword !== confirmPassword) {
            toast.error(t("toastPasswordMismatch"));
            return;
        }
        setPasswordLoading(true);
        try {
            const token = getAuthToken();
            if (!token) {
                toast.error(t("authSessionExpired"));
                return;
            }
            const res = await fetch("/api/auth/change-password", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    currentPassword,
                    newPassword,
                    confirmPassword,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error(typeof data.error === "string" ? data.error : t("profilePasswordError"));
                return;
            }
            toast.success(t("profilePasswordChanged"));
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            await refreshUser();
            onClose();
        }
        finally {
            setPasswordLoading(false);
        }
    }
    return (<div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm" onClick={onClose} role="presentation">
      <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-zinc-200/80 bg-white/95 p-6 shadow-2xl dark:border-zinc-700/60 dark:bg-zinc-900/95" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="security-modal-title">
        <div className="mb-5 flex items-start justify-between gap-3 border-b border-zinc-200 pb-4 dark:border-zinc-700">
          <div className="min-w-0">
            <h2 id="security-modal-title" className="text-lg font-bold text-zinc-900 dark:text-white">
              {t("profileSectionSecurity")}
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{t("profileChangePassword")}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label={t("close")}>
            <X className="h-5 w-5"/>
          </button>
        </div>
        {hasPw ? (<>
            <p id="security-modal-scope" className="mb-4 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">{t("profilePasswordSeparateHint")}</p>
            <form onSubmit={handleChangePassword} className="space-y-4" aria-describedby="security-modal-scope">
              <div>
                <label htmlFor="sec-cur" className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">{t("profileCurrentPassword")}</label>
                <div className="relative">
                  <input id="sec-cur" type={showCur ? "text" : "password"} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="w-full rounded-xl border-2 border-zinc-200 bg-zinc-50 py-2.5 pl-3 pr-10 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100" autoComplete="current-password"/>
                  <button type="button" tabIndex={-1} onClick={() => setShowCur((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-500" aria-label={showCur ? t("hidePassword") : t("showPassword")}>
                    {showCur ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}
                  </button>
                </div>
                <p className="mt-1.5">
                  <button type="button" onClick={() => {
                    onClose();
                    openAuthModalForgotPassword({ prefillEmail: email });
                }} className="text-left text-xs font-semibold text-zinc-700 underline underline-offset-2 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100">
                    {t("forgotPassword")}
                  </button>
                </p>
              </div>
              <div>
                <label htmlFor="sec-new" className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">{t("profileNewPassword")}</label>
                <div className="relative">
                  <input id="sec-new" type={showNew ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full rounded-xl border-2 border-zinc-200 bg-zinc-50 py-2.5 pl-3 pr-10 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100" autoComplete="new-password"/>
                  <button type="button" tabIndex={-1} onClick={() => setShowNew((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-500" aria-label={showNew ? t("hidePassword") : t("showPassword")}>
                    {showNew ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}
                  </button>
                </div>
              </div>
              <div>
                <label htmlFor="sec-cf" className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">{t("profileConfirmPassword")}</label>
                <div className="relative">
                  <input id="sec-cf" type={showCf ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full rounded-xl border-2 border-zinc-200 bg-zinc-50 py-2.5 pl-3 pr-10 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100" autoComplete="new-password"/>
                  <button type="button" tabIndex={-1} onClick={() => setShowCf((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-500" aria-label={showCf ? t("hidePassword") : t("showPassword")}>
                    {showCf ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={passwordLoading} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 py-2.5 text-sm font-semibold text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900">
                {passwordLoading ? (<>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden/>
                    {t("pleaseWait")}
                  </>) : t("profileSavePassword")}
              </button>
            </form>
          </>) : (<div className="space-y-3">
            <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              {email ? t("profileSetPasswordViaForgot") : t("profileNoPasswordNoEmail")}
            </p>
            {email ? (<button type="button" onClick={() => {
                onClose();
                openAuthModalForgotPassword({ prefillEmail: email });
            }} className="text-sm font-semibold text-zinc-700 underline underline-offset-2 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100">
                {t("forgotPassword")}
              </button>) : null}
          </div>)}
      </div>
    </div>);
}
