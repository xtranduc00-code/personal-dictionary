"use client";
import { PropsWithChildren, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
const scrollPositions = new Map<string, number>();
export function MainScrollShell({ children }: PropsWithChildren) {
    const pathname = usePathname();
    const containerRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const node = containerRef.current;
        if (!node)
            return;
        const fromMemory = scrollPositions.get(pathname);
        const fromSession = window.sessionStorage.getItem(`scroll:${pathname}`);
        const restored = fromMemory ?? (fromSession ? Number.parseInt(fromSession, 10) : 0);
        node.scrollTop = Number.isFinite(restored) ? restored : 0;
    }, [pathname]);
    useEffect(() => {
        const node = containerRef.current;
        if (!node)
            return;
        let rafId = 0;
        const saveScroll = () => {
            scrollPositions.set(pathname, node.scrollTop);
            window.sessionStorage.setItem(`scroll:${pathname}`, String(node.scrollTop));
        };
        const onScroll = () => {
            if (rafId)
                cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                saveScroll();
                rafId = 0;
            });
        };
        node.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            if (rafId)
                cancelAnimationFrame(rafId);
            saveScroll();
            node.removeEventListener("scroll", onScroll);
        };
    }, [pathname]);
    /** Hub only: must scroll (recent rooms, etc.). In-room: keep overflow hidden for video layout. */
    const meetHub =
        pathname === "/call" ||
        pathname === "/call/";
    const meetInRoom = pathname.startsWith("/call/") && pathname.length > "/call/".length;
    if (meetHub) {
        return (
            <div
                ref={containerRef}
                data-main-scroll
                className="min-h-0 min-w-0 w-full max-w-full flex-1 overflow-y-auto overflow-x-hidden md:h-full md:min-h-0 md:pr-2"
            >
                {children}
            </div>
        );
    }
    if (pathname === "/" || pathname === "/notes" || meetInRoom) {
        return (
            <div className="flex min-h-0 min-h-[100svh] flex-1 flex-col overflow-hidden md:h-full md:min-h-0">
                {children}
            </div>
        );
    }
    return (
        <div
            ref={containerRef}
            data-main-scroll
            className="min-w-0 w-full max-w-full md:h-full md:overflow-y-auto md:overflow-x-hidden md:pr-2"
        >
            {children}
        </div>
    );
}
