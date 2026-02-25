export const DRIVE_PORTAL_ROOT_ID = "drive-portal-root";
export function getDrivePortalContainer(): HTMLElement | undefined {
    if (typeof document === "undefined")
        return undefined;
    return document.getElementById(DRIVE_PORTAL_ROOT_ID) ?? undefined;
}
export const DRIVE_MODAL_PORTAL_ID = "drive-modal-portal";
function ensureModalPortalShell(el: HTMLElement) {
    el.className = "drive-app";
    el.setAttribute("data-drive-modal-root", "true");
    Object.assign(el.style, {
        position: "fixed",
        left: "0",
        top: "0",
        right: "0",
        bottom: "0",
        width: "100vw",
        height: "100vh",
        maxWidth: "100vw",
        maxHeight: "100vh",
        margin: "0",
        padding: "0",
        zIndex: "2147483000",
        pointerEvents: "none",
    });
}
export function getDriveModalPortalContainer(): HTMLElement | undefined {
    if (typeof document === "undefined")
        return undefined;
    let el = document.getElementById(DRIVE_MODAL_PORTAL_ID);
    if (!el) {
        el = document.createElement("div");
        el.id = DRIVE_MODAL_PORTAL_ID;
        document.body.appendChild(el);
    }
    ensureModalPortalShell(el);
    return el;
}
