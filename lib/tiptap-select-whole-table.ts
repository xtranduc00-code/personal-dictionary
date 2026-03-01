import type { Editor } from "@tiptap/core";
import { CellSelection, TableMap, selectionCell } from "@tiptap/pm/tables";

/**
 * Chọn toàn bộ ô trong bảng (CellSelection) — ProseMirror không hỗ trợ bôi đen liên tục
 * xuyên ô như Word; dùng nút này hoặc kéo từ ô đầu sang ô cuối.
 */
export function selectWholeTable(editor: Editor): boolean {
  const { state, view } = editor;
  if (!view.editable) return false;

  let $cell;
  try {
    $cell = selectionCell(state);
  } catch {
    return false;
  }

  const table = $cell.node(-1);
  if (table.type.spec.tableRole !== "table") return false;

  const map = TableMap.get(table);
  const tableStart = $cell.start(-1);
  const gridLast = map.width * map.height - 1;
  if (gridLast < 0 || gridLast >= map.map.length) return false;

  const lastCellAbs = tableStart + map.map[gridLast];
  const anchorPos = tableStart + 1;

  try {
    const sel = CellSelection.create(state.doc, anchorPos, lastCellAbs);
    view.dispatch(state.tr.setSelection(sel).scrollIntoView());
    return true;
  } catch {
    return false;
  }
}
