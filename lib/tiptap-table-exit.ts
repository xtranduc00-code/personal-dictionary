import { Extension, findParentNode } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

/**
 * Trong bảng TipTap, cursor dễ “kẹt” — không ra được đoạn phía dưới.
 * Cmd/Ctrl+Enter: chèn đoạn văn ngay sau bảng và đưa cursor xuống đó.
 */
export const TiptapTableExit = Extension.create({
  name: "tiptapTableExit",
  addKeyboardShortcuts() {
    return {
      "Mod-Enter": ({ editor }) => {
        if (!editor.isActive("table")) {
          return false;
        }
        const { state } = editor;
        const table = findParentNode((node) => node.type.name === "table")(
          state.selection,
        );
        if (!table) {
          return false;
        }
        const insertPos = table.pos + table.node.nodeSize;
        const p = state.schema.nodes.paragraph?.create();
        if (!p) {
          return false;
        }
        const tr = state.tr.insert(insertPos, p);
        const selPos = insertPos + 1;
        tr.setSelection(TextSelection.near(tr.doc.resolve(selPos)));
        editor.view.dispatch(tr);
        return true;
      },
    };
  },
});
