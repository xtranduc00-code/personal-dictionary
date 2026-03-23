"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode, } from "react";
export type AuthUser = {
    id: string;
    username: string;
    email?: string | null;
    /** False until the user has set a password (e.g. invited or legacy account). */
    hasPassword?: boolean;
    avatarUrl?: string | null;
};
export const AUTH_TOKEN_KEY = "ken-auth-token";
export const AUTH_USER_KEY = "ken-auth-user";
function getStored(): {
    token: string | null;
    user: AuthUser | null;
} {
    if (typeof window === "undefined")
        return { token: null, user: null };
    const token = window.localStorage.getItem(AUTH_TOKEN_KEY);
    let user: AuthUser | null = null;
    try {
        const raw = window.localStorage.getItem(AUTH_USER_KEY);
        if (raw)
            user = JSON.parse(raw) as AuthUser;
    }
    catch {
    }
    return { token, user };
}
export function getLastStoredUsername(): string | null {
    return getStored().user?.username ?? null;
}
export function getAuthToken(): string | null {
    return getStored().token;
}
export function getAuthHeaders(): Record<string, string> {
    const token = getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
}
let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(fn: (() => void) | null) {
    onSessionExpired = fn;
}
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const res = await fetch(input, {
        ...init,
        headers: { ...getAuthHeaders(), ...(init?.headers as Record<string, string>) },
    });
    if (res.status === 401) {
        onSessionExpired?.();
    }
    return res;
}
export type AuthModalStartMode = "login" | "register" | "forgot";
type AuthContextValue = {
    user: AuthUser | null;
    isLoading: boolean;
    /** Reload profile from `/api/auth/me` (e.g. after password change). */
    refreshUser: () => Promise<void>;
    signIn: (login: string, password: string) => Promise<{
        error: Error | null;
        user: AuthUser | null;
    }>;
    signUp: (username: string, email: string, password: string, confirmPassword: string) => Promise<{
        error: Error | null;
    }>;
    signOut: () => void;
    authModalOpen: boolean;
    authModalStartMode: AuthModalStartMode;
    /** When true, overlay / Escape / X do not close the modal (landing required-login). */
    authModalBlocking: boolean;
    openAuthModal: (options?: { blocking?: boolean }) => void;
    /** Opens forgot-password flow; optional email prefill (e.g. from profile). */
    openAuthModalForgotPassword: (options?: { prefillEmail?: string | null }) => void;
    /** Cleared when the auth modal closes; consumed by AuthModal on open. */
    forgotPasswordPrefillEmail: string | null;
    closeAuthModal: () => void;
    /** Bump after avatar upload/remove so `withAvatarCacheBust(url, rev)` loads fresh image (same Storage URL). */
    avatarDisplayRev: number;
    bumpAvatarDisplay: () => void;
};
const AuthContext = createContext<AuthContextValue | null>(null);
export function getDisplayName(user: AuthUser | null): string {
    return user?.username ?? "";
}
export function AuthProvider({ children }: {
    children: ReactNode;
}) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [authModalOpen, setAuthModalOpen] = useState(false);
    const [authModalStartMode, setAuthModalStartMode] = useState<AuthModalStartMode>("login");
    const [authModalBlocking, setAuthModalBlocking] = useState(false);
    const [forgotPasswordPrefillEmail, setForgotPasswordPrefillEmail] = useState<string | null>(null);
    const [avatarDisplayRev, setAvatarDisplayRev] = useState(0);
    const bumpAvatarDisplay = useCallback(() => {
        setAvatarDisplayRev((r) => r + 1);
    }, []);
    type MeResult =
        | { ok: true; user: AuthUser }
        | { ok: false; clearAuth: boolean };

    const fetchMe = useCallback(async (token: string): Promise<MeResult> => {
        try {
            const res = await fetch("/api/auth/me", {
                headers: { Authorization: `Bearer ${token}` },
                signal: AbortSignal.timeout(12_000),
            });
            if (res.status === 401)
                return { ok: false, clearAuth: true };
            if (!res.ok)
                return { ok: false, clearAuth: false };
            const data = await res.json();
            return { ok: true, user: data.user as AuthUser };
        }
        catch {
            return { ok: false, clearAuth: false };
        }
    }, []);
    const refreshUser = useCallback(async () => {
        if (typeof window === "undefined")
            return;
        const token = window.localStorage.getItem(AUTH_TOKEN_KEY);
        if (!token)
            return;
        const r = await fetchMe(token);
        if (r.ok) {
            setUser(r.user);
            window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(r.user));
        }
        else if (r.clearAuth) {
            window.localStorage.removeItem(AUTH_TOKEN_KEY);
            window.localStorage.removeItem(AUTH_USER_KEY);
            setUser(null);
        }
    }, [fetchMe]);
    useEffect(() => {
        const { token, user: storedUser } = getStored();
        if (!token) {
            setUser(null);
            setIsLoading(false);
            return;
        }
        if (storedUser)
            setUser(storedUser);
        void fetchMe(token)
            .then((r) => {
                if (r.ok) {
                    setUser(r.user);
                    if (typeof window !== "undefined")
                        window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(r.user));
                }
                else if (r.clearAuth && typeof window !== "undefined") {
                    setUser(null);
                    window.localStorage.removeItem(AUTH_TOKEN_KEY);
                    window.localStorage.removeItem(AUTH_USER_KEY);
                }
            })
            .finally(() => {
                setIsLoading(false);
            });
    }, [fetchMe]);
    const signIn = useCallback(async (login: string, password: string) => {
        const res = await fetch("/api/auth/signin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                login: login.trim(),
                password,
            }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            return { error: new Error(data.error ?? "Sign in failed"), user: null };
        }
        const token = data.token as string;
        const user = data.user as AuthUser;
        if (typeof window !== "undefined") {
            window.localStorage.setItem(AUTH_TOKEN_KEY, token);
            window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
        }
        setUser(user);
        return { error: null, user };
    }, []);
    const signUp = useCallback(async (username: string, email: string, password: string, confirmPassword: string) => {
        const res = await fetch("/api/auth/signup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: username.trim().toLowerCase(),
                email: email.trim(),
                password,
                confirmPassword,
            }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            return { error: new Error(data.error ?? "Sign up failed") };
        }
        const token = data.token as string;
        const user = data.user as AuthUser;
        if (typeof window !== "undefined") {
            window.localStorage.setItem(AUTH_TOKEN_KEY, token);
            window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
        }
        setUser(user);
        return { error: null };
    }, []);
    const signOut = useCallback(() => {
        setUser(null);
        setAuthModalOpen(false);
        setAuthModalBlocking(false);
        setAuthModalStartMode("login");
        if (typeof window !== "undefined") {
            window.localStorage.removeItem(AUTH_TOKEN_KEY);
            window.localStorage.removeItem(AUTH_USER_KEY);
        }
    }, []);
    const openAuthModal = useCallback((options?: { blocking?: boolean }) => {
        setForgotPasswordPrefillEmail(null);
        setAuthModalStartMode("login");
        setAuthModalBlocking(Boolean(options?.blocking));
        setAuthModalOpen(true);
    }, []);
    const openAuthModalForgotPassword = useCallback((options?: { prefillEmail?: string | null }) => {
        const e = options?.prefillEmail?.trim();
        setForgotPasswordPrefillEmail(e || null);
        setAuthModalStartMode("forgot");
        setAuthModalBlocking(false);
        setAuthModalOpen(true);
    }, []);
    const closeAuthModal = useCallback(() => {
        setAuthModalOpen(false);
        setAuthModalBlocking(false);
        setForgotPasswordPrefillEmail(null);
    }, []);
    const handleSessionExpired = useCallback(() => {
        if (typeof window !== "undefined") {
            window.localStorage.removeItem(AUTH_TOKEN_KEY);
        }
        setUser(null);
        setAuthModalStartMode("login");
        setAuthModalBlocking(false);
        setAuthModalOpen(true);
    }, []);
    useEffect(() => {
        setSessionExpiredHandler(handleSessionExpired);
        return () => setSessionExpiredHandler(null);
    }, [handleSessionExpired]);
    const value: AuthContextValue = {
        user,
        isLoading,
        refreshUser,
        signIn,
        signUp,
        signOut,
        authModalOpen,
        authModalStartMode,
        authModalBlocking,
        openAuthModal,
        openAuthModalForgotPassword,
        forgotPasswordPrefillEmail,
        closeAuthModal,
        avatarDisplayRev,
        bumpAvatarDisplay,
    };
    return (<AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>);
}
export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx)
        throw new Error("useAuth must be used within AuthProvider");
    return ctx;
}
