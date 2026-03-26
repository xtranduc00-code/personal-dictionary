"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Nunito } from "next/font/google";
import type { Editor } from "@tiptap/core";
import {
  EditorContent,
  useEditor,
  useEditorState,
  type UseEditorOptions,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Color, FontSize, TextStyle } from "@tiptap/extension-text-style";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { useI18n } from "@/components/i18n-provider";
import { Tooltip } from "@/components/ui/Tooltip";
import { NotesListBehavior } from "@/lib/tiptap-notes-list-behavior";
import { selectWholeTable } from "@/lib/tiptap-select-whole-table";
import { ResizableTableRow, TableRowResize } from "@/lib/tiptap-table-row-resize";
import { TiptapTableExit } from "@/lib/tiptap-table-exit";
import { RteTableContextMenuPortal } from "@/components/rte-table-context-menu";
import { RteImageToolbarPortal } from "@/components/rte-image-toolbar";
import { ImageWithAlign } from "@/lib/tiptap-image-with-align";
import {
  RTE_DEFAULT_FONT_PX,
  rteBumpFontSize,
  rteParseFontSizePx,
} from "@/lib/rte-font-size";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link as LinkIcon,
  Highlighter,
  Quote,
  Code,
  Table as TableIcon,
  Grid2x2,
  Minus,
  Trash2,
  BetweenVerticalEnd,
  BetweenHorizontalEnd,
  X,
  Undo2,
  Redo2,
  Plus,
  Palette,
} from "lucide-react";

const RTE_COLOR_SWATCHES = [
  "#18181b",
  "#52525b",
  "#dc2626",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#0891b2",
  "#2563eb",
  "#7c3aed",
  "#db2777",
] as const;

