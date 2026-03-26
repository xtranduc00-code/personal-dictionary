"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import type { TranslationKey } from "@/lib/i18n";
import { AlignCenter, AlignLeft, AlignRight, Trash2 } from "lucide-react";
import type { ImageAlign } from "@/lib/tiptap-image-with-align";

type Props = {
  editor: Editor;
  readOnly: boolean;
  t: (key: TranslationKey) => string;
};

function imageContainerFromNodeDom(nodeDom: Node | null): HTMLElement | null {
  if (!nodeDom || !(nodeDom instanceof HTMLElement)) return null;
  return nodeDom.closest('[data-node="image"]');
}

function rectForContainer(container: HTMLElement) {
  const r = container.getBoundingClientRect();
  const pad = 8;
  const wToolbar = 200;
  let left = r.left + r.width / 2 - wToolbar / 2;
  left = Math.max(pad, Math.min(left, window.innerWidth - wToolbar - pad));
  const top = Math.min(r.bottom + pad, window.innerHeight - 52);
  return { left, top };
}

export function RteImageToolbarPortal({ editor, readOnly, t }: Props) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<{
    left: number;
    top: number;
    imgPos: number;
  } | null>(null);

  const isImageNodeSelection = useCallback(() => {
    const sel = editor.state.selection;
    return sel instanceof NodeSelection && sel.node.type.name === "image";
  }, [editor]);

  const openForContainer = useCallback(
    (container: HTMLElement, imgPos: number) => {
      const { left, top } = rectForContainer(container);
      setBar({ left, top, imgPos });
    },
    [],
  );

  const syncFromSelection = useCallback(() => {
    if (readOnly) {
      setBar(null);
      return;
    }
    const view = editor.view;
    const sel = editor.state.selection;
    if (sel instanceof NodeSelection && sel.node.type.name === "image") {
      const container = imageContainerFromNodeDom(view.nodeDOM(sel.from));
      if (container && view.dom.contains(container)) {
        openForContainer(container, sel.from);
        return;
      }
    }
    setBar(null);
  }, [editor, readOnly, openForContainer]);

  useEffect(() => {
    if (readOnly) {
      setBar(null);
      return;
    }
    const onSel = () => syncFromSelection();
    const onTx = () => syncFromSelection();
    editor.on("selectionUpdate", onSel);
    editor.on("transaction", onTx);
    syncFromSelection();
    return () => {
      editor.off("selectionUpdate", onSel);
      editor.off("transaction", onTx);
    };
  }, [editor, readOnly, syncFromSelection]);

  useEffect(() => {
    if (readOnly) return;
    const dom = editor.view.dom;

    const posFromContainer = (el: HTMLElement): number | null => {
      try {
        const p = editor.view.posAtDOM(el, 0);
        return typeof p === "number" ? p : null;
      } catch {
        return null;
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (isImageNodeSelection()) return;
      const t = (e.target as HTMLElement).closest(
        '[data-node="image"]',
      ) as HTMLElement | null;
      if (!t || !dom.contains(t)) {
        setBar(null);
        return;
      }
      const pos = posFromContainer(t);
      if (pos == null) return;
      openForContainer(t, pos);
    };

    const onMouseOut = (e: MouseEvent) => {
      if (isImageNodeSelection()) return;
      const rel = e.relatedTarget as Node | null;
      if (toolbarRef.current?.contains(rel)) return;
      const fromImg = (e.target as HTMLElement).closest(
        '[data-node="image"]',
      );
      if (!fromImg) return;
      const toImg =
        rel instanceof Element ? rel.closest('[data-node="image"]') : null;
      if (!toImg || toImg !== fromImg) {
        setBar(null);
      }
    };

    dom.addEventListener("mousemove", onMouseMove);
    dom.addEventListener("mouseout", onMouseOut);
    return () => {
      dom.removeEventListener("mousemove", onMouseMove);
      dom.removeEventListener("mouseout", onMouseOut);
    };
  }, [editor, readOnly, isImageNodeSelection, openForContainer]);

  useEffect(() => {
    if (readOnly || !bar) return;
    const onScroll = () => {
      if (isImageNodeSelection()) syncFromSelection();
      else setBar(null);
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [readOnly, bar, isImageNodeSelection, syncFromSelection]);

  const runAlign = (align: ImageAlign) => {
    if (bar == null) return;
    editor
      .chain()
      .focus()
      .setNodeSelection(bar.imgPos)
      .updateAttributes("image", { align: align ?? null })
      .run();
  };

  const runDelete = () => {
    if (bar == null) return;
    editor.chain().focus().setNodeSelection(bar.imgPos).deleteSelection().run();
    setBar(null);
  };

  if (readOnly || bar == null || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      ref={toolbarRef}
      className="fixed z-[250] flex w-[200px] max-w-[calc(100vw-16px)] items-center justify-center gap-0.5 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-600 dark:bg-zinc-900"
      style={{ left: bar.left, top: bar.top }}
      role="toolbar"
      aria-label={t("rteImageToolbarLabel")}
      onMouseDown={(e) => e.preventDefault()}
      onMouseLeave={() => {
        if (!isImageNodeSelection()) setBar(null);
      }}
    >
      <button
        type="button"
        className="rounded p-1.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
        title={t("rteImageAlignLeft")}
        onClick={() => runAlign("left")}
      >
        <AlignLeft size={16} strokeWidth={2} />
      </button>
      <button
        type="button"
        className="rounded p-1.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
        title={t("rteImageAlignCenter")}
        onClick={() => runAlign("center")}
      >
        <AlignCenter size={16} strokeWidth={2} />
      </button>
      <button
        type="button"
        className="rounded p-1.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
        title={t("rteImageAlignRight")}
        onClick={() => runAlign("right")}
      >
        <AlignRight size={16} strokeWidth={2} />
      </button>
      <div className="mx-0.5 h-5 w-px bg-zinc-200 dark:bg-zinc-600" />
      <button
        type="button"
        className="rounded p-1.5 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/50"
        title={t("rteImageDelete")}
        onClick={() => runDelete()}
      >
        <Trash2 size={16} strokeWidth={2} />
      </button>
    </div>,
    document.body,
  );
}
