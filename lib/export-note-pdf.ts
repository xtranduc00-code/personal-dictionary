import DOMPurify from "isomorphic-dompurify";

export type ExportNotePdfOptions = {
  title: string;
  htmlBody: string;
  /** Tên file không có .pdf */
  fileNameBase?: string;
};

const EXPORT_STYLES = `
  * { box-sizing: border-box; }
  body { margin: 0; padding: 0; }
  .ken-pdf-root {
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 14px;
    line-height: 1.6;
    color: #18181b;
    background: #fff;
    width: 100%;
    padding: 0;
  }
  .ken-pdf-root h1 {
    font-size: 1.5rem;
    font-weight: 700;
    margin: 0 0 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid #e4e4e7;
  }
  .ken-pdf-root .tiptap { color: #18181b; }
  .ken-pdf-root .tiptap p { margin: 0 0 0.65em; }
  .ken-pdf-root .tiptap h1 { font-size: 1.5rem; font-weight: 700; margin: 0.85em 0 0.4em; }
  .ken-pdf-root .tiptap h2 { font-size: 1.25rem; font-weight: 700; margin: 0.85em 0 0.4em; }
  .ken-pdf-root .tiptap h3 { font-size: 1.1rem; font-weight: 600; margin: 0.85em 0 0.4em; }
  .ken-pdf-root .tiptap ul, .ken-pdf-root .tiptap ol { margin: 0.5em 0; padding-left: 1.5rem; }
  .ken-pdf-root .tiptap blockquote {
    border-left: 3px solid #d4d4d8;
    margin: 0.75em 0;
    padding-left: 1rem;
    color: #52525b;
  }
  .ken-pdf-root .tiptap code {
    background: #f4f4f5;
    border-radius: 0.25rem;
    padding: 0.1em 0.35em;
    font-size: 0.9em;
  }
  .ken-pdf-root .tiptap pre {
    background: #18181b;
    color: #fafafa;
    border-radius: 0.5rem;
    padding: 0.75rem 1rem;
    overflow: hidden;
    font-size: 0.85em;
  }
  .ken-pdf-root .tiptap pre code { background: transparent; color: inherit; padding: 0; }
  .ken-pdf-root .tiptap a { color: #2563eb; text-decoration: underline; }
  .ken-pdf-root .tiptap mark { background: #fef08a; padding: 0.05em 0.15em; }
  .ken-pdf-root .tiptap hr { border: none; border-top: 1px solid #d4d4d8; margin: 1em 0; }
  .ken-pdf-root .tiptap img.tiptap-image {
    max-width: 100%;
    height: auto;
    display: block;
    border-radius: 0.35rem;
    border: 1px solid #e4e4e7;
    margin: 0.35em 0;
  }
  .ken-pdf-root .tiptap .tableWrapper {
    display: block;
    width: 100% !important;
    max-width: 100% !important;
    overflow: visible !important;
    margin: 0.75em 0;
  }
  .ken-pdf-root .tiptap table {
    border-collapse: collapse;
    table-layout: fixed;
    width: 100% !important;
    max-width: 100% !important;
    margin: 0;
    font-size: 0.92em;
  }
  /* Gỡ width/min-width pixel từ TipTap trên <col> — tránh cột 3 bị nén / tràn ngoài vùng chụp */
  .ken-pdf-root .tiptap table colgroup col {
    min-width: 0 !important;
    width: auto !important;
  }
  .ken-pdf-root .tiptap th, .ken-pdf-root .tiptap td {
    border: 1px solid #d4d4d8;
    padding: 0.4rem 0.5rem;
    vertical-align: top;
    text-align: left;
    word-break: break-word;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .ken-pdf-root .tiptap th { background: #f4f4f5; font-weight: 600; }
  .ken-pdf-root .tiptap .task-list { list-style: none; padding-left: 0; }
  .ken-pdf-root .tiptap .task-list li { display: flex; gap: 0.35rem; align-items: flex-start; }
`;