const RTE_TOOLTIP_DELAY = 0;
const RTE_TOOLTIP_HIDE = 40;
const RTE_TOOLTIP_OFFSET = 6;
const clampInt = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(Number.isFinite(n) ? n : min)));
const nunito = Nunito({
  subsets: ["latin", "vietnamese"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});
const LINE_HEIGHT_LS = "ken-notes-editor-line-height";
const LINE_HEIGHT_OPTIONS = [
  { value: "1.35", label: "1.35" },
  { value: "1.5", label: "1.5" },
  { value: "1.65", label: "1.65" },
  { value: "1.8", label: "1.8" },
  { value: "2", label: "2" },
] as const;
/** Khi snapshot useEditorState chưa có ctx.editor (lệch nhịp với useEditor trên Next) — không được trả null để tránh cả khối editor biến mất. */
const RTE_TOOLBAR_IDLE = {
  canUndo: false,
  canRedo: false,
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  h1: false,
  h2: false,
  h3: false,
  bulletList: false,
  orderedList: false,
  taskList: false,
  alignLeft: false,
  alignCenter: false,
  alignRight: false,
  link: false,
  highlight: false,
  blockquote: false,
  codeBlock: false,
  table: false,
  canDeleteTable: false,
  canAddRowAfter: false,
  canAddRowBefore: false,
  canDeleteRow: false,
  canAddColumnAfter: false,
  canAddColumnBefore: false,
  canDeleteColumn: false,
  canMergeCells: false,
  canSplitCell: false,
  canToggleHeaderRow: false,
  textColor: "",
  textFontSizePx: RTE_DEFAULT_FONT_PX,
};
type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeightClassName?: string;
  /** When true, content is view-only (no toolbar, no edits). */
  readOnly?: boolean;
};
function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Write something...",
  className,
  minHeightClassName = "min-h-[260px]",
  readOnly = false,
}: Props) {
  const { t } = useI18n();
  const editorRef = useRef<Editor | null>(null);
  /** Tránh onChange đẩy HTML rỗng/sai lên parent khi setContent từ props (remount / đổi note). */
  const suppressOnChangeRef = useRef(false);
  const tablePickerRef = useRef<HTMLDivElement | null>(null);
  const tablePanelRef = useRef<HTMLDivElement | null>(null);
  const [tablePopoverPos, setTablePopoverPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [lineHeight, setLineHeight] = useState<string>("1.65");
  const [tablePickerOpen, setTablePickerOpen] = useState(false);
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);
  const [tableWithHeader, setTableWithHeader] = useState(true);
  const colorBtnRef = useRef<HTMLButtonElement | null>(null);
  const colorPanelRef = useRef<HTMLDivElement | null>(null);
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const [colorPopoverPos, setColorPopoverPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [tableContextMenu, setTableContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const closeTableContextMenu = useCallback(() => {
    setTableContextMenu(null);
    queueMicrotask(() => {
      editorRef.current?.chain().focus().run();
    });
  }, []);
  const handleEditorContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (readOnly) return;
      const ed = editorRef.current;
      if (!ed) return;
      const el = e.target as HTMLElement | null;
      if (!el?.closest?.("table")) return;
      const root = ed.view.dom;
      if (!root.contains(el)) return;
      const coords = ed.view.posAtCoords({
        left: e.clientX,
        top: e.clientY,
      });
      if (coords == null) return;
      e.preventDefault();
      e.stopPropagation();
      const doc = ed.state.doc;
      const $pos = doc.resolve(coords.pos);
      ed.view.dispatch(ed.state.tr.setSelection(TextSelection.near($pos)));
      setTableContextMenu({ x: e.clientX, y: e.clientY });
    },
    [readOnly],
  );
  useEffect(() => {
    try {
      const v = localStorage.getItem(LINE_HEIGHT_LS);
      if (v && LINE_HEIGHT_OPTIONS.some((o) => o.value === v)) {
        setLineHeight(v);
      }
    } catch {}
  }, []);
  const setLineHeightPersist = (v: string) => {
    setLineHeight(v);
    try {
      localStorage.setItem(LINE_HEIGHT_LS, v);
    } catch {}
  };
  const extensions = useMemo(
    () => [
      StarterKit.configure({
        link: false,
        underline: false,
      }),
      Underline,
      TextStyle,
      Color,
      FontSize,
      Placeholder.configure({ placeholder }),
      TableKit.configure({
        table: {
          resizable: true,
          renderWrapper: true,
          handleWidth: 6,
          /** Tránh ô quá hẹp — khó bôi đen và gõ */
          cellMinWidth: 80,
          lastColumnResizable: true,
        },
        /** Thay bằng hàng có thuộc tính rowHeight (kéo cạnh dưới tr) */
        tableRow: false,
      }),
      ResizableTableRow,
      TableRowResize,
      TiptapTableExit,
      Link.configure({ openOnClick: false }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
        /** Ô bảng mới dùng đoạn văn — mặc định trái, tránh kẹt center từ thanh công cụ. */
        defaultAlignment: "left",
      }),
      Highlight.configure({ multicolor: false }),
      TaskList.configure({ HTMLAttributes: { class: "task-list" } }),
      TaskItem.configure({ nested: true }),
      ImageWithAlign.configure({
        allowBase64: true,
        inline: false,
        HTMLAttributes: { class: "tiptap-image" },
        resize: {
          enabled: true,
          directions: [
            "top-left",
            "top",
            "top-right",
            "right",
            "bottom-right",
            "bottom",
            "bottom-left",
            "left",
          ],
          minWidth: 48,
          minHeight: 48,
          alwaysPreserveAspectRatio: true,
        },
      }),
      NotesListBehavior,
    ],
    [placeholder],
  );
  const editor = useEditor({
    /** Single hoisted `@tiptap/core` via package.json overrides; cast silences duplicate-path type noise. */
    extensions: extensions as NonNullable<UseEditorOptions["extensions"]>,
    content: value || "",
    immediatelyRender: false,
    editable: !readOnly,
    editorProps: {
      attributes: {
        class: [
          "tiptap",
          "focus:outline-none",
          "break-words px-3 py-3 text-sm text-zinc-900 dark:text-zinc-100 md:px-4",
          minHeightClassName,
        ].join(" "),
      },
      handleDOMEvents: {
        mousedown(view, event) {
          if (!view.editable) return false;
          const target = event.target as HTMLElement;
          if (
            target.closest('[data-node="image"]') ||
            target.closest("[data-resize-handle]")
          ) {
            return false;
          }
          const sel = view.state.selection;
          if (sel instanceof NodeSelection && sel.node.type.name === "image") {
            const me = event as MouseEvent;
            const coords = view.posAtCoords({
              left: me.clientX,
              top: me.clientY,
            });
            if (coords != null) {
              const $pos = view.state.doc.resolve(coords.pos);
              view.dispatch(
                view.state.tr.setSelection(TextSelection.near($pos)),
              );
            }
          }
          return false;
        },
      },
      handlePaste: (_view, event) => {
        const data = event.clipboardData;
        if (!data?.items) return false;
        for (let i = 0; i < data.items.length; i++) {
          const item = data.items[i];
          if (!item.type.startsWith("image/")) continue;
          event.preventDefault();
          const file = item.getAsFile();
          if (!file) return true;
          void readImageFileAsDataUrl(file).then((src) => {
            editorRef.current?.chain().focus().setImage({ src }).run();
          });
          return true;
        }
        return false;
      },
      handleDrop: (_view, event, _slice, moved) => {
        if (moved) return false;
        const dt = event.dataTransfer;
        if (!dt?.files?.length) return false;
        const imageFiles = Array.from(dt.files).filter((f) =>
          f.type.startsWith("image/"),
        );
        if (!imageFiles.length) return false;
        event.preventDefault();
        void (async () => {
          const ed = editorRef.current;
          if (!ed) return;
          for (const file of imageFiles) {
            const src = await readImageFileAsDataUrl(file);
            ed.chain().focus().setImage({ src }).run();
          }
        })();
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      if (readOnly) return;
      if (suppressOnChangeRef.current) return;
      latestOnChangeRef.current(editor.getHTML());
    },
  });
  useEffect(() => {
    if (editor) {
      editor.setEditable(!readOnly);
    }
  }, [editor, readOnly]);
  useEffect(() => {
    editorRef.current = editor;
    return () => {
      editorRef.current = null;
    };
  }, [editor]);
  useEffect(() => {
    if (!tablePickerOpen) {
      setTablePopoverPos(null);
      return;
    }
    const panelW = 220;
    const updatePos = () => {
      const el = tablePickerRef.current;
      if (!el || typeof window === "undefined") return;
      const r = el.getBoundingClientRect();
      const left = Math.min(
        Math.max(8, r.right - panelW),
        window.innerWidth - panelW - 8,
      );
      setTablePopoverPos({
        top: r.bottom + 6,
        left,
        width: panelW,
      });
    };
    updatePos();
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    let removeDocListener: (() => void) | null = null;
    const tid = window.setTimeout(() => {
      const onDocPointerDown = (e: PointerEvent) => {
        const t = e.target as Node;
        if (tablePickerRef.current?.contains(t)) return;
        if (tablePanelRef.current?.contains(t)) return;
        setTablePickerOpen(false);
      };
      document.addEventListener("pointerdown", onDocPointerDown, true);
      removeDocListener = () =>
        document.removeEventListener("pointerdown", onDocPointerDown, true);
    }, 0);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
      window.clearTimeout(tid);
      removeDocListener?.();
    };
  }, [tablePickerOpen]);

  useEffect(() => {
    if (!colorMenuOpen) {
      setColorPopoverPos(null);
      return;
    }
    const updatePos = () => {
      const el = colorBtnRef.current;
      if (!el || typeof window === "undefined") return;
      const r = el.getBoundingClientRect();
      const panelW = 220;
      const left = Math.min(
        Math.max(8, r.left),
        window.innerWidth - panelW - 8,
      );
      setColorPopoverPos({ top: r.bottom + 6, left });
    };
    updatePos();
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    let removeDocListener: (() => void) | null = null;
    const tid = window.setTimeout(() => {
      const onDocPointerDown = (e: PointerEvent) => {
        const t = e.target as Node;
        if (colorBtnRef.current?.contains(t)) return;
        if (colorPanelRef.current?.contains(t)) return;
        setColorMenuOpen(false);
      };
      document.addEventListener("pointerdown", onDocPointerDown, true);
      removeDocListener = () =>
        document.removeEventListener("pointerdown", onDocPointerDown, true);
    }, 0);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
      window.clearTimeout(tid);
      removeDocListener?.();
    };
  }, [colorMenuOpen]);

  const editorState = useEditorState({
    editor,
    selector: (ctx) => {
      const e = ctx.editor;
      if (!e) return RTE_TOOLBAR_IDLE;
      /** Mọi lệnh can()/isActive phải an toàn — nếu selector ném lỗi, useSyncExternalStore có thể làm editor không bao giờ mount (UI kẹt "Loading…"). */
      try {
        const can = e.can();
        return {
          canUndo:
            typeof (can as { undo?: () => boolean }).undo === "function"
              ? (can as { undo: () => boolean }).undo()
              : false,
          canRedo:
            typeof (can as { redo?: () => boolean }).redo === "function"
              ? (can as { redo: () => boolean }).redo()
              : false,
          bold: e.isActive("bold"),
          italic: e.isActive("italic"),
          underline: e.isActive("underline"),
          strike: e.isActive("strike"),
          h1: e.isActive("heading", { level: 1 }),
          h2: e.isActive("heading", { level: 2 }),
          h3: e.isActive("heading", { level: 3 }),
          bulletList: e.isActive("bulletList"),
          orderedList: e.isActive("orderedList"),
          taskList: e.isActive("taskList"),
          alignLeft: e.isActive({ textAlign: "left" }),
          alignCenter: e.isActive({ textAlign: "center" }),
          alignRight: e.isActive({ textAlign: "right" }),
          link: e.isActive("link"),
          highlight: e.isActive("highlight"),
          blockquote: e.isActive("blockquote"),
          codeBlock: e.isActive("codeBlock"),
          table: e.isActive("table"),
          canDeleteTable:
            typeof (can as { deleteTable?: () => boolean }).deleteTable ===
            "function"
              ? (can as { deleteTable: () => boolean }).deleteTable()
              : false,
          canAddRowAfter:
            typeof (can as { addRowAfter?: () => boolean }).addRowAfter ===
            "function"
              ? (can as { addRowAfter: () => boolean }).addRowAfter()
              : false,
          canAddRowBefore:
            typeof (can as { addRowBefore?: () => boolean }).addRowBefore ===
            "function"
              ? (can as { addRowBefore: () => boolean }).addRowBefore()
              : false,
          canDeleteRow:
            typeof (can as { deleteRow?: () => boolean }).deleteRow ===
            "function"
              ? (can as { deleteRow: () => boolean }).deleteRow()
              : false,
          canAddColumnAfter:
            typeof (can as { addColumnAfter?: () => boolean }).addColumnAfter ===
            "function"
              ? (can as { addColumnAfter: () => boolean }).addColumnAfter()
              : false,
          canAddColumnBefore:
            typeof (can as { addColumnBefore?: () => boolean })
              .addColumnBefore === "function"
              ? (can as { addColumnBefore: () => boolean }).addColumnBefore()
              : false,
          canDeleteColumn:
            typeof (can as { deleteColumn?: () => boolean }).deleteColumn ===
            "function"
              ? (can as { deleteColumn: () => boolean }).deleteColumn()
              : false,
          canMergeCells:
            typeof (can as { mergeCells?: () => boolean }).mergeCells ===
            "function"
              ? (can as { mergeCells: () => boolean }).mergeCells()
              : false,
          canSplitCell:
            typeof (can as { splitCell?: () => boolean }).splitCell ===
            "function"
              ? (can as { splitCell: () => boolean }).splitCell()
              : false,
          canToggleHeaderRow:
            typeof (can as { toggleHeaderRow?: () => boolean })
              .toggleHeaderRow === "function"
              ? (can as { toggleHeaderRow: () => boolean }).toggleHeaderRow()
              : false,
          ...(() => {
            const ts = e.getAttributes("textStyle") as {
              color?: string | null;
              fontSize?: string | null;
            };
            return {
              textColor: typeof ts.color === "string" ? ts.color : "",
              textFontSizePx:
                rteParseFontSizePx(ts.fontSize ?? undefined) ??
                RTE_DEFAULT_FONT_PX,
            };
          })(),
        };
      } catch {
        return RTE_TOOLBAR_IDLE;
      }
    },
  });
  const latestOnChangeRef = useRef(onChange);

  useEffect(() => {
    latestOnChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!editor) return;

    const current = editor.getHTML();
    const next = value || "";

    if (current === next) return;

    suppressOnChangeRef.current = true;

    editor.commands.setContent(next, { emitUpdate: false });

    requestAnimationFrame(() => {
      suppressOnChangeRef.current = false;
    });
  }, [editor, value]);

  if (!editor) {
    return (
      <div className={`${nunito.className} ${className ?? ""}`}>
        <div
          className={`flex items-center justify-center rounded-xl border border-zinc-300 bg-zinc-50 text-sm text-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-400 ${minHeightClassName}`}
          aria-busy="true"
        >
          {t("loading")}
        </div>
      </div>
    );
  }
  const tb = editorState ?? RTE_TOOLBAR_IDLE;
  const activeBtn =
    "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900";
  const inactiveBtn =
    "text-zinc-700 hover:bg-zinc-200 dark:text-zinc-200 dark:hover:bg-zinc-700";
  const baseBtn =
    "rounded-md p-1.5 transition disabled:opacity-40 flex items-center justify-center";
  const btn = (active: boolean) =>
    `${baseBtn} ${active ? activeBtn : inactiveBtn}`;
  const RteTBtn = ({
    label,
    active,
    disabled,
    onClick,
    children,
  }: {
    label: string;
    active: boolean;
    disabled?: boolean;
    onClick: () => void;
    children: ReactNode;
  }) => (
    <Tooltip
      content={label}
      delayShow={RTE_TOOLTIP_DELAY}
      delayHide={RTE_TOOLTIP_HIDE}
      placement="bottom"
      offset={RTE_TOOLTIP_OFFSET}
    >
      <button
        type="button"
        aria-label={label}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        disabled={disabled}
        className={btn(active)}
      >
        {children}
      </button>
    </Tooltip>
  );
  const applyInsertTable = () => {
    const rows = clampInt(tableRows, 1, 20);
    const cols = clampInt(tableCols, 1, 20);
    editor
      .chain()
      .focus()
      .insertTable({ rows, cols, withHeaderRow: tableWithHeader })
      .run();
    setTablePickerOpen(false);
  };
  const toggleTablePicker = () => {
    editor.chain().focus().run();
    setTablePickerOpen((o) => !o);
  };
  const handleLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt(`${t("rteUrlPrompt")} `, prev ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };
  return (
    <div className={`${nunito.className} ${className ?? ""}`}>
      {!readOnly ? (
        <div className="sticky top-0 z-20 rounded-t-xl border border-zinc-300 border-b-zinc-200/80 bg-zinc-50 py-1.5 pl-1 pr-0 shadow-sm dark:border-zinc-700 dark:border-b-zinc-600 dark:bg-zinc-900">
          <div className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
            <div className="flex w-max min-w-full flex-col gap-0 pr-2 sm:min-w-0">
            <div className="flex w-max flex-nowrap items-center gap-0.5">
              <RteTBtn
                label={t("rteUndo")}
                active={false}
                disabled={!tb.canUndo}
                onClick={() => editor.chain().focus().undo().run()}
              >
                <Undo2 size={14} />
              </RteTBtn>
              <RteTBtn
                label={t("rteRedo")}
                active={false}
                disabled={!tb.canRedo}
                onClick={() => editor.chain().focus().redo().run()}
              >
                <Redo2 size={14} />
              </RteTBtn>
              <div className="mx-1 h-5 w-px shrink-0 bg-zinc-300 dark:bg-zinc-600" />
              <RteTBtn
                label={t("rteBold")}
                active={tb.bold}
                disabled={!editor.can().toggleBold()}
                onClick={() => editor.chain().focus().toggleBold().run()}
              >
                <Bold size={14} />
              </RteTBtn>
              <RteTBtn
                label={t("rteItalic")}
                active={tb.italic}
                disabled={!editor.can().toggleItalic()}
                onClick={() => editor.chain().focus().toggleItalic().run()}
              >
                <Italic size={14} />
              </RteTBtn>
              <RteTBtn
                label={t("rteUnderline")}
                active={tb.underline}
                disabled={!editor.can().toggleUnderline()}
                onClick={() => editor.chain().focus().toggleUnderline().run()}
              >
                <UnderlineIcon size={14} />
              </RteTBtn>
              <RteTBtn
                label={t("rteStrikethrough")}
                active={tb.strike}
                disabled={!editor.can().toggleStrike()}
                onClick={() => editor.chain().focus().toggleStrike().run()}
              >
                <Strikethrough size={14} />
              </RteTBtn>

              <div className="mx-1 h-5 w-px shrink-0 bg-zinc-300 dark:bg-zinc-600" />

              <RteTBtn
                label={t("rteFontSizeDecrease")}
                active={false}
                disabled={readOnly}
                onClick={() => rteBumpFontSize(editor, -1)}
              >
                <Minus size={14} />
              </RteTBtn>
              <span
                className="min-w-[1.75rem] shrink-0 text-center text-[11px] font-semibold tabular-nums text-zinc-600 dark:text-zinc-300"
                aria-hidden
              >
                {tb.textFontSizePx}
              </span>
              <RteTBtn
                label={t("rteFontSizeIncrease")}
                active={false}
                disabled={readOnly}
                onClick={() => rteBumpFontSize(editor, 1)}
              >
                <Plus size={14} />
              </RteTBtn>

              <Tooltip
                content={t("rteTextColor")}
                delayShow={RTE_TOOLTIP_DELAY}
                delayHide={RTE_TOOLTIP_HIDE}
                placement="bottom"
                offset={RTE_TOOLTIP_OFFSET}
              >
                <button
                  ref={colorBtnRef}
                  type="button"
                  disabled={readOnly}
                  aria-label={t("rteTextColor")}
                  aria-expanded={colorMenuOpen}
                  aria-haspopup="dialog"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setColorMenuOpen((o) => !o)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-zinc-300 bg-white transition dark:border-zinc-600 dark:bg-zinc-800"
                  style={{
                    borderBottomWidth: 3,
                    borderBottomColor: tb.textColor || "#a1a1aa",
                  }}
                >
                  <Palette size={14} className="text-zinc-700 dark:text-zinc-200" />
                </button>
              </Tooltip>

              <div className="mx-1 h-5 w-px bg-zinc-300 dark:bg-zinc-600" />

              <Tooltip
                content={t("rteLineHeight")}
                delayShow={RTE_TOOLTIP_DELAY}
                delayHide={RTE_TOOLTIP_HIDE}
                placement="bottom"
                offset={RTE_TOOLTIP_OFFSET}
              >
                <label className="flex shrink-0 items-center gap-1 pl-1">
                  <span className="sr-only">{t("rteLineHeight")}</span>
                  <select
                    aria-label={t("rteLineHeight")}
                    value={lineHeight}
                    onChange={(e) => setLineHeightPersist(e.target.value)}
                    className="h-7 max-w-[4.5rem] cursor-pointer rounded-md border border-zinc-300 bg-white px-1.5 text-xs text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                  >
                    {LINE_HEIGHT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        ↕ {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              </Tooltip>

              <div className="mx-1 h-5 w-px bg-zinc-300 dark:bg-zinc-600" />

              <RteTBtn
                label={t("rteHeading1")}
                active={tb.h1}
                onClick={() =>
                  editor.chain().focus().toggleHeading({ level: 1 }).run()
                }
              >
                <Heading1 size={14} />
              </RteTBtn>
              <RteTBtn
                label={t("rteHeading2")}
                active={tb.h2}
                onClick={() =>
                  editor.chain().focus().toggleHeading({ level: 2 }).run()
                }
              >
                <Heading2 size={14} />
              </RteTBtn>
              <RteTBtn
                label={t("rteHeading3")}
                active={tb.h3}
                onClick={() =>
                  editor.chain().focus().toggleHeading({ level: 3 }).run()
                }
              >
                <Heading3 size={14} />
              </RteTBtn>

              <div className="mx-1 h-5 w-px bg-zinc-300 dark:bg-zinc-600" />

              <RteTBtn
                label={t("rteBulletList")}
                active={tb.bulletList}
                onClick={() => editor.chain().focus().toggleBulletList().run()}
              >
                <List size={14} />
              </RteTBtn>
              <RteTBtn
                label={t("rteOrderedList")}
                active={tb.orderedList}
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
              >
                <ListOrdered size={14} />
              </RteTBtn>
              <RteTBtn
                label={t("rteTaskList")}
                active={tb.taskList}
                onClick={() => editor.chain().focus().toggleTaskList().run()}
              >
                <ListChecks size={14} />
              </RteTBtn>

              <div className="mx-1 h-5 w-px bg-zinc-300 dark:bg-zinc-600" />

              <RteTBtn
                label={t("rteAlignLeft")}
                active={tb.alignLeft}
                onClick={() =>
                  editor.chain().focus().setTextAlign("left").run()
                }
              >
                <AlignLeft size={14} />
              </RteTBtn>
              <RteTBtn
                label={t("rteAlignCenter")}
                active={tb.alignCenter}
                onClick={() =>
                  editor.chain().focus().setTextAlign("center").run()
                }
              >
                <AlignCenter size={14} />
              </RteTBtn>
              <RteTBtn
                label={t("rteAlignRight")}
                active={tb.alignRight}
                onClick={() =>
                  editor.chain().focus().setTextAlign("right").run()
                }
              >
                <AlignRight size={14} />
              </RteTBtn>

              <div className="mx-1 h-5 w-px bg-zinc-300 dark:bg-zinc-600" />

              <RteTBtn
                label={t("rteLink")}
                active={tb.link}
                onClick={handleLink}
              >
                <LinkIcon size={14} />
              </RteTBtn>
              <RteTBtn
                label={t("rteHighlight")}
                active={tb.highlight}
                onClick={() => editor.chain().focus().toggleHighlight().run()}
              >
                <Highlighter size={14} />
              </RteTBtn>
              <RteTBtn
                label={t("rteBlockquote")}
                active={tb.blockquote}
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
              >
                <Quote size={14} />
              </RteTBtn>
              <RteTBtn
                label={t("rteCodeBlock")}
                active={tb.codeBlock}
                onClick={() => editor.chain().focus().toggleCodeBlock().run()}
              >
                <Code size={14} />
              </RteTBtn>

              {tb.table && (
                <>
                  <div className="mx-1 h-5 w-px shrink-0 bg-zinc-300 dark:bg-zinc-600" />
                  <RteTBtn
                    label={t("rteTableSelectAll")}
                    active={false}
                    disabled={readOnly}
                    onClick={() => {
                      editor.chain().focus().run();
                      selectWholeTable(editor);
                    }}
                  >
                    <Grid2x2 size={14} />
                  </RteTBtn>
                  <RteTBtn
                    label={t("rteTableDelete")}
                    active={false}
                    disabled={!tb.canDeleteTable}
                    onClick={() => editor.chain().focus().deleteTable().run()}
                  >
                    <Trash2 size={14} />
                  </RteTBtn>
                  <RteTBtn
                    label={t("rteTableAddRow")}
                    active={false}
                    disabled={!tb.canAddRowAfter}
                    onClick={() => editor.chain().focus().addRowAfter().run()}
                  >
                    <BetweenVerticalEnd size={14} />
                  </RteTBtn>
                  <RteTBtn
                    label={t("rteTableDeleteRow")}
                    active={false}
                    disabled={!tb.canDeleteRow}
                    onClick={() => editor.chain().focus().deleteRow().run()}
                  >
                    <Minus size={14} />
                  </RteTBtn>
                  <RteTBtn
                    label={t("rteTableAddColumn")}
                    active={false}
                    disabled={!tb.canAddColumnAfter}
                    onClick={() =>
                      editor.chain().focus().addColumnAfter().run()
                    }
                  >
                    <BetweenHorizontalEnd size={14} />
                  </RteTBtn>
                  <RteTBtn
                    label={t("rteTableDeleteColumn")}
                    active={false}
                    disabled={!tb.canDeleteColumn}
                    onClick={() => editor.chain().focus().deleteColumn().run()}
                  >
                    <X size={14} />
                  </RteTBtn>
                </>
              )}

              <div className="mx-1 h-5 w-px shrink-0 bg-zinc-300 dark:bg-zinc-600" />

              <div className="relative shrink-0" ref={tablePickerRef}>
                <Tooltip
                  content={t("rteInsertTable")}
                  delayShow={RTE_TOOLTIP_DELAY}
                  delayHide={RTE_TOOLTIP_HIDE}
                  placement="bottom"
                  offset={RTE_TOOLTIP_OFFSET}
                >
                  <button
                    type="button"
                    aria-label={t("rteInsertTable")}
                    aria-expanded={tablePickerOpen}
                    aria-haspopup="dialog"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={toggleTablePicker}
                    className={btn(tb.table)}
                  >
                    <TableIcon size={14} />
                  </button>
                </Tooltip>
              </div>
              <RteTBtn
                label={t("rteHorizontalRule")}
                active={false}
                onClick={() => editor.chain().focus().setHorizontalRule().run()}
              >
                <Minus size={14} />
              </RteTBtn>
            </div>
            </div>
          </div>
        </div>
      ) : null}

      {!readOnly &&
        typeof document !== "undefined" &&
        tablePickerOpen &&
        tablePopoverPos &&
        createPortal(
          <div
            ref={tablePanelRef}
            className="fixed z-[300] rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-600 dark:bg-zinc-900"
            role="dialog"
            aria-label={t("rteInsertTable")}
            style={{
              top: tablePopoverPos.top,
              left: tablePopoverPos.left,
              width: tablePopoverPos.width,
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col gap-2.5">
              <label className="flex items-center justify-between gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                <span>{t("rteTableRows")}</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={tableRows}
                  onChange={(e) =>
                    setTableRows(clampInt(Number(e.target.value), 1, 20))
                  }
                  className="h-8 w-16 rounded-md border border-zinc-300 bg-zinc-50 px-2 text-right text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </label>
              <label className="flex items-center justify-between gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                <span>{t("rteTableCols")}</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={tableCols}
                  onChange={(e) =>
                    setTableCols(clampInt(Number(e.target.value), 1, 20))
                  }
                  className="h-8 w-16 rounded-md border border-zinc-300 bg-zinc-50 px-2 text-right text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={tableWithHeader}
                  onChange={(e) => setTableWithHeader(e.target.checked)}
                  className="rounded border-zinc-400"
                />
                {t("rteTableHeaderRow")}
              </label>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={applyInsertTable}
                className="mt-1 h-9 rounded-lg bg-zinc-900 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                {t("rteTableInsertApply")}
              </button>
            </div>
          </div>,
          document.body,
        )}

      {!readOnly &&
        typeof document !== "undefined" &&
        colorMenuOpen &&
        colorPopoverPos &&
        createPortal(
          <div
            ref={colorPanelRef}
            role="dialog"
            aria-label={t("rteTextColor")}
            className="fixed z-[300] w-[220px] rounded-xl border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-600 dark:bg-zinc-900"
            style={{
              top: colorPopoverPos.top,
              left: colorPopoverPos.left,
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <p className="mb-2 text-xs font-medium text-zinc-700 dark:text-zinc-200">
              {t("rteTextColor")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                title={t("rteTextColorDefault")}
                aria-label={t("rteTextColorDefault")}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  editor.chain().focus().unsetColor().run();
                  setColorMenuOpen(false);
                }}
                className="h-7 w-7 shrink-0 rounded border border-dashed border-zinc-400 bg-white dark:border-zinc-500 dark:bg-zinc-800"
              />
              {RTE_COLOR_SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="h-7 w-7 shrink-0 rounded border border-zinc-200 shadow-sm dark:border-zinc-600"
                  style={{ backgroundColor: c }}
                  aria-label={c}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    editor.chain().focus().setColor(c).run();
                    setColorMenuOpen(false);
                  }}
                />
              ))}
            </div>
            <label className="mt-2 flex items-center justify-between gap-2 border-t border-zinc-200 pt-2 dark:border-zinc-700">
              <span className="text-xs text-zinc-600 dark:text-zinc-400">
                {t("rteTextColorCustom")}
              </span>
              <input
                type="color"
                className="h-8 w-12 cursor-pointer overflow-hidden rounded border border-zinc-300 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800"
                value={
                  /^#[0-9A-Fa-f]{6}$/i.test(tb.textColor)
                    ? tb.textColor
                    : "#18181b"
                }
                onChange={(ev) =>
                  editor.chain().focus().setColor(ev.target.value).run()
                }
              />
            </label>
          </div>,
          document.body,
        )}

      {!readOnly &&
        typeof document !== "undefined" &&
        tableContextMenu && (
          <RteTableContextMenuPortal
            key={`${tableContextMenu.x}-${tableContextMenu.y}`}
            editor={editor}
            position={tableContextMenu}
            onClose={closeTableContextMenu}
            t={t}
            can={{
              canDeleteTable: tb.canDeleteTable,
              canAddRowBefore: tb.canAddRowBefore,
              canAddRowAfter: tb.canAddRowAfter,
              canDeleteRow: tb.canDeleteRow,
              canAddColumnBefore: tb.canAddColumnBefore,
              canAddColumnAfter: tb.canAddColumnAfter,
              canDeleteColumn: tb.canDeleteColumn,
              canMergeCells: tb.canMergeCells,
              canSplitCell: tb.canSplitCell,
              canToggleHeaderRow: tb.canToggleHeaderRow,
            }}
            onInsertLink={handleLink}
          />
        )}

      {!readOnly && editor && (
        <RteImageToolbarPortal editor={editor} readOnly={readOnly} t={t} />
      )}

      <div
        className={`tiptap-notes-editor-wrap border border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-950 ${readOnly ? "rounded-xl" : "rounded-b-xl border-t-0"}`}
        style={
          {
            ["--tiptap-line-height" as string]: lineHeight,
          } as React.CSSProperties
        }
        onContextMenu={handleEditorContextMenu}
      >
        <EditorContent editor={editor} />
      </div>

      <style jsx global>{`
        .tiptap p.is-editor-empty:first-child::before {
          color: #9ca3af;
          content: attr(data-placeholder);
          float: left;
          height: 0;
          pointer-events: none;
        }

        .tiptap > * + * {
          margin-top: 0.75em;
        }

        .tiptap h1 {
          font-size: 1.875rem;
          font-weight: 700;
          line-height: 1.2;
        }

        .tiptap h2 {
          font-size: 1.5rem;
          font-weight: 700;
          line-height: 1.3;
        }

        .tiptap h3 {
          font-size: 1.25rem;
          font-weight: 600;
          line-height: 1.35;
        }

        .tiptap-notes-editor-wrap .tiptap {
          font-family: inherit;
          line-height: var(--tiptap-line-height, 1.65);
          text-align: start;
        }

        .tiptap p {
          margin: 0;
        }

        .tiptap-notes-editor-wrap .tiptap pre,
        .tiptap-notes-editor-wrap .tiptap code {
          font-family:
            ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        }

        .tiptap ul:not([data-type="taskList"]) {
          list-style-type: disc;
          padding-left: 1.5rem;
        }

        .tiptap ol {
          list-style-type: decimal;
          padding-left: 1.5rem;
        }

        .tiptap blockquote {
          border-left: 3px solid #d4d4d8;
          margin: 1rem 0;
          padding-left: 1rem;
          color: #52525b;
        }

        .tiptap code {
          background: #f4f4f5;
          border-radius: 0.35rem;
          padding: 0.15rem 0.35rem;
          font-size: 0.875em;
        }

        .dark .tiptap code {
          background: #27272a;
        }

        .tiptap pre {
          background: #18181b;
          color: #fafafa;
          border-radius: 0.75rem;
          padding: 0.9rem 1rem;
          overflow-x: auto;
        }

        .tiptap pre code {
          background: transparent;
          color: inherit;
          padding: 0;
        }

        .tiptap hr {
          border: none;
          border-top: 1px solid #d4d4d8;
          margin: 1rem 0;
        }

        .tiptap img.tiptap-image {
          max-width: 100%;
          height: auto;
          border-radius: 0.5rem;
          margin: 0.35rem 0;
          display: block;
          border: 1px solid #e4e4e7;
        }

        .dark .tiptap img.tiptap-image {
          border-color: #3f3f46;
        }

        /*
          TipTap đặt container = display:flex (block-level) → mặc định giãn full ngang editor,
          viền chọn (.ProseMirror-selectednode) theo đó dù ảnh đã thu nhỏ. Thu gọn theo nội dung.
        */
        .tiptap [data-resize-container][data-node="image"] {
          width: fit-content !important;
          max-width: 100% !important;
          align-items: flex-start;
          margin: 0.35rem 0;
        }

        .tiptap [data-resize-container][data-node="image"] img.tiptap-image {
          margin: 0;
        }

        .tiptap [data-resize-container][data-node="image"]:has(img[data-align="center"]) {
          margin-left: auto;
          margin-right: auto;
        }

        .tiptap [data-resize-container][data-node="image"]:has(img[data-align="right"]) {
          margin-left: auto;
          margin-right: 0;
        }

        .tiptap [data-resize-container][data-node="image"]:has(img[data-align="left"]) {
          margin-left: 0;
          margin-right: auto;
        }

        .tiptap [data-resize-wrapper] {
          display: inline-block !important;
          width: fit-content !important;
          max-width: 100%;
          vertical-align: bottom;
        }

        /* TipTap ResizableNodeView: div tay cầm không có kích thước — cần CSS để kéo được (gần Google Docs) */
        .tiptap [data-resize-handle] {
          z-index: 6;
          box-sizing: border-box;
          background: #3b82f6;
          border: 1.5px solid #fff;
          border-radius: 1px;
          box-shadow: 0 0 0 0.5px rgba(37, 99, 235, 0.35);
        }

        .dark .tiptap [data-resize-handle] {
          background: #60a5fa;
          border-color: #18181b;
          box-shadow: 0 0 0 0.5px rgba(96, 165, 250, 0.35);
        }

        .tiptap [data-resize-handle="top-left"],
        .tiptap [data-resize-handle="top-right"],
        .tiptap [data-resize-handle="bottom-left"],
        .tiptap [data-resize-handle="bottom-right"] {
          width: 9px;
          height: 9px;
        }

        .tiptap [data-resize-handle="top-left"] {
          transform: translate(-50%, -50%);
          cursor: nwse-resize;
        }

        .tiptap [data-resize-handle="top-right"] {
          transform: translate(50%, -50%);
          cursor: nesw-resize;
        }

        .tiptap [data-resize-handle="bottom-left"] {
          transform: translate(-50%, 50%);
          cursor: nesw-resize;
        }

        .tiptap [data-resize-handle="bottom-right"] {
          transform: translate(50%, 50%);
          cursor: nwse-resize;
        }

        .tiptap [data-resize-handle="top"],
        .tiptap [data-resize-handle="bottom"] {
          height: 6px;
          cursor: ns-resize;
        }

        .tiptap [data-resize-handle="top"] {
          transform: translateY(-50%);
        }

        .tiptap [data-resize-handle="bottom"] {
          transform: translateY(50%);
        }

        .tiptap [data-resize-handle="left"],
        .tiptap [data-resize-handle="right"] {
          width: 6px;
          cursor: ew-resize;
        }

        .tiptap [data-resize-handle="left"] {
          transform: translateX(-50%);
        }

        .tiptap [data-resize-handle="right"] {
          transform: translateX(50%);
        }

        .tiptap [data-resize-container][data-node="image"]:not(.ProseMirror-selectednode) [data-resize-handle] {
          display: none !important;
        }

        .tiptap a {
          color: #2563eb;
          text-decoration: underline;
          cursor: pointer;
        }

        .tiptap mark {
          background-color: #fef08a;
          border-radius: 0.2rem;
          padding: 0.05rem 0.15rem;
        }

        .dark .tiptap mark {
          background-color: #713f12;
          color: #fef9c3;
        }

        .tiptap table {
          border-collapse: collapse;
          table-layout: fixed;
          width: 100%;
          max-width: 100%;
          margin: 1rem 0;
          margin-left: 0;
          margin-right: auto;
          overflow: visible;
        }

        .tiptap .tableWrapper {
          display: block;
          width: 100%;
          max-width: 100%;
          overflow-x: auto;
          margin: 1rem 0;
          margin-left: 0;
          margin-right: auto;
          text-align: start;
          -webkit-overflow-scrolling: touch;
        }

        .tiptap .tableWrapper table {
          width: 100%;
          max-width: 100%;
          margin: 0;
          margin-left: 0;
          margin-right: auto;
          table-layout: fixed;
        }

        /*
          TipTap/ProseMirror gán min-width (cellMinWidth) lên từng <col> — khiến cột không chia đều
          trên bảng width:100% + table-layout:fixed. Gỡ min-width trên <col>: mặc định các cột đều nhau;
          sau khi kéo resize cột, width: Npx inline trên <col> vẫn giữ (không dùng !important cho width).
        */
        .tiptap table colgroup col {
          min-width: 0 !important;
        }

        .tiptap table td,
        .tiptap table th {
          border: 1px solid #d4d4d8;
          padding: 0.5rem 0.75rem;
          vertical-align: top;
          text-align: start;
          position: relative;
          min-width: 0;
          overflow-wrap: anywhere;
          word-break: break-word;
          cursor: text;
          user-select: text;
          -webkit-user-select: text;
        }

        /* Kéo độ rộng cột (prosemirror-tables / TipTap) */
        .tiptap .column-resize-handle {
          position: absolute;
          top: 0;
          right: -3px;
          bottom: 0;
          width: 6px;
          z-index: 3;
          cursor: col-resize;
          background: transparent;
        }

        .tiptap .column-resize-handle:hover,
        .tiptap .column-resize-handle:active {
          background: rgba(59, 130, 246, 0.35);
        }

        .dark .tiptap .column-resize-handle:hover,
        .dark .tiptap .column-resize-handle:active {
          background: rgba(96, 165, 250, 0.4);
        }

        /* CellSelection (kéo chọn nhiều ô / nút «Chọn hết ô») — plugin prosemirror-tables */
        .tiptap table td.selectedCell,
        .tiptap table th.selectedCell {
          background-color: rgba(59, 130, 246, 0.2);
          box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.45);
        }

        .dark .tiptap table td.selectedCell,
        .dark .tiptap table th.selectedCell {
          background-color: rgba(96, 165, 250, 0.18);
          box-shadow: inset 0 0 0 1px rgba(96, 165, 250, 0.5);
        }

        .tiptap table td p,
        .tiptap table th p {
          text-align: start !important;
          user-select: text;
          -webkit-user-select: text;
        }

        .tiptap table td :is(h1, h2, h3),
        .tiptap table th :is(h1, h2, h3) {
          text-align: start !important;
        }

        .tiptap ::selection {
          background-color: rgba(59, 130, 246, 0.28);
        }

        .dark .tiptap ::selection {
          background-color: rgba(96, 165, 250, 0.35);
        }

        .tiptap table th {
          background: #f4f4f5;
          font-weight: 600;
        }

        .dark .tiptap table td,
        .dark .tiptap table th {
          border-color: #3f3f46;
        }

        .dark .tiptap table th {
          background: #27272a;
        }

        .tiptap .task-list {
          list-style: none;
          padding-left: 0;
        }

        .tiptap .task-list li {
          display: flex;
          align-items: flex-start;
          gap: 0.5rem;
        }

        .tiptap .task-list li > label {
          margin-top: 0.2rem;
          flex: 0 0 auto;
        }

        .tiptap .task-list li > div {
          flex: 1 1 auto;
        }

        .tiptap ul[data-type="taskList"] {
          list-style: none;
          padding-left: 0;
        }

        .tiptap ul[data-type="taskList"] li {
          display: flex;
          align-items: flex-start;
          gap: 0.5rem;
        }

        .tiptap ul[data-type="taskList"] li > label {
          margin-top: 0.15rem;
          flex: 0 0 auto;
        }

        .tiptap ul[data-type="taskList"] li > div {
          flex: 1 1 auto;
        }
      `}</style>
    </div>
  );
}
