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
    const watchHub = pathname === "/watch" || pathname === "/watch/";
    const watchInRoom = pathname.startsWith("/watch/") && pathname.length > "/watch/".length;
    if (meetHub || watchHub) {
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
    /** Notes + in-room video + videos hub: inner panes manage scroll. Home /news must scroll in this shell (md:h-screen + overflow-hidden on root). */
    if (pathname === "/notes" || pathname === "/videos" || meetInRoom || watchInRoom) {
        return (
            <div className="flex min-h-0 min-h-[100svh] flex-1 flex-col overflow-hidden md:h-full md:min-h-0">
                {children}
            </div>
        );
    }
    /** Chess: inner game manages sizing, outer shell must not scroll */
    if (pathname === "/chess" || pathname.startsWith("/chess/")) {
        return (
            <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
                {children}
            </div>
        );
    }
    /** Portfolio home: fill viewport beside sidebar (flex-1 + min height on small screens). */
    if (pathname === "/" || pathname === "/portfolio") {
        return (
            <div
                ref={containerRef}
                data-main-scroll
                className="flex min-h-0 min-h-[100svh] w-full max-w-full flex-1 flex-col overflow-x-hidden overflow-y-auto md:h-full md:min-h-0 md:flex-1 md:overflow-y-auto md:overflow-x-hidden md:pr-2"
            >
                {children}
            </div>
        );
    }
    return (
        <div
            ref={containerRef}
            data-main-scroll
            className="min-h-0 min-w-0 w-full max-w-full md:flex-1 md:overflow-y-auto md:overflow-x-hidden md:pr-2"
        >
            {children}
        </div>
    );
}
