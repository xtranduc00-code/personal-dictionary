"use client";

import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import type { TranslationKey } from "@/lib/i18n";
import { selectWholeTable } from "@/lib/tiptap-select-whole-table";

export type RteTableContextMenuPosition = { x: number; y: number };

export type RteTableContextMenuCan = {
  canDeleteTable: boolean;
  canAddRowBefore: boolean;
  canAddRowAfter: boolean;
  canDeleteRow: boolean;
  canAddColumnBefore: boolean;
  canAddColumnAfter: boolean;
  canDeleteColumn: boolean;
  canMergeCells: boolean;
  canSplitCell: boolean;
  canToggleHeaderRow: boolean;
};

const MENU_MIN_W = 220;
const MENU_PAD = 8;

function execClipboard(editor: Editor, cmd: "cut" | "copy" | "paste") {
  editor.chain().focus().run();
  try {
    return document.execCommand(cmd);
  } catch {
    return false;
  }
}

function MenuRow({
  label,
  disabled,
  onPick,
}: {
  label: string;
  disabled?: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className="flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-sm text-zinc-800 transition enabled:hover:bg-zinc-100 enabled:active:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-100 dark:enabled:hover:bg-zinc-800 dark:enabled:active:bg-zinc-700"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        if (disabled) return;
        onPick();
      }}
    >
      {label}
    </button>
  );
}

function MenuSep() {
  return (
    <div
      className="my-1 border-t border-zinc-200 dark:border-zinc-600"
      role="separator"
    />
  );
}

type Props = {
  editor: Editor;
  position: RteTableContextMenuPosition | null;
  onClose: () => void;
  t: (key: TranslationKey) => string;
  can: RteTableContextMenuCan;
  onInsertLink: () => void;
};

export function RteTableContextMenuPortal({
  editor,
  position,
  onClose,
  t,
  can,
  onInsertLink,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<{ top: number; left: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    if (!position || typeof window === "undefined") {
      setPlaced(null);
      return;
    }
    const el = panelRef.current;
    if (!el) return;
    const w = el.offsetWidth || MENU_MIN_W;
    const h = el.offsetHeight || 280;
    let left = position.x;
    let top = position.y;
    if (left + w + MENU_PAD > window.innerWidth) {
      left = window.innerWidth - w - MENU_PAD;
    }
    if (top + h + MENU_PAD > window.innerHeight) {
      top = window.innerHeight - h - MENU_PAD;
    }
    left = Math.max(MENU_PAD, left);
    top = Math.max(MENU_PAD, top);
    setPlaced((prev) =>
      prev && prev.left === left && prev.top === top
        ? prev
        : { left, top },
    );
  }, [position]);

  useEffect(() => {
    if (!position) return;
    const onPointerDown = (e: PointerEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [position, onClose]);

  if (!position || typeof document === "undefined") {
    return null;
  }

  const run = (fn: () => boolean) => {
    fn();
    onClose();
  };

  const left = placed?.left ?? position.x;
  const top = placed?.top ?? position.y;

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-[400] min-w-[220px] rounded-lg border border-zinc-200 bg-white py-1 pl-1 pr-1 shadow-xl dark:border-zinc-600 dark:bg-zinc-900"
      style={{ left, top }}
      role="menu"
      aria-label={t("rteTableContextMenuLabel")}
    >
      <MenuRow
        label={t("rteTableCtxCut")}
        onPick={() => {
          execClipboard(editor, "cut");
          onClose();
        }}
      />
      <MenuRow
        label={t("rteTableCtxCopy")}
        onPick={() => {
          execClipboard(editor, "copy");
          onClose();
        }}
      />
      <MenuRow
        label={t("rteTableCtxPaste")}
        onPick={() => {
          execClipboard(editor, "paste");
          onClose();
        }}
      />
      <MenuSep />
      <MenuRow
        label={t("rteTableAddRowAbove")}
        disabled={!can.canAddRowBefore}
        onPick={() =>
          run(() => editor.chain().focus().addRowBefore().run())
        }
      />
      <MenuRow
        label={t("rteTableAddRow")}
        disabled={!can.canAddRowAfter}
        onPick={() => run(() => editor.chain().focus().addRowAfter().run())}
      />
      <MenuRow
        label={t("rteTableAddColumnLeft")}
        disabled={!can.canAddColumnBefore}
        onPick={() =>
          run(() => editor.chain().focus().addColumnBefore().run())
        }
      />
      <MenuRow
        label={t("rteTableAddColumn")}
        disabled={!can.canAddColumnAfter}
        onPick={() =>
          run(() => editor.chain().focus().addColumnAfter().run())
        }
      />
      <MenuSep />
      <MenuRow
        label={t("rteTableDeleteRow")}
        disabled={!can.canDeleteRow}
        onPick={() => run(() => editor.chain().focus().deleteRow().run())}
      />
      <MenuRow
        label={t("rteTableDeleteColumn")}
        disabled={!can.canDeleteColumn}
        onPick={() =>
          run(() => editor.chain().focus().deleteColumn().run())
        }
      />
      <MenuRow
        label={t("rteTableDelete")}
        disabled={!can.canDeleteTable}
        onPick={() => run(() => editor.chain().focus().deleteTable().run())}
      />
      <MenuSep />
      <MenuRow
        label={t("rteTableToggleHeaderRow")}
        disabled={!can.canToggleHeaderRow}
        onPick={() =>
          run(() => editor.chain().focus().toggleHeaderRow().run())
        }
      />
      <MenuRow
        label={t("rteTableMergeCells")}
        disabled={!can.canMergeCells}
        onPick={() => run(() => editor.chain().focus().mergeCells().run())}
      />
      <MenuRow
        label={t("rteTableSplitCell")}
        disabled={!can.canSplitCell}
        onPick={() => run(() => editor.chain().focus().splitCell().run())}
      />
      <MenuSep />
      <MenuRow
        label={t("rteTableSelectAll")}
        onPick={() => {
          editor.chain().focus().run();
          selectWholeTable(editor);
          onClose();
        }}
      />
      <MenuRow
        label={t("rteTableCtxInsertLink")}
        onPick={() => {
          onInsertLink();
          onClose();
        }}
      />
    </div>,
    document.body,
  );
}
