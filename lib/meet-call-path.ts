/** So khớp pathname `/call/:roomSegment` với tên phòng đã decode (giống CallRoom). */
export function meetPathMatchesRoom(pathname: string | null | undefined, displayName: string): boolean {
    if (!pathname?.startsWith("/call/"))
        return false;
    const rest = pathname.slice("/call/".length);
    const segment = rest.split("/")[0] ?? "";
    if (!segment)
        return false;
    try {
        return decodeURIComponent(segment) === displayName;
    }
    catch {
        return segment === displayName;
    }
}
