"use client";
import { useState, Suspense, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "react-toastify";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/components/i18n-provider";
import { PASSWORD_MIN, PASSWORD_MAX } from "@/lib/auth-credentials";
function ResetBrandHeader() {
    const { t } = useI18n();
    return (<Link href="/" className="mb-8 block text-center transition hover:opacity-80">
      <span className="block text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">{t("appTitle")}</span>
      <span className="mt-1 block text-sm text-zinc-500 dark:text-zinc-400">{t("appTaglinePrimary")}</span>
    </Link>);
}
function ResetPasswordFormInner() {
    const { t } = useI18n();
    const router = useRouter();
    const { openAuthModal, openAuthModalForgotPassword } = useAuth();
    const searchParams = useSearchParams();
    const urlToken = searchParams.get("token")?.trim() ?? "";
    const hasToken = Boolean(urlToken);
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [success, setSuccess] = useState(false);
    const [invalid, setInvalid] = useState(!hasToken);
    useEffect(() => {
        setInvalid(!hasToken);
    }, [hasToken]);
    function goToLogIn() {
        router.push("/");
        openAuthModal();
    }
    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!urlToken) {
            setInvalid(true);
            return;
        }
        if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
            toast.error(t("toastPasswordRequirements"));
            return;
        }
        if (password !== confirmPassword) {
            toast.error(t("toastPasswordMismatch"));
            return;
        }
        setLoading(true);
        try {
            const res = await fetch("/api/auth/reset-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: urlToken, password, confirmPassword }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                const msg = typeof data.error === "string" ? data.error : "";
                const linkBad = res.status === 400 &&
                    (msg === "Invalid or expired reset link" || msg === "Reset token is required");
                if (linkBad) {
                    setInvalid(true);
                }
                else {
                    toast.error(msg || t("profilePasswordError"));
                }
                return;
            }
            setSuccess(true);
        }
        finally {
            setLoading(false);
        }
    }
    const shell = (inner: ReactNode) => (<div className="w-full max-w-md">
      <ResetBrandHeader/>
      <div className="rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/90 sm:p-8">
        {inner}
      </div>
    </div>);
    if (invalid) {
        return shell(<>
      <h1 className="mb-2 text-2xl font-bold text-zinc-900 dark:text-white">{t("resetPasswordInvalidTitle")}</h1>
      <p className="mb-8 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{t("resetPasswordInvalidBody")}</p>
      <div className="flex flex-col gap-3">
        <button type="button" onClick={() => openAuthModalForgotPassword()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-3.5 text-base font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
          {t("resetPasswordRequestNewLink")}
        </button>
        <button type="button" onClick={goToLogIn} className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-3.5 text-base font-semibold text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100">
          {t("backToLogin")}
        </button>
      </div>
    </>);
    }
    if (success) {
        return shell(<div className="text-center">
      <div className="mb-6 flex justify-center">
        <CheckCircle2 className="h-16 w-16 text-emerald-600 dark:text-emerald-400" aria-hidden/>
      </div>
      <h1 className="mb-2 text-2xl font-bold text-zinc-900 dark:text-white">{t("resetPasswordSuccessTitle")}</h1>
      <p className="mb-8 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{t("resetPasswordSuccessBody")}</p>
      <button type="button" onClick={goToLogIn} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-3.5 text-base font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
        {t("resetPasswordGoToLogin")}
      </button>
    </div>);
    }
    return shell(<>
      <h1 className="mb-8 text-2xl font-bold text-zinc-900 dark:text-white">{t("resetPasswordTitle")}</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="reset-pass" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">{t("profileNewPassword")}</label>
          <div className="relative">
            <input id="reset-pass" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX} className="w-full rounded-xl border-2 border-zinc-200 bg-white py-3 pl-4 pr-12 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100" autoComplete="new-password"/>
            <button type="button" tabIndex={-1} onClick={() => setShowPassword((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label={showPassword ? t("hidePassword") : t("showPassword")}>
              {showPassword ? <EyeOff className="h-5 w-5"/> : <Eye className="h-5 w-5"/>}
            </button>
          </div>
        </div>
        <div>
          <label htmlFor="reset-confirm" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">{t("profileConfirmPassword")}</label>
          <div className="relative">
            <input id="reset-confirm" type={showConfirmPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX} className="w-full rounded-xl border-2 border-zinc-200 bg-white py-3 pl-4 pr-12 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100" autoComplete="new-password"/>
            <button type="button" tabIndex={-1} onClick={() => setShowConfirmPassword((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label={showConfirmPassword ? t("hidePassword") : t("showPassword")}>
              {showConfirmPassword ? <EyeOff className="h-5 w-5"/> : <Eye className="h-5 w-5"/>}
            </button>
          </div>
        </div>
        <button type="submit" disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-3 font-semibold text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900">
          {loading ? (<>
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden/>
              <span>{t("pleaseWait")}</span>
            </>) : t("resetPasswordSubmit")}
        </button>
      </form>
    </>);
}
export function ResetPasswordForm() {
    const { t } = useI18n();
    return (<Suspense fallback={<div className="p-8 text-center text-zinc-600 dark:text-zinc-400">{t("loading")}</div>}>
      <ResetPasswordFormInner />
    </Suspense>);
}
