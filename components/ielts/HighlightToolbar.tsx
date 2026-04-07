"use client";
import { Highlighter, Layers } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { Tooltip } from "@/components/ui/Tooltip";
type Props = {
    x: number;
    y: number;
    hasHighlightId: boolean;
    selectedText: string;
    flashcardText?: string;
    onHighlight: () => void;
    onUnhighlight: () => void;
    onFlashcard: (word: string) => void;
    showHighlightButtons?: boolean;
    /** Keeps editor text selected so document mouseup does not clear the toolbar before click. */
    preserveEditorSelectionOnToolbarMouseDown?: boolean;
};
export function HighlightToolbar({ x, y, hasHighlightId, selectedText, flashcardText, onHighlight, onUnhighlight, onFlashcard, showHighlightButtons = true, preserveEditorSelectionOnToolbarMouseDown = false, }: Props) {
    const { t } = useI18n();
    const word = (flashcardText ?? selectedText).trim();
    return (<div className="fixed z-50 flex -translate-x-1/2 -translate-y-full gap-1 rounded-lg border border-zinc-200 bg-white py-1 pl-1 pr-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-800" style={{ left: x, top: y }} onMouseDown={preserveEditorSelectionOnToolbarMouseDown ? (e) => e.preventDefault() : undefined}>
      {showHighlightButtons && (<>
          <Tooltip content={t("highlightButton")}>
            <button type="button" onClick={onHighlight} className="flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-amber-100 dark:text-zinc-200 dark:hover:bg-amber-500/30">
              <Highlighter className="h-3.5 w-3.5"/>
              {t("highlightButton")}
            </button>
          </Tooltip>
          {hasHighlightId && (<Tooltip content={t("removeHighlight")}>
              <button type="button" onClick={onUnhighlight} className="cursor-pointer rounded px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-red-100 dark:text-zinc-200 dark:hover:bg-red-500/30">
                {t("unhighlightButton")}
              </button>
            </Tooltip>)}
        </>)}
      <Tooltip content={t("addFlashcardTooltip")}>
        <button type="button" onClick={() => word && onFlashcard(word)} disabled={!word} className="flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-500/30 disabled:cursor-not-allowed disabled:opacity-50">
          <Layers className="h-3.5 w-3.5"/>
          {t("flashcardButton")}
        </button>
      </Tooltip>
    </div>);
}
