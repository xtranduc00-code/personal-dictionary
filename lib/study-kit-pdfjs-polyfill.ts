/**
 * pdfjs-dist (pulled in by pdf-parse) calls `new DOMMatrix()`; Node/serverless has no DOMMatrix unless
 * @napi-rs/canvas is present. Pure-JS shim so PDF *text* extraction works on Netlify without native canvas.
 */
import CSSMatrix from "@thednp/dommatrix";

const w = globalThis as Record<string, unknown>;
if (typeof w.DOMMatrix === "undefined")
    w.DOMMatrix = CSSMatrix;
