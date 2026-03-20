"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { X, Loader2, ImagePlus, Trash2 } from "lucide-react";
import { toast } from "react-toastify";
import { useAuth, getAuthToken, type AuthUser } from "@/lib/auth-context";
import { useI18n } from "@/components/i18n-provider";
import { AVATAR_ALLOWED_TYPES, AVATAR_BUCKET, AVATAR_MAX_BYTES, avatarObjectPath, } from "@/lib/avatar-storage";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { withAvatarCacheBust } from "@/lib/avatar-display-url";
function initials(u: AuthUser | null): string {
    const s = u?.username?.trim() || "?";
    return s.slice(0, 2).toUpperCase();
}
export function ProfileModal({ open, onClose }: {
    open: boolean;
    onClose: () => void;
}) {
    const { t } = useI18n();
    const { user, refreshUser, avatarDisplayRev, bumpAvatarDisplay } = useAuth();
    const [avatarBusy, setAvatarBusy] = useState(false);
    const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
    const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const clearAvatarStaging = useCallback(() => {
        setPendingAvatarFile(null);
        setAvatarPreviewUrl((prev) => {
            if (prev)
                URL.revokeObjectURL(prev);
            return null;
        });
        if (fileRef.current)
            fileRef.current.value = "";
    }, []);
    useEffect(() => {
        if (!open) {
            clearAvatarStaging();
        }
    }, [open, clearAvatarStaging]);
    useEffect(() => {
        if (!open) {
            return;
        }
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);
    if (!open || !user) {
        return null;
    }
    const email = user.email?.trim() || null;
    const avatarUrl = user.avatarUrl?.trim() || null;
    const serverAvatarSrc = withAvatarCacheBust(avatarUrl, avatarDisplayRev);
    const displayImageSrc = avatarPreviewUrl || serverAvatarSrc;
    async function uploadAvatar(file: File) {
        const u = user;
        if (!u)
            return;
        const token = getAuthToken();
        if (!token) {
            toast.error(t("authSessionExpired"));
            return;
        }
        setAvatarBusy(true);
        try {
            const jwtRes = await fetch("/api/auth/storage-jwt", {
                headers: { Authorization: `Bearer ${token}` },
            });
            const jwtData = await jwtRes.json().catch(() => ({}));
            if (!jwtRes.ok) {
                toast.error(typeof jwtData.error === "string" ? jwtData.error : t("profileAvatarError"));
                return;
            }
            const accessToken = typeof jwtData.accessToken === "string" ? jwtData.accessToken : "";
            if (!accessToken) {
                toast.error(t("profileAvatarError"));
                return;
            }
            let supabase;
            try {
                supabase = createSupabaseBrowserClient(accessToken);
            }
            catch {
                toast.error(t("profileAvatarError"));
                return;
            }
            const path = avatarObjectPath(u.id);
            const { error: upErr } = await supabase.storage
                .from(AVATAR_BUCKET)
                .upload(path, file, { upsert: true, contentType: file.type });
            if (upErr) {
                toast.error(upErr.message || t("profileAvatarError"));
                return;
            }
            const { data: pub } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
            const publicUrl = pub?.publicUrl;
            if (!publicUrl) {
                toast.error(t("profileAvatarError"));
                return;
            }
            const { error: rpcErr } = await supabase.rpc("set_my_avatar_url", { new_url: publicUrl });
            if (rpcErr) {
                toast.error(rpcErr.message || t("profileAvatarError"));
                return;
            }
            toast.success(t("profileAvatarUpdated"));
            clearAvatarStaging();
            await refreshUser();
            bumpAvatarDisplay();
        }
        finally {
            setAvatarBusy(false);
        }
    }
    async function removeAvatar() {
        const u = user;
        if (!u)
            return;
        const token = getAuthToken();
        if (!token) {
            toast.error(t("authSessionExpired"));
            return;
        }
        setAvatarBusy(true);
        try {
            const jwtRes = await fetch("/api/auth/storage-jwt", {
                headers: { Authorization: `Bearer ${token}` },
            });
            const jwtData = await jwtRes.json().catch(() => ({}));
            if (!jwtRes.ok) {
                toast.error(typeof jwtData.error === "string" ? jwtData.error : t("profileAvatarError"));
                return;
            }
            const accessToken = typeof jwtData.accessToken === "string" ? jwtData.accessToken : "";
            if (!accessToken) {
                toast.error(t("profileAvatarError"));
                return;
            }
            let supabase;
            try {
                supabase = createSupabaseBrowserClient(accessToken);
            }
            catch {
                toast.error(t("profileAvatarError"));
                return;
            }
            const path = avatarObjectPath(u.id);
            const { error: rmErr } = await supabase.storage.from(AVATAR_BUCKET).remove([path]);
            if (rmErr) {
                toast.error(rmErr.message || t("profileAvatarError"));
                return;
            }
            const { error: rpcErr } = await supabase.rpc("clear_my_avatar_url");
            if (rpcErr) {
                toast.error(rpcErr.message || t("profileAvatarError"));
                return;
            }
            toast.success(t("profileAvatarRemoved"));
            clearAvatarStaging();
            await refreshUser();
            bumpAvatarDisplay();
        }
        finally {
            setAvatarBusy(false);
        }
    }
    function onAvatarFileInput(e: React.ChangeEvent<HTMLInputElement>) {
        const f = e.target.files?.[0];
        if (!f)
            return;
        if (!AVATAR_ALLOWED_TYPES.has(f.type)) {
            toast.error(t("profileAvatarInvalidType"));
            e.target.value = "";
            return;
        }
        if (f.size > AVATAR_MAX_BYTES) {
            toast.error(t("profileAvatarTooLarge"));
            e.target.value = "";
            return;
        }
        setAvatarPreviewUrl((prev) => {
            if (prev)
                URL.revokeObjectURL(prev);
            return URL.createObjectURL(f);
        });
        setPendingAvatarFile(f);
    }
    return (<div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm" onClick={onClose} role="presentation">
      <div className="relative w-full max-w-sm rounded-2xl border border-zinc-200/80 bg-white/95 p-6 shadow-2xl dark:border-zinc-700/60 dark:bg-zinc-900/95" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="profile-modal-title">
        <div className="mb-5 flex items-start justify-between gap-3 border-b border-zinc-200 pb-4 dark:border-zinc-700">
          <div className="min-w-0">
            <h2 id="profile-modal-title" className="text-lg font-bold text-zinc-900 dark:text-white">
              {t("profileTitle")}
            </h2>
            <p className="mt-0.5 truncate text-sm text-zinc-500 dark:text-zinc-400">{user.username}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label={t("close")}>
            <X className="h-5 w-5"/>
          </button>
        </div>
        <div className="mb-5 space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{t("profileAvatarSection")}</h3>
          <div className="flex flex-col items-center gap-3">
            <div className="relative flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-100 ring-2 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-600">
              {displayImageSrc ? (<img src={displayImageSrc} alt="" className="h-full w-full object-cover"/>) : (<span className="text-2xl font-semibold text-zinc-600 dark:text-zinc-300">
                  {initials(user)}
                </span>)}
            </div>
            {pendingAvatarFile ? (<p className="text-center text-xs font-medium text-amber-700 dark:text-amber-400">{t("profileAvatarPreviewHint")}</p>) : null}
          </div>
          <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">{t("profileAvatarHint")}</p>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onAvatarFileInput}/>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {pendingAvatarFile ? (<>
                <button type="button" disabled={avatarBusy} onClick={() => void uploadAvatar(pendingAvatarFile)} className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900">
                  {avatarBusy ? <Loader2 className="h-4 w-4 animate-spin"/> : <ImagePlus className="h-4 w-4"/>}
                  {t("profileAvatarUpload")}
                </button>
                <button type="button" disabled={avatarBusy} onClick={() => clearAvatarStaging()} className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm font-medium text-zinc-800 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100">
                  {t("cancel")}
                </button>
              </>) : (<button type="button" disabled={avatarBusy} onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm font-medium text-zinc-800 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100">
                {avatarBusy ? <Loader2 className="h-4 w-4 animate-spin"/> : <ImagePlus className="h-4 w-4"/>}
                {t("profileAvatarUpload")}
              </button>)}
            {avatarUrl && !pendingAvatarFile ? (<button type="button" disabled={avatarBusy} onClick={() => void removeAvatar()} className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-800 disabled:opacity-60 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                <Trash2 className="h-4 w-4"/>
                {t("profileAvatarRemove")}
              </button>) : null}
          </div>
          <p className="text-center text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">{t("profileAvatarSaveHint")}</p>
        </div>
        <section>
          <h3 className="mb-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">{t("profileSectionAccount")}</h3>
          <dl className="space-y-2.5 text-sm">
            <div>
              <dt className="font-medium text-zinc-500 dark:text-zinc-400">{t("profileUsernameLabel")}</dt>
              <dd className="mt-0.5 text-zinc-900 dark:text-zinc-100">{user.username}</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-500 dark:text-zinc-400">{t("profileEmailLabel")}</dt>
              <dd className="mt-0.5 break-all text-zinc-900 dark:text-zinc-100">
                {email ?? t("profileEmailNone")}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </div>);
}