function safePdfFileBase(name: string): string {
  const t = name.replace(/[/\\?%*:|"<>]/g, "-").replace(/\s+/g, " ").trim();
  return t.slice(0, 88) || "note";
}

/** ~A4 nội dung @96dpi; đủ rộng để bảng chia cột đều trước khi scale lên PDF */
const PDF_LAYOUT_MIN_WIDTH_PX = 720;
const PDF_LAYOUT_MAX_WIDTH_PX = 2000;

/**
 * Gỡ style inline trên col/table từ editor để bảng không vượt khung và không nén cột.
 */
function normalizeTablesForPdfExport(container: HTMLElement) {
  container.querySelectorAll("table col").forEach((el) => {
    el.removeAttribute("style");
  });
  container.querySelectorAll("td, th").forEach((el) => {
    el.removeAttribute("colwidth");
  });
  container.querySelectorAll("table").forEach((t) => {
    const tbl = t as HTMLTableElement;
    tbl.style.width = "100%";
    tbl.style.maxWidth = "100%";
    tbl.style.tableLayout = "fixed";
  });
}

/**
 * Xuất ghi chú (tiêu đề + HTML TipTap) ra file PDF trong trình duyệt.
 */
export async function exportNoteToPdf(options: ExportNotePdfOptions): Promise<void> {
  const { title, htmlBody, fileNameBase } = options;

  const cleanBody = DOMPurify.sanitize(htmlBody || "", {
    USE_PROFILES: { html: true },
    ADD_ATTR: [
      "style",
      "class",
      "colspan",
      "rowspan",
      "width",
      "height",
      "src",
      "alt",
      "title",
      "data-row-height",
      "data-align",
      "colwidth",
    ],
    ADD_TAGS: ["colgroup", "col"],
  });

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const host = document.createElement("div");
  host.setAttribute("data-ken-pdf-export", "true");
  host.style.cssText =
    `position:fixed;left:-12000px;top:0;width:${PDF_LAYOUT_MIN_WIDTH_PX}px;max-width:${PDF_LAYOUT_MAX_WIDTH_PX}px;pointer-events:none;opacity:0.001;overflow:visible;z-index:-1;`;

  const styleEl = document.createElement("style");
  styleEl.textContent = EXPORT_STYLES;

  const root = document.createElement("div");
  root.className = "ken-pdf-root";

  const h1 = document.createElement("h1");
  h1.textContent = title.trim() || "—";

  const bodyWrap = document.createElement("div");
  bodyWrap.className = "tiptap";
  bodyWrap.innerHTML = cleanBody;
  normalizeTablesForPdfExport(bodyWrap);

  root.appendChild(h1);
  root.appendChild(bodyWrap);
  host.appendChild(styleEl);
  host.appendChild(root);
  document.body.appendChild(host);

  const layoutForCapture = async () => {
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    let layoutW = Math.ceil(
      Math.max(PDF_LAYOUT_MIN_WIDTH_PX, root.scrollWidth, host.offsetWidth),
    );
    layoutW = Math.min(layoutW, PDF_LAYOUT_MAX_WIDTH_PX);
    host.style.width = `${layoutW}px`;
    host.style.maxWidth = `${layoutW}px`;
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    const captureW = Math.ceil(root.scrollWidth);
    const captureH = Math.ceil(root.scrollHeight);
    return { layoutW, captureW, captureH };
  };

  try {
    const { layoutW, captureW, captureH } = await layoutForCapture();

    const canvas = await html2canvas(root, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      logging: false,
      width: captureW,
      height: captureH,
      windowWidth: layoutW,
      windowHeight: Math.max(captureH, 1),
    });

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 12;
    const usableW = pageWidth - 2 * margin;
    const usableH = pageHeight - 2 * margin;

    const imgW = canvas.width;
    const imgH = canvas.height;
    const pdfImgW = usableW;
    const pdfImgH = (imgH * pdfImgW) / imgW;

    const imgData = canvas.toDataURL("image/jpeg", 0.92);

    if (pdfImgH <= usableH) {
      pdf.addImage(imgData, "JPEG", margin, margin, pdfImgW, pdfImgH);
    } else {
      let ySrc = 0;
      let page = 0;
      while (ySrc < imgH) {
        const slicePx = Math.min(
          imgH - ySrc,
          Math.max(1, Math.ceil((usableH / pdfImgH) * imgH)),
        );
        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = imgW;
        sliceCanvas.height = slicePx;
        const sctx = sliceCanvas.getContext("2d");
        if (!sctx) {
          throw new Error("Canvas unsupported");
        }
        sctx.fillStyle = "#ffffff";
        sctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
        sctx.drawImage(canvas, 0, ySrc, imgW, slicePx, 0, 0, imgW, slicePx);
        const sliceData = sliceCanvas.toDataURL("image/jpeg", 0.92);
        const slicePdfH = (slicePx * pdfImgW) / imgW;
        if (page > 0) {
          pdf.addPage();
        }
        pdf.addImage(sliceData, "JPEG", margin, margin, pdfImgW, slicePdfH);
        ySrc += slicePx;
        page += 1;
      }
    }

    const base = safePdfFileBase(fileNameBase ?? title);
    pdf.save(`${base}.pdf`);
  } finally {
    host.remove();
  }
}
