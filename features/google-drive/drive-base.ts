export const DRIVE_BASE = "/drive";
export function drivePath(path: string): string {
    if (!path || path === "/")
        return DRIVE_BASE;
    const p = path.startsWith("/") ? path : `/${path}`;
    return `${DRIVE_BASE}${p}`;
}
