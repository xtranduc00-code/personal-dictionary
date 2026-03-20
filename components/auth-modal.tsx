"use client";
import { useState, useEffect, useCallback } from "react";
import { X, Eye, EyeOff, Loader2, Mail, CheckCircle2, RefreshCw } from "lucide-react";
import { toast } from "react-toastify";
import { useAuth, getLastStoredUsername } from "@/lib/auth-context";
import { useI18n } from "@/components/i18n-provider";
import type { TranslationKey } from "@/lib/i18n";
import { normalizeUsername, USERNAME_MIN, USERNAME_MAX, PASSWORD_MIN, PASSWORD_MAX, emailValidationError, normalizeEmail, } from "@/lib/auth-credentials";
import { maskEmailForDisplay } from "@/lib/mask-email";

const FORGOT_MIN_UI_MS = 650;
const FORGOT_RESEND_COOLDOWN_SEC = 45;
type Mode = "login" | "register" | "forgot";
type FieldErrors = {
    loginIdentifier?: string;
    username?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
};
function usernameErrorMessage(raw: string, t: (k: TranslationKey) => string): string | null {
    const u = normalizeUsername(raw);
    if (!u) {
        return t("toastEnterUsername");
    }
    if (u.length < USERNAME_MIN || u.length > USERNAME_MAX) {
        return t("toastUsernameLength");
    }
    if (!/^[a-z0-9_]+$/.test(u)) {
        return t("toastUsernameChars");
    }
    return null;
}
function loginIdentifierError(raw: string, t: (k: TranslationKey) => string): string | null {
    const trimmed = raw.trim();
    if (!trimmed) {
        return t("toastEnterLoginIdentifier");
    }
    if (trimmed.includes("@")) {
        return emailValidationError(trimmed) ? t("toastInvalidEmail") : null;
    }
    return usernameErrorMessage(trimmed, t);
}
function registerEmailFieldError(raw: string, t: (k: TranslationKey) => string): string | null {
    if (!raw.trim()) {
        return t("toastEnterEmail");
    }
    return emailValidationError(raw) ? t("toastInvalidEmail") : null;
}
function forgotEmailFieldError(raw: string, t: (k: TranslationKey) => string): string | null {
    return registerEmailFieldError(raw, t);
}
function passwordErrorMessage(password: string, t: (k: TranslationKey) => string): string | null {
    if (!password) {
        return t("toastEnterPassword");
    }
    if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
        return t("toastPasswordRequirements");
    }
    return null;
}
const inputBase = "w-full rounded-xl border-2 bg-zinc-50 px-4 py-3.5 text-base text-zinc-900 placeholder:text-zinc-400 transition-[border-color,box-shadow] duration-150 focus:outline-none dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500";
const inputOk = "border-zinc-200 focus:border-zinc-800 focus:shadow-[0_0_0_3px_rgba(24,24,27,0.14)] focus:ring-0 dark:border-zinc-600 dark:focus:border-zinc-200 dark:focus:shadow-[0_0_0_3px_rgba(255,255,255,0.14)]";
const inputErr = "border-red-500 focus:border-red-600 focus:shadow-[0_0_0_3px_rgba(239,68,68,0.22)] focus:ring-0 dark:border-red-500 dark:focus:border-red-400 dark:focus:shadow-[0_0_0_3px_rgba(248,113,113,0.18)]";
export function AuthModal() {
    const { t } = useI18n();
    const { authModalOpen, authModalStartMode, authModalBlocking, closeAuthModal, signIn, signUp, forgotPasswordPrefillEmail, } = useAuth();
    const [mode, setMode] = useState<Mode>("login");
    const [loginId, setLoginId] = useState("");
    const [regUsername, setRegUsername] = useState("");
    const [regEmail, setRegEmail] = useState("");
    const [forgotEmail, setForgotEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const [serverError, setServerError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [forgotSuccess, setForgotSuccess] = useState(false);
    const [forgotResendLoading, setForgotResendLoading] = useState(false);
    const [forgotResendCooldown, setForgotResendCooldown] = useState(0);
    const [registerSuccess, setRegisterSuccess] = useState(false);
    const resetTransientState = useCallback(() => {
        setFieldErrors({});
        setServerError(null);
        setShowPassword(false);
        setShowConfirmPassword(false);
        setForgotSuccess(false);
        setForgotResendLoading(false);
        setForgotResendCooldown(0);
        setRegisterSuccess(false);
        setLoading(false);
    }, []);
    useEffect(() => {
        if (authModalOpen) {
            setLoginId(getLastStoredUsername() ?? "");
            setRegUsername("");
            setRegEmail("");
            setForgotEmail(authModalStartMode === "forgot" && forgotPasswordPrefillEmail ? forgotPasswordPrefillEmail : "");
            setPassword("");
            setConfirmPassword("");
            setMode(authModalStartMode);
            resetTransientState();
        }
    }, [authModalOpen, authModalStartMode, forgotPasswordPrefillEmail, resetTransientState]);
    useEffect(() => {
        if (!forgotSuccess || forgotResendCooldown <= 0) {
            return;
        }
        const id = window.setTimeout(() => setForgotResendCooldown((c) => Math.max(0, c - 1)), 1000);
        return () => window.clearTimeout(id);
    }, [forgotSuccess, forgotResendCooldown]);
    async function submitForgotPasswordRequest(isResend: boolean): Promise<void> {
        const email = normalizeEmail(forgotEmail);
        if (!isResend) {
            const fe = forgotEmailFieldError(forgotEmail, t);
            if (fe) {
                setFieldErrors({ email: fe });
                return;
            }
        }
        const setBusy = (v: boolean) => {
            if (isResend) {
                setForgotResendLoading(v);
            }
            else {
                setLoading(v);
            }
        };
        setBusy(true);
        try {
            const minWait = new Promise<void>((r) => setTimeout(r, FORGOT_MIN_UI_MS));
            let res: Response;
            type ForgotPayload = {
                ok?: boolean;
                error?: string;
                debug?: {
                    userFound?: boolean;
                    mailSent?: boolean;
                    mailError?: string;
                    hint?: string;
                };
            };
            let data: ForgotPayload = {};
            try {
                const fetchResult = await Promise.all([
                    (async () => {
                        const r = await fetch("/api/auth/forgot-password", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ email }),
                        });
                        const d = (await r.json().catch(() => ({}))) as ForgotPayload;
                        return { res: r, data: d };
                    })(),
                    minWait,
                ]);
                res = fetchResult[0].res;
                data = fetchResult[0].data;
            }
            catch {
                toast.error(t("networkErrorTryAgain"));
                return;
            }
            if (res.status === 400 && typeof data.error === "string" && data.error) {
                setFieldErrors((prev) => ({ ...prev, email: data.error as string }));
                return;
            }
            if (process.env.NODE_ENV === "development" && data.debug && !data.debug.mailSent) {
                if (data.debug.mailError) {
                    console.error("[forgot-password]", data.debug.mailError);
                }
                toast.error(t("toastForgotMailFailedDev"));
                return;
            }
            toast.success(isResend ? t("toastResetEmailResent") : t("toastResetEmailSent"));
            setForgotSuccess(true);
            setForgotResendCooldown(FORGOT_RESEND_COOLDOWN_SEC);
        }
        finally {
            setBusy(false);
        }
    }
    function setLoginIdValue(v: string) {
        setLoginId(v);
        setFieldErrors((e) => ({ ...e, loginIdentifier: undefined }));
        setServerError(null);
    }
    function setRegUsernameValue(v: string) {
        setRegUsername(v);
        setFieldErrors((e) => ({ ...e, username: undefined }));
        setServerError(null);
    }
    function setRegEmailValue(v: string) {
        setRegEmail(v);
        setFieldErrors((e) => ({ ...e, email: undefined }));
        setServerError(null);
    }
    function setForgotEmailValue(v: string) {
        setForgotEmail(v);
        setFieldErrors((e) => ({ ...e, email: undefined }));
        setServerError(null);
    }
    function setPasswordValue(v: string) {
        setPassword(v);
        setFieldErrors((e) => ({ ...e, password: undefined }));
        setServerError(null);
    }
    function setConfirmPasswordValue(v: string) {
        setConfirmPassword(v);
        setFieldErrors((e) => ({ ...e, confirmPassword: undefined }));
        setServerError(null);
    }
    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setServerError(null);
        const errors: FieldErrors = {};
        if (mode === "login") {
            const lMsg = loginIdentifierError(loginId, t);
            if (lMsg) {
                errors.loginIdentifier = lMsg;
            }
        }
        else if (mode === "register") {
            const uMsg = usernameErrorMessage(regUsername, t);
            if (uMsg) {
                errors.username = uMsg;
            }
            const eMsg = registerEmailFieldError(regEmail, t);
            if (eMsg) {
                errors.email = eMsg;
            }
        }
        else {
            const fe = forgotEmailFieldError(forgotEmail, t);
            if (fe) {
                errors.email = fe;
            }
        }
        if (mode !== "forgot") {
            const pMsg = passwordErrorMessage(password, t);
            if (pMsg) {
                errors.password = pMsg;
            }
            if (mode === "register") {
                if (!confirmPassword) {
                    errors.confirmPassword = t("toastConfirmPassword");
                }
                else if (password !== confirmPassword) {
                    errors.confirmPassword = t("toastPasswordMismatch");
                }
            }
        }
        if (Object.keys(errors).length > 0) {
            setFieldErrors(errors);
            return;
        }
        if (mode === "forgot") {
            await submitForgotPasswordRequest(false);
            return;
        }
        setLoading(true);
        try {
            if (mode === "login") {
                const { error, user } = await signIn(loginId, password);
                if (error) {
                    setFieldErrors((prev) => ({ ...prev, password: error.message }));
                    return;
                }
                const display = user?.username ?? loginId.trim();
                toast.success(t("toastLoggedInAs").replace("{name}", display));
                setLoginId("");
                setPassword("");
                closeAuthModal();
            }
            else {
                const { error } = await signUp(normalizeUsername(regUsername), regEmail, password, confirmPassword);
                if (error) {
                    const msg = error.message;
                    if (/email already|Email already/i.test(msg)) {
                        setFieldErrors((prev) => ({ ...prev, email: msg }));
                    }
                    else if (/username already|Username already/i.test(msg)) {
                        setFieldErrors((prev) => ({ ...prev, username: msg }));
                    }
                    else if (/match|Match/i.test(msg)) {
                        setFieldErrors((prev) => ({ ...prev, confirmPassword: msg }));
                    }
                    else {
                        setServerError(msg);
                    }
                    return;
                }
                setRegisterSuccess(true);
                await new Promise((r) => setTimeout(r, 2200));
                setRegUsername("");
                setRegEmail("");
                setPassword("");
                setConfirmPassword("");
                setRegisterSuccess(false);
                closeAuthModal();
            }
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        if (!authModalOpen || authModalBlocking) {
            return;
        }
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                closeAuthModal();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [authModalOpen, authModalBlocking, closeAuthModal]);
    if (!authModalOpen) {
        return null;
    }
    const title = mode === "login"
        ? t("logIn")
        : mode === "register"
            ? t("signUp")
            : forgotSuccess
                ? t("authForgotSuccessTitle")
                : t("resetYourPassword");
    const overlayClass = authModalBlocking
        ? "bg-zinc-950/[0.94] dark:bg-black/92"
        : "bg-black/45 backdrop-blur-sm";
    return (<div className={`fixed inset-0 z-[120] flex items-center justify-center p-4 ${overlayClass}`} onClick={() => {
            if (!authModalBlocking) {
                closeAuthModal();
            }
        }} role={authModalBlocking ? "alertdialog" : "dialog"} aria-modal="true" aria-labelledby="auth-modal-title">
      <div className="relative w-full max-w-md flex flex-col rounded-2xl border border-zinc-200/80 bg-white/95 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.2)] backdrop-blur-xl dark:border-zinc-700/60 dark:bg-zinc-900/95 dark:shadow-[0_24px_80px_rgba(0,0,0,0.55)] dark:text-zinc-100" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between">
              <h2 id="auth-modal-title" className="text-2xl font-bold text-zinc-900 dark:text-white">
                {registerSuccess ? t("authSignUpSuccessTitle") : title}
              </h2>
              {authModalBlocking ? (<span className="h-10 w-10 shrink-0" aria-hidden/>) : (<button type="button" onClick={closeAuthModal} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200" aria-label={t("close")}>
                <X className="h-6 w-6"/>
              </button>)}
            </div>
            {registerSuccess ? (<div className="flex flex-col items-center gap-4 py-4 text-center">
                <CheckCircle2 className="h-16 w-16 text-emerald-600 dark:text-emerald-400" aria-hidden/>
                <p className="text-lg font-semibold text-zinc-900 dark:text-white">{t("authSignUpSuccessTitle")}</p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("authSignUpSuccessBody")}</p>
                <Loader2 className="h-8 w-8 animate-spin text-zinc-500" aria-label={t("pleaseWait")}/>
              </div>) : forgotSuccess ? (<div className="flex flex-col gap-4">
                <div className="flex justify-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
                    <Mail className="h-8 w-8 text-emerald-700 dark:text-emerald-300" aria-hidden/>
                  </div>
                </div>
                <p className="text-center text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {t("authForgotSuccessIntro")}
                  <span className="mx-0.5 inline-block rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-sm font-medium text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">
                    {maskEmailForDisplay(forgotEmail)}
                  </span>
                  {t("authForgotSuccessOutro")}
                </p>
                <p className="text-center text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                  {t("authForgotSpamHint")}
                </p>
                <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
                  {t("authForgotResendSub")}
                </p>
                <div className="flex flex-col gap-2 pt-1">
                  <button type="button" disabled={forgotResendLoading || forgotResendCooldown > 0} onClick={() => void submitForgotPasswordRequest(true)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700">
                    {forgotResendLoading ? (<>
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden/>
                        {t("pleaseWait")}
                      </>) : forgotResendCooldown > 0 ? t("authForgotResendWait").replace("{seconds}", String(forgotResendCooldown)) : (<>
                        <RefreshCw className="h-4 w-4 shrink-0" aria-hidden/>
                        {t("authForgotResend")}
                      </>)}
                  </button>
                  <button type="button" onClick={() => {
                    setForgotSuccess(false);
                    setForgotResendCooldown(0);
                    setMode("login");
                }} className="rounded-xl bg-zinc-900 px-4 py-3 text-base font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
                  {t("backToLogin")}
                </button>
                </div>
              </div>) : (<>
                {mode === "forgot" ? (<p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">{t("authForgotHint")}</p>) : null}
                {serverError ? (<p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200" role="alert">
                    {serverError}
                  </p>) : null}
                <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
                  {mode === "login" ? (<div>
                      <label htmlFor="auth-login-id" className="mb-2 block text-base font-semibold text-zinc-800 dark:text-zinc-200">
                        {t("loginIdentifierLabel")}
                      </label>
                      <input id="auth-login-id" type="text" value={loginId} onChange={(e) => setLoginIdValue(e.target.value)} placeholder={t("loginIdentifierPlaceholder")} autoComplete="username" aria-invalid={Boolean(fieldErrors.loginIdentifier)} aria-describedby={fieldErrors.loginIdentifier ? "auth-login-id-error" : undefined} className={`${inputBase} ${fieldErrors.loginIdentifier ? inputErr : inputOk} px-4 py-3.5`}/>
                      {fieldErrors.loginIdentifier ? (<p id="auth-login-id-error" className="mt-1.5 text-sm text-red-600 dark:text-red-400" role="alert">
                          {fieldErrors.loginIdentifier}
                        </p>) : null}
                    </div>) : null}
                  {mode === "register" ? (<>
                      <div>
                        <label htmlFor="auth-reg-username" className="mb-2 block text-base font-semibold text-zinc-800 dark:text-zinc-200">
                          {t("username")}
                        </label>
                        <input id="auth-reg-username" type="text" value={regUsername} onChange={(e) => setRegUsernameValue(e.target.value)} placeholder={t("usernamePlaceholder")} autoComplete="username" aria-invalid={Boolean(fieldErrors.username)} aria-describedby={fieldErrors.username ? "auth-reg-username-error" : undefined} className={`${inputBase} ${fieldErrors.username ? inputErr : inputOk} px-4 py-3.5`}/>
                        {fieldErrors.username ? (<p id="auth-reg-username-error" className="mt-1.5 text-sm text-red-600 dark:text-red-400" role="alert">
                            {fieldErrors.username}
                          </p>) : null}
                      </div>
                      <div>
                        <label htmlFor="auth-reg-email" className="mb-2 block text-base font-semibold text-zinc-800 dark:text-zinc-200">
                          {t("email")}
                        </label>
                        <input id="auth-reg-email" type="email" value={regEmail} onChange={(e) => setRegEmailValue(e.target.value)} placeholder={t("emailPlaceholder")} autoComplete="email" aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? "auth-reg-email-error" : undefined} className={`${inputBase} ${fieldErrors.email ? inputErr : inputOk} px-4 py-3.5`}/>
                        {fieldErrors.email ? (<p id="auth-reg-email-error" className="mt-1.5 text-sm text-red-600 dark:text-red-400" role="alert">
                            {fieldErrors.email}
                          </p>) : null}
                      </div>
                    </>) : null}
                  {mode === "forgot" ? (<div>
                      <label htmlFor="auth-forgot-email" className="mb-2 block text-base font-semibold text-zinc-800 dark:text-zinc-200">
                        {t("email")}
                      </label>
                      <input id="auth-forgot-email" type="email" value={forgotEmail} onChange={(e) => setForgotEmailValue(e.target.value)} placeholder={t("emailPlaceholder")} autoComplete="email" aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? "auth-forgot-email-error" : undefined} className={`${inputBase} ${fieldErrors.email ? inputErr : inputOk} px-4 py-3.5`}/>
                      {fieldErrors.email ? (<p id="auth-forgot-email-error" className="mt-1.5 text-sm text-red-600 dark:text-red-400" role="alert">
                          {fieldErrors.email}
                        </p>) : null}
                    </div>) : null}
                  {mode !== "forgot" ? (<>
                      <div>
                        <label htmlFor="auth-password" className="mb-2 block text-base font-semibold text-zinc-800 dark:text-zinc-200">
                          {t("password")}
                        </label>
                        <div className="relative">
                          <input id="auth-password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPasswordValue(e.target.value)} placeholder={t("password")} autoComplete={mode === "login" ? "current-password" : "new-password"} aria-invalid={Boolean(fieldErrors.password)} aria-describedby={fieldErrors.password ? "auth-password-error" : undefined} className={`${inputBase} ${fieldErrors.password ? inputErr : inputOk} pr-12 py-3.5`}/>
                          <button type="button" tabIndex={-1} onClick={() => setShowPassword((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-zinc-500 hover:bg-zinc-200/80 hover:text-zinc-800 dark:hover:bg-zinc-700 dark:hover:text-zinc-200" aria-label={showPassword ? t("hidePassword") : t("showPassword")}>
                            {showPassword ? <EyeOff className="h-5 w-5"/> : <Eye className="h-5 w-5"/>}
                          </button>
                        </div>
                        {fieldErrors.password ? (<p id="auth-password-error" className="mt-1.5 text-sm text-red-600 dark:text-red-400" role="alert">
                            {fieldErrors.password}
                          </p>) : null}
                      </div>
                      {mode === "register" ? (<div>
                          <label htmlFor="auth-confirm" className="mb-2 block text-base font-semibold text-zinc-800 dark:text-zinc-200">
                            {t("confirmPassword")}
                          </label>
                          <div className="relative">
                            <input id="auth-confirm" type={showConfirmPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPasswordValue(e.target.value)} placeholder={t("confirmPassword")} autoComplete="new-password" aria-invalid={Boolean(fieldErrors.confirmPassword)} aria-describedby={fieldErrors.confirmPassword ? "auth-confirm-error" : undefined} className={`${inputBase} ${fieldErrors.confirmPassword ? inputErr : inputOk} pr-12 py-3.5`}/>
                            <button type="button" tabIndex={-1} onClick={() => setShowConfirmPassword((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-zinc-500 hover:bg-zinc-200/80 hover:text-zinc-800 dark:hover:bg-zinc-700 dark:hover:text-zinc-200" aria-label={showConfirmPassword ? t("hidePassword") : t("showPassword")}>
                              {showConfirmPassword ? <EyeOff className="h-5 w-5"/> : <Eye className="h-5 w-5"/>}
                            </button>
                          </div>
                          {fieldErrors.confirmPassword ? (<p id="auth-confirm-error" className="mt-1.5 text-sm text-red-600 dark:text-red-400" role="alert">
                              {fieldErrors.confirmPassword}
                            </p>) : null}
                        </div>) : null}
                    </>) : null}
                  <button type="submit" disabled={loading} aria-busy={loading} className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-4 text-lg font-semibold text-white shadow-lg shadow-zinc-900/25 transition-all duration-200 hover:bg-zinc-800 hover:shadow-xl hover:shadow-zinc-900/30 active:scale-[0.99] disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:shadow-zinc-950/40 dark:hover:bg-zinc-200 dark:hover:shadow-lg">
                    {loading ? (<>
                        <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden/>
                        <span>{t("pleaseWait")}</span>
                      </>) : mode === "login" ? t("logIn") : mode === "register" ? t("signUp") : t("sendResetLink")}
                  </button>
                </form>
                {mode === "login" ? (<p className="mt-4 text-center text-sm">
                    <button type="button" onClick={() => {
                        setMode("forgot");
                        setPassword("");
                        setFieldErrors({});
                        setServerError(null);
                    }} className="font-semibold text-zinc-700 underline underline-offset-2 hover:no-underline dark:text-zinc-300">
                      {t("forgotPassword")}
                    </button>
                  </p>) : null}
                {mode === "forgot" ? (<p className="mt-6 text-center text-base text-zinc-600 dark:text-zinc-400">
                    <button type="button" onClick={() => {
                        setMode("login");
                        setFieldErrors({});
                        setServerError(null);
                    }} className="font-semibold text-zinc-900 underline underline-offset-2 hover:no-underline dark:text-white">
                      {t("backToLogin")}
                    </button>
                  </p>) : (<p className="mt-6 text-center text-base text-zinc-600 dark:text-zinc-400">
                    {mode === "login" ? t("dontHaveAccount") : t("alreadyHaveAccount")}
                    <button type="button" onClick={() => {
                        setMode(mode === "login" ? "register" : "login");
                        setPassword("");
                        setConfirmPassword("");
                        setFieldErrors({});
                        setServerError(null);
                    }} className="font-semibold text-zinc-900 underline underline-offset-2 hover:no-underline dark:text-white">
                      {mode === "login" ? t("signUp") : t("logIn")}
                    </button>
                  </p>)}
              </>)}
          </div>
    </div>);
}
