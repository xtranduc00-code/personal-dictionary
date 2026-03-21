"use client";

import { useCallback, useState } from "react";
import { Download, FolderInput, Loader2 } from "lucide-react";
import { toast } from "react-toastify";
import { useI18n } from "@/components/i18n-provider";
import { StudyKitSaveToFolderModal } from "@/components/study-kit-save-modal";
import { authFetch, useAuth } from "@/lib/auth-context";
import { defaultTitleFromMarkdown } from "@/lib/study-kit-saved";

function safeFileBase(title: string): string {
    const s = title
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 72)
        .trim();
    return s || "study-sheet";
}

export function StudyKitResultActions({
    summary,
    truncated,
}: {
    summary: string;
    truncated: boolean;
}) {
    const { t, locale } = useI18n();
    const { user, openAuthModal } = useAuth();
    const [exporting, setExporting] = useState(false);
    const [saveOpen, setSaveOpen] = useState(false);

    const onExportHtml = useCallback(async () => {
        if (!user) {
            openAuthModal();
            toast.info(t("studyKitExportSignIn"));
            return;
        }
        setExporting(true);
        try {
            const title = defaultTitleFromMarkdown(summary);
            const res = await authFetch("/api/study-kit/export-html", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    markdown: summary,
                    title,
                    lang: locale,
                    exportNote: t("studyKitExportFullSheetNote"),
                }),
            });
            const data = (await res.json()) as { html?: string; code?: string };
            if (!res.ok) {
                toast.error(t("studyKitExportErr"));
                return;
            }
            const html = data.html;
            if (!html) {
                toast.error(t("studyKitExportErr"));
                return;
            }
            const blob = new Blob([html], { type: "text/html;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${safeFileBase(title)}.html`;
            a.rel = "noopener";
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            toast.success(t("studyKitExportDone"));
        }
        catch {
            toast.error(t("studyKitExportErr"));
        }
        finally {
            setExporting(false);
        }
    }, [user, openAuthModal, summary, locale, t]);

    const btn =
        "inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-200/90 bg-white px-3 py-2 text-xs font-semibold text-[#475569] shadow-sm transition hover:border-blue-200 hover:bg-blue-50/50 hover:text-[#334155] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-zinc-900/50 dark:text-zinc-300 dark:hover:border-sky-500/30 dark:hover:bg-sky-950/30";

    return (
        <>
            <div className="mb-4 flex flex-wrap gap-2">
                <button
                    type="button"
                    disabled={exporting || !summary}
                    onClick={() => void onExportHtml()}
                    className={btn}
                >
                    {exporting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                        <Download className="h-3.5 w-3.5" aria-hidden />
                    )}
                    {t("studyKitExportHtml")}
                </button>
                <button
                    type="button"
                    disabled={!summary}
                    onClick={() => setSaveOpen(true)}
                    className={btn}
                >
                    <FolderInput className="h-3.5 w-3.5" aria-hidden />
                    {t("studyKitSaveToFolder")}
                </button>
            </div>
            <StudyKitSaveToFolderModal
                open={saveOpen}
                onClose={() => setSaveOpen(false)}
                summary={summary}
                truncated={truncated}
                onSaved={undefined}
            />
        </>
    );
}
