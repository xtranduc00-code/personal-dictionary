"use client";
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";
import { ChevronDown, X, type LucideIcon } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { authFetch, useAuth } from "@/lib/auth-context";
import type { TranslationKey } from "@/lib/i18n";
import { isNavLabelKey, NAV_LABEL_MAX_LEN, type NavLabelKey } from "@/lib/nav-label-keys";

function cx(...parts: Array<string | false | undefined>): string {
    return parts.filter(Boolean).join(" ");
}

type NavLabelsContextValue = {
    navT: (key: TranslationKey) => string;
    patchNavLabel: (key: NavLabelKey, raw: string) => Promise<boolean>;
    requestRename: (key: NavLabelKey, currentDisplay: string) => void;
    editable: boolean;
};

const NavLabelsContext = createContext<NavLabelsContextValue | null>(null);

export function useNavLabels(): NavLabelsContextValue {
    const v = useContext(NavLabelsContext);
    if (!v)
        throw new Error("NavLabelsProvider missing");
    return v;
}

export function NavLabelsProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const { t } = useI18n();
    const [overrides, setOverrides] = useState<Partial<Record<NavLabelKey, string>>>({});

    useEffect(() => {
        if (!user) {
            setOverrides({});
            return;
        }
        let cancelled = false;
        authFetch("/api/user/nav-labels")
            .then((r) => (r.ok ? r.json() : null))
            .then((d: { overrides?: unknown } | null) => {
                if (cancelled || !d?.overrides || typeof d.overrides !== "object")
                    return;
                setOverrides(d.overrides as Partial<Record<NavLabelKey, string>>);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [user?.id]);

    const navT = useCallback(
        (key: TranslationKey) => {
            if (isNavLabelKey(key) && overrides[key])
                return overrides[key]!;
            return t(key);
        },
        [overrides, t],
    );

    const patchNavLabel = useCallback(
        async (key: NavLabelKey, raw: string): Promise<boolean> => {
            const trimmed = raw.trim();
            const def = t(key);
            const shouldClear = !trimmed || trimmed === def;
            const prev = { ...overrides };

            setOverrides((o) => {
                const n = { ...o };
                if (shouldClear)
                    delete n[key];
                else
                    n[key] = trimmed;
                return n;
            });

            const res = await authFetch("/api/user/nav-labels", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    patch: { [key]: shouldClear ? "" : trimmed },
                }),
            });
            if (!res.ok) {
                setOverrides(prev);
                toast.error(t("navRenameError"));
                return false;
            }
            const data = (await res.json().catch(() => ({}))) as {
                overrides?: Partial<Record<NavLabelKey, string>>;
            };
            if (data.overrides && typeof data.overrides === "object")
                setOverrides(data.overrides);
            return true;
        },
        [overrides, t],
    );

    const [renameTarget, setRenameTarget] = useState<null | {
        key: NavLabelKey;
        atOpen: string;
    }>(null);
    const [renamePhase, setRenamePhase] = useState<"ask" | "edit">("ask");
    const [renameDraft, setRenameDraft] = useState("");
    const [renameSaving, setRenameSaving] = useState(false);
    const renameInputRef = useRef<HTMLInputElement>(null);

    const closeRename = useCallback(() => {
        setRenameTarget(null);
        setRenamePhase("ask");
        setRenameDraft("");
        setRenameSaving(false);
    }, []);

    const requestRename = useCallback(
        (key: NavLabelKey, currentDisplay: string) => {
            if (!user)
                return;
            setRenameTarget({ key, atOpen: currentDisplay });
            setRenamePhase("ask");
            setRenameDraft(currentDisplay);
        },
        [user],
    );

    useEffect(() => {
        if (!renameTarget || renamePhase !== "edit")
            return;
        const id = requestAnimationFrame(() => renameInputRef.current?.focus());
        return () => cancelAnimationFrame(id);
    }, [renameTarget, renamePhase]);

    useEffect(() => {
        if (!renameTarget)
            return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape")
                closeRename();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [renameTarget, closeRename]);

    const value = useMemo(
        () => ({
            navT,
            patchNavLabel,
            requestRename,
            editable: Boolean(user),
        }),
        [navT, patchNavLabel, requestRename, user],
    );

    return (
        <NavLabelsContext.Provider value={value}>
            {children}
            {renameTarget ? (<div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm" onClick={closeRename} role="presentation">
                <div className="relative w-full max-w-md rounded-2xl border border-zinc-200/80 bg-white/95 p-6 shadow-2xl dark:border-zinc-700/60 dark:bg-zinc-900/95" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="nav-rename-title">
                    <div className="mb-4 flex items-start justify-between gap-3">
                        <h2 id="nav-rename-title" className="text-lg font-bold text-zinc-900 dark:text-white">
                            {renamePhase === "ask" ? t("navRenameModalAskTitle") : t("navRenameModalEditTitle")}
                        </h2>
                        <button type="button" onClick={closeRename} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label={t("close")}>
                            <X className="h-5 w-5"/>
                        </button>
                    </div>
                    {renamePhase === "ask" ? (<>
                        <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                          {t("navRenameModalAskBody")}
                        </p>
                        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
                          <span className="font-medium text-zinc-700 dark:text-zinc-200">{t("navRenameModalCurrentLabel")}:</span>{" "}
                          <span className="text-zinc-900 dark:text-zinc-100">{renameTarget.atOpen}</span>
                        </p>
                        <div className="mt-6 flex flex-wrap justify-end gap-2">
                          <button type="button" onClick={closeRename} className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm font-medium text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100">
                            {t("cancel")}
                          </button>
                          <button type="button" onClick={() => setRenamePhase("edit")} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 dark:bg-sky-600 dark:hover:bg-sky-500">
                            {t("navRenameModalContinue")}
                          </button>
                        </div>
                      </>) : (<>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400" htmlFor="nav-rename-input">
                          {t("navRenameModalEditTitle")}
                        </label>
                        <input ref={renameInputRef} id="nav-rename-input" type="text" autoComplete="off" maxLength={NAV_LABEL_MAX_LEN} value={renameDraft} onChange={(e) => setRenameDraft(e.target.value)} className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-sky-500/40"/>
                        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                          {t("navRenameModalEditHint")}
                        </p>
                        <div className="mt-6 flex flex-wrap justify-end gap-2">
                          <button type="button" disabled={renameSaving} onClick={() => {
                                setRenamePhase("ask");
                                setRenameDraft(renameTarget.atOpen);
                            }} className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm font-medium text-zinc-800 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100">
                            {t("navRenameModalBack")}
                          </button>
                          <button type="button" disabled={renameSaving} onClick={closeRename} className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm font-medium text-zinc-800 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100">
                            {t("cancel")}
                          </button>
                          <button type="button" disabled={renameSaving} onClick={async () => {
                                setRenameSaving(true);
                                const ok = await patchNavLabel(renameTarget.key, renameDraft);
                                setRenameSaving(false);
                                if (ok)
                                    closeRename();
                            }} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 dark:bg-sky-600 dark:hover:bg-sky-500">
                            {renameSaving ? t("navRenameModalSaving") : t("navRenameModalSave")}
                          </button>
                        </div>
                      </>)}
                </div>
              </div>) : null}
        </NavLabelsContext.Provider>
    );
}

