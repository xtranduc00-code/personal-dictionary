"use client";

import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { authFetch, useAuth } from "@/lib/auth-context";

type HistoryRow = {
    id: string;
    title: string;
    preview: string;
    updatedAt: string;
};

type Props = {
    sessionId: string | null;
    onSelectSession: (id: string) => void;
    className?: string;
};

export function StudyKitSessionHistoryAside({
    sessionId,
    onSelectSession,
    className = "",
}: Props) {
    const { t } = useI18n();
    const { user } = useAuth();
    const [rows, setRows] = useState<HistoryRow[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!user) {
            setRows([]);
            return;
        }
        let cancelled = false;
        setLoading(true);
        authFetch("/api/study-kit/sessions")
            .then((r) => (r.ok ? r.json() : null))
            .then((data: { sessions?: HistoryRow[] } | null) => {
                if (!cancelled && data?.sessions)
                    setRows(data.sessions);
            })
            .catch(() => {})
            .finally(() => {
                if (!cancelled)
                    setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [user, sessionId]);

    return (
        <aside
            className={[
                "flex max-h-[min(70vh,560px)] min-h-[min(50vh,400px)] flex-col rounded-xl border border-zinc-200/80 bg-white shadow-[0_1px_0_rgba(0,0,0,0.03)] dark:border-white/10 dark:bg-zinc-950/40",
                className,
            ].join(" ")}
        >
            <div className="flex items-center gap-2 border-b border-zinc-200/80 px-3 py-2 dark:border-white/10">
                <History className="h-4 w-4 shrink-0 text-blue-600 dark:text-sky-400" aria-hidden />
                <h2 className="text-sm font-semibold text-[#0f172a] dark:text-zinc-100">
                    {t("studyKitResultTabHistory")}
                </h2>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                {!user ? (
                    <p className="text-center text-xs text-[#94A3B8] dark:text-zinc-500">
                        {t("studyKitHistorySignIn")}
                    </p>
                ) : loading ? (
                    <p className="text-center text-xs text-[#94A3B8] dark:text-zinc-500">{t("loading")}</p>
                ) : rows.length === 0 ? (
                    <p className="text-center text-xs text-[#94A3B8] dark:text-zinc-500">
                        {t("studyKitHistoryEmpty")}
                    </p>
                ) : (
                    <ul className="space-y-2">
                        {rows.map((row) => (
                            <li key={row.id}>
                                <button
                                    type="button"
                                    onClick={() => onSelectSession(row.id)}
                                    className={[
                                        "w-full rounded-lg border border-zinc-200/80 bg-zinc-50/80 px-3 py-2 text-left text-xs transition hover:border-blue-200/80 hover:bg-blue-50/40 dark:border-white/10 dark:bg-zinc-900/40 dark:hover:border-sky-500/30 dark:hover:bg-sky-950/25",
                                        sessionId === row.id
                                            ? "ring-1 ring-blue-400/50 dark:ring-sky-500/40"
                                            : "",
                                    ].join(" ")}
                                >
                                    <span className="line-clamp-2 font-semibold text-[#0f172a] dark:text-zinc-100">
                                        {row.title}
                                    </span>
                                    <span className="mt-0.5 line-clamp-2 text-[11px] text-[#64748B] dark:text-zinc-400">
                                        {row.preview}
                                    </span>
                                    <span className="mt-1 block text-[10px] text-[#94A3B8] dark:text-zinc-500">
                                        {t("studyKitHistoryUpdated")}{" "}
                                        {new Date(row.updatedAt).toLocaleString()}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </aside>
    );
}
