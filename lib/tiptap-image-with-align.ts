import Image from "@tiptap/extension-image";

export type ImageAlign = "left" | "center" | "right" | null;

/**
 * Ảnh block + thuộc tính căn (data-align) cho toolbar kiểu Google Docs.
 */
export const ImageWithAlign = Image.extend({
  name: "image",
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: null as ImageAlign,
        parseHTML: (element) => {
          const v = element.getAttribute("data-align");
          if (v === "center" || v === "right" || v === "left") return v;
          return null;
        },
        renderHTML: (attributes) => {
          const a = attributes.align as ImageAlign;
          if (!a) return {};
          return { "data-align": a };
        },
      },
    };
  },
});