export function NavSectionEditableTitle({
    labelKey,
    className,
}: {
    labelKey: NavLabelKey;
    className?: string;
}) {
    const { navT, requestRename, editable } = useNavLabels();
    const { t } = useI18n();
    const display = navT(labelKey);

    return (
        <span
            className={cx(
                "select-none",
                editable &&
                    "cursor-text rounded-md px-1 py-0.5 hover:bg-zinc-200/70 dark:hover:bg-zinc-700/60",
                className,
            )}
            title={editable ? t("navRenameDoubleClickHint") : undefined}
            onDoubleClick={() => {
                if (!editable)
                    return;
                requestRename(labelKey, display);
            }}
        >
            {display}
        </span>
    );
}

export function NavSectionHeader({
    isOpen,
    onToggle,
    icon: Icon,
    labelKey,
    outerClass,
    iconBoxClass,
}: {
    isOpen: boolean;
    onToggle: () => void;
    icon: LucideIcon;
    labelKey: NavLabelKey;
    outerClass: string;
    iconBoxClass: string;
}) {
    const { t } = useI18n();
    const toggleAria = t("ariaToggleNavSection");
    return (
        <div className={outerClass}>
            <button
                type="button"
                onClick={onToggle}
                className="flex shrink-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/35 dark:focus-visible:ring-sky-500/30"
                aria-label={toggleAria}
            >
                <span className={iconBoxClass}>
                    <Icon className="h-5 w-5"/>
                </span>
            </button>
            <NavSectionEditableTitle
                labelKey={labelKey}
                className="min-w-0 flex-1 text-left text-base font-medium"
            />
            <button
                type="button"
                onClick={onToggle}
                className="shrink-0 rounded-lg p-0.5 text-zinc-400 transition hover:text-zinc-600 dark:hover:text-zinc-300"
                aria-label={toggleAria}
            >
                <ChevronDown
                    className={cx(
                        "h-5 w-5 shrink-0 transition-transform",
                        isOpen && "rotate-180",
                    )}
                />
            </button>
        </div>
    );
}

