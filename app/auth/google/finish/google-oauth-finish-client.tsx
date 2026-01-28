"use client";
import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "react-toastify";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import type { TranslationKey } from "@/lib/i18n";
import { AUTH_TOKEN_KEY, AUTH_USER_KEY, type AuthUser } from "@/lib/auth-context";
function errorToastKey(code: string): TranslationKey {
    const map: Record<string, TranslationKey> = {
        denied: "googleAuthDenied",
        config: "googleAuthConfig",
        invalid: "googleAuthInvalid",
        email: "googleAuthEmail",
    };
    return map[code] ?? "googleAuthFailed";
}
export function GoogleOAuthFinishClient() {
    const { t } = useI18n();
    const router = useRouter();
    const searchParams = useSearchParams();
    const ran = useRef(false);
    useEffect(() => {
        if (ran.current) {
            return;
        }
        ran.current = true;
        const err = searchParams.get("error");
        const token = searchParams.get("token");
        if (err) {
            toast.error(t(errorToastKey(err)));
            router.replace("/");
            return;
        }
        if (!token) {
            router.replace("/");
            return;
        }
        (async () => {
            const res = await fetch("/api/auth/me", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                toast.error(t("googleAuthFailed"));
                router.replace("/");
                return;
            }
            const data = (await res.json()) as { user: AuthUser };
            if (typeof window !== "undefined") {
                window.localStorage.setItem(AUTH_TOKEN_KEY, token);
                window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
            }
            toast.success(t("googleAuthSuccess").replace("{name}", data.user.username));
            window.location.replace("/");
        })();
    }, [router, searchParams, t]);
    return (<div className="flex flex-col items-center gap-3 text-center">
      <Loader2 className="h-10 w-10 animate-spin text-zinc-500" aria-hidden/>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("googleAuthCompleting")}</p>
    </div>);
}
