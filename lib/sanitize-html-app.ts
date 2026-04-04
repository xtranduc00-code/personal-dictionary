import sanitizeHtml, { type IOptions } from "sanitize-html";

function stripHtmlFallback(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/ on\w+="[^"]*"/gi, "")
    .replace(/ on\w+='[^']*'/gi, "");
}

const BBC_IFRAME_HOSTS = [
  "www.youtube.com",
  "www.youtube-nocookie.com",
  "player.vimeo.com",
  "www.bbc.com",
  "www.bbc.co.uk",
  "news.bbc.co.uk",
  "bbc.com",
  "bbc.co.uk",
  "open.live.bbc.co.uk",
  "emp.bbc.com",
];

const bbcSanitizeOptions: IOptions = {
  allowedTags: [
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "a",
    "ul",
    "ol",
    "li",
    "h1",
    "h2",
    "h3",
    "h4",
    "blockquote",
    "cite",
    "figure",
    "figcaption",
    "img",
    "picture",
    "source",
    "video",
    "iframe",
    "span",
    "div",
    "section",
    "article",
    "time",
    "hr",
  ],
  allowedAttributes: {
    a: ["href", "title", "class", "target", "rel"],
    img: [
      "src",
      "alt",
      "title",
      "class",
      "srcset",
      "sizes",
      "loading",
      "decoding",
      "width",
      "height",
      "referrerpolicy",
    ],
    source: ["src", "srcset", "type", "media", "sizes"],
    picture: ["class"],
    video: [
      "src",
      "poster",
      "controls",
      "playsinline",
      "width",
      "height",
      "class",
    ],
    iframe: [
      "src",
      "title",
      "class",
      "width",
      "height",
      "frameborder",
      "allowfullscreen",
      "allow",
      "sandbox",
      "loading",
    ],
    time: ["datetime", "class"],
    figure: ["class"],
    figcaption: ["class"],
    section: ["class"],
    article: ["class"],
    div: ["class"],
    span: ["class"],
    p: ["class"],
    blockquote: ["class"],
    cite: ["class"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: {
    img: ["http", "https"],
    source: ["http", "https"],
    video: ["http", "https"],
    iframe: ["http", "https"],
  },
  allowedIframeHostnames: BBC_IFRAME_HOSTS,
};

export function sanitizeBbcArticleHtml(raw: string): string {
  try {
    return sanitizeHtml(raw, bbcSanitizeOptions);
  } catch {
    return stripHtmlFallback(raw);
  }
}

/** TipTap / RichTextEditor output (notes PDF, flashcard definitions): tables, images, task lists, highlight. */
const TIPTAP_TAGS = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "br",
  "hr",
  "ul",
  "ol",
  "li",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "strike",
  "del",
  "blockquote",
  "code",
  "pre",
  "a",
  "img",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "colgroup",
  "col",
  "span",
  "div",
  "mark",
  "label",
  "input",
];

const tiptapSanitizeOptions: IOptions = {
  allowedTags: TIPTAP_TAGS,
  allowedAttributes: {
    a: ["href", "title", "target", "rel", "class", "style"],
    img: ["src", "alt", "title", "width", "height", "class", "style"],
    th: [
      "colspan",
      "rowspan",
      "width",
      "height",
      "class",
      "style",
      "data-row-height",
      "data-align",
      "colwidth",
    ],
    td: [
      "colspan",
      "rowspan",
      "width",
      "height",
      "class",
      "style",
      "data-row-height",
      "data-align",
      "colwidth",
    ],
    col: ["width", "span", "style", "class"],
    colgroup: ["span", "style", "class"],
    table: ["class", "style", "width"],
    tr: ["class", "style"],
    thead: ["class", "style"],
    tbody: ["class", "style"],
    tfoot: ["class", "style"],
    p: ["class", "style"],
    span: ["class", "style"],
    div: ["class", "style"],
    li: ["class", "style", "data-type", "data-checked"],
    ul: ["class", "style", "data-type"],
    ol: ["class", "style", "data-type"],
    blockquote: ["class", "style"],
    code: ["class", "style"],
    pre: ["class", "style"],
    h1: ["class", "style"],
    h2: ["class", "style"],
    h3: ["class", "style"],
    h4: ["class", "style"],
    h5: ["class", "style"],
    h6: ["class", "style"],
    mark: ["class", "style", "data-color"],
    label: ["class", "style", "contenteditable"],
    input: ["type", "checked", "disabled", "class"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { img: ["http", "https", "data"] },
  transformTags: {
    input: (_tagName, attribs) => {
      if (String(attribs.type || "").toLowerCase() !== "checkbox") {
        return { tagName: "span", attribs: {}, text: "" };
      }
      const next: Record<string, string> = {
        type: "checkbox",
        class: attribs.class || "",
        disabled: "disabled",
      };
      if (attribs.checked !== undefined) next.checked = attribs.checked;
      return { tagName: "input", attribs: next };
    },
  },
};

export function sanitizeTiptapUserHtml(html: string): string {
  return sanitizeHtml(html || "", tiptapSanitizeOptions);
}

/** @deprecated Use sanitizeTiptapUserHtml — same rules. */
export function sanitizeNoteHtmlForPdf(html: string): string {
  return sanitizeTiptapUserHtml(html);
}

export function sanitizeFlashcardDefinitionHtml(html: string): string {
  return sanitizeTiptapUserHtml(html);
}
