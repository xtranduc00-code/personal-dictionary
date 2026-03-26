import { Extension, findParentNode } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";

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
      Escape: ({ editor }) => {
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
        tr.setSelection(TextSelection.near(tr.doc.resolve(insertPos + 1)));
        editor.view.dispatch(tr);
        return true;
      },
    };
  },
  addProseMirrorPlugins() {
    const clickExitKey = new PluginKey("kenTableClickExit");
    return [
      new Plugin({
        key: clickExitKey,
        props: {
          handleDOMEvents: {
            mousedown: (view, event) => {
              if (!view.editable || event.button !== 0) return false;
              const target = event.target as HTMLElement | null;
              if (!target) return false;
              const wrapper = target.closest(".tableWrapper") as HTMLElement | null;
              const tableFromSelection = findParentNode(
                (node) => node.type.name === "table",
              )(view.state.selection);
              if (!tableFromSelection) return false;
              const tablePos = tableFromSelection.pos;
              const tableNode = tableFromSelection.node;
              const tableDom =
                (view.nodeDOM(tablePos) as HTMLElement | null) ??
                wrapper ??
                null;
              const tableEl =
                tableDom?.matches?.("table")
                  ? tableDom
                  : (tableDom?.querySelector?.("table") as HTMLElement | null);
              if (!tableEl) return false;
              const rect = tableEl.getBoundingClientRect();

              const clickedInsideTable = Boolean(target.closest("table"));
              if (clickedInsideTable) return false;

              // If user clicks anywhere below the table while cursor is inside table,
              // create a paragraph after table so cursor can escape immediately.
              if (event.clientY <= rect.bottom + 2) return false;

              const insertPos = tablePos + tableNode.nodeSize;
              const p = view.state.schema.nodes.paragraph?.create();
              if (!p) return false;
              const tr = view.state.tr.insert(insertPos, p);
              tr.setSelection(TextSelection.near(tr.doc.resolve(insertPos + 1)));
              view.dispatch(tr);
              event.preventDefault();
              return true;
            },
          },
        },
      }),
    ];
  },
});