export function NavSidebarRow({
    href,
    labelKey,
    className,
    active,
    sub,
    icon: Icon,
    onLinkClick,
    meetsLive: _meetsLive,
    badge,
    preventNavigation,
}: {
    href: string;
    labelKey: TranslationKey;
    className: string;
    active: boolean;
    sub?: boolean;
    icon: LucideIcon;
    onLinkClick?: () => void;
    meetsLive?: boolean;
    badge?: ReactNode;
    /** If true, click does not navigate (e.g. open in-app Spotify dock). */
    preventNavigation?: boolean;
}) {
    const { navT, requestRename, editable } = useNavLabels();
    const { t } = useI18n();
    const router = useRouter();
    const label = navT(labelKey);
    const navTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const iconCls = `${sub ? "h-3.5 w-3.5" : "h-4 w-4"} shrink-0 ${active || _meetsLive ? "opacity-90" : "opacity-70"}`;

    useEffect(() => () => clearTimeout(navTimer.current), []);

    if (!editable) {
        return (
            <Link
                href={href}
                onClick={(e) => {
                    if (preventNavigation)
                        e.preventDefault();
                    onLinkClick?.();
                }}
                className={className}
            >
                <Icon className={iconCls}/>
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                    {label}
                    {badge}
                </span>
            </Link>
        );
    }

    return (
        <div
            role="link"
            tabIndex={0}
            className={className}
            title={t("navRenameDoubleClickHint")}
            onKeyDown={(e) => {
                if (e.target !== e.currentTarget)
                    return;
                if (e.key !== "Enter" && e.key !== " ")
                    return;
                e.preventDefault();
                if (preventNavigation) {
                    onLinkClick?.();
                    return;
                }
                router.push(href);
                onLinkClick?.();
            }}
            onClick={(e) => {
                if (preventNavigation) {
                    if (e.metaKey || e.ctrlKey)
                        return;
                    e.preventDefault();
                    clearTimeout(navTimer.current);
                    onLinkClick?.();
                    return;
                }
                if (e.metaKey || e.ctrlKey) {
                    window.open(href, "_blank", "noopener,noreferrer");
                    return;
                }
                clearTimeout(navTimer.current);
                navTimer.current = setTimeout(() => {
                    router.push(href);
                    onLinkClick?.();
                }, 280);
            }}
            onDoubleClick={(e) => {
                e.preventDefault();
                clearTimeout(navTimer.current);
                if (isNavLabelKey(labelKey))
                    requestRename(labelKey, label);
            }}
        >
            <Icon className={iconCls}/>
            <span className="flex min-w-0 flex-wrap cursor-text items-center gap-2">
                {label}
                {badge}
            </span>
        </div>
    );
}
