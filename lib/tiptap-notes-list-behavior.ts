import { Extension, type Editor } from "@tiptap/core";

function isInsideTableCell(editor: Editor): boolean {
    const { $from } = editor.state.selection;
    for (let d = $from.depth; d > 0; d--) {
        const name = $from.node(d).type.name;
        if (name === "tableCell" || name === "tableHeader")
            return true;
    }
    return false;
}

function isInEmptyParagraph(editor: Editor): boolean {
    const { selection } = editor.state;
    if (!selection.empty)
        return false;
    const { parent } = selection.$from;
    if (parent.type.name !== "paragraph")
        return false;
    if (parent.textContent.trim().length > 0)
        return false;
    return parent.content.size === 0;
}

export const NotesListBehavior = Extension.create({
    name: "notesListBehavior",
    priority: 1000,
    addKeyboardShortcuts() {
        return {
            Enter: ({ editor }) => {
                if (isInsideTableCell(editor) && !editor.isActive("listItem") && !editor.isActive("taskItem"))
                    return false;
                if (!isInEmptyParagraph(editor))
                    return false;
                const { $from } = editor.state.selection;
                for (let d = $from.depth; d > 0; d--) {
                    const n = $from.node(d);
                    if (n.type.name === "listItem")
                        return editor.chain().focus().liftListItem("listItem").run();
                    if (n.type.name === "taskItem")
                        return editor.chain().focus().liftListItem("taskItem").run();
                }
                return false;
            },
            Tab: ({ editor }) => {
                if (isInsideTableCell(editor) && !editor.isActive("taskItem") && !editor.isActive("listItem"))
                    return false;
                if (editor.isActive("taskItem"))
                    return editor.chain().focus().sinkListItem("taskItem").run();
                if (editor.isActive("listItem"))
                    return editor.chain().focus().sinkListItem("listItem").run();
                return false;
            },
            "Shift-Tab": ({ editor }) => {
                if (isInsideTableCell(editor) && !editor.isActive("taskItem") && !editor.isActive("listItem"))
                    return false;
                if (editor.isActive("taskItem"))
                    return editor.chain().focus().liftListItem("taskItem").run();
                if (editor.isActive("listItem"))
                    return editor.chain().focus().liftListItem("listItem").run();
                return false;
            },
        };
    },
});
