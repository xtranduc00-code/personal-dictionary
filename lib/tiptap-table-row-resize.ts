import { Extension } from "@tiptap/core";
import { TableRow } from "@tiptap/extension-table";
import { Plugin, PluginKey } from "@tiptap/pm/state";

/** Cùng tên node với TableRow mặc định — dùng với TableKit `{ tableRow: false }`. */
export const ResizableTableRow = TableRow.extend({
    addAttributes() {
        return {
            ...(this.parent?.() ?? {}),
            rowHeight: {
                default: null as number | null,
                parseHTML: (element) => {
                    const d = element.getAttribute("data-row-height");
                    if (d) {
                        const n = parseInt(d, 10);
                        return Number.isFinite(n) ? n : null;
                    }
                    const st = element.style?.height;
                    if (st && st.endsWith("px")) {
                        const n = parseInt(st, 10);
                        return Number.isFinite(n) ? n : null;
                    }
                    return null;
                },
                renderHTML: (attributes) => {
                    const h = attributes.rowHeight as number | null;
                    if (h == null || !Number.isFinite(h) || h <= 0)
                        return {};
                    const px = Math.round(h);
                    return {
                        "data-row-height": String(px),
                        style: `height: ${px}px`,
                    };
                },
            },
        };
    },
});

const rowResizeKey = new PluginKey("kfcTableRowResize");
const MIN_ROW_PX = 40;
const EDGE_PX = 10;

/**
 * Kéo cạnh dưới của hàng (tr) để chỉnh chiều cao; lưu vào attrs.rowHeight.
 */
export const TableRowResize = Extension.create({
    name: "tableRowResize",
    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: rowResizeKey,
                props: {
                    handleDOMEvents: {
                        mousedown: (view, event) => {
                            if (!view.editable || event.button !== 0)
                                return false;
                            const t = event.target as HTMLElement;
                            if (t.closest(".column-resize-handle"))
                                return false;
                            const tr = t.closest("tr");
                            if (!tr || !view.dom.contains(tr))
                                return false;
                            const table = tr.closest("table");
                            if (!table || !view.dom.contains(table))
                                return false;
                            const rect = tr.getBoundingClientRect();
                            if (event.clientY < rect.bottom - EDGE_PX)
                                return false;
                            const coords = view.posAtCoords({
                                left: rect.left + rect.width / 2,
                                top: rect.top + 6,
                            });
                            if (!coords)
                                return false;
                            const $pos = view.state.doc.resolve(coords.pos);
                            let rowDepth = -1;
                            for (let d = $pos.depth; d >= 0; d--) {
                                if ($pos.node(d).type.name === "tableRow") {
                                    rowDepth = d;
                                    break;
                                }
                            }
                            if (rowDepth < 0)
                                return false;
                            const rowNode = $pos.node(rowDepth);
                            const rowPos = $pos.before(rowDepth);
                            const attrH = rowNode.attrs.rowHeight as number | null | undefined;
                            const startH = typeof attrH === "number" && attrH > 0
                                ? attrH
                                : rect.height;
                            event.preventDefault();
                            const startY = event.clientY;
                            document.body.style.cursor = "row-resize";
                            const onMove = (e: MouseEvent) => {
                                const next = Math.max(MIN_ROW_PX, Math.round(startH + (e.clientY - startY)));
                                const tr0 = view.state.tr;
                                tr0.setNodeMarkup(rowPos, undefined, {
                                    ...rowNode.attrs,
                                    rowHeight: next,
                                });
                                view.dispatch(tr0);
                            };
                            const onUp = () => {
                                document.body.style.cursor = "";
                                document.removeEventListener("mousemove", onMove);
                                document.removeEventListener("mouseup", onUp);
                            };
                            document.addEventListener("mousemove", onMove);
                            document.addEventListener("mouseup", onUp);
                            return true;
                        },
                    },
                },
            }),
        ];
    },
});
