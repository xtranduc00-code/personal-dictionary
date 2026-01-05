"use client";

import { PropsWithChildren, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const scrollPositions = new Map<string, number>();

export function MainScrollShell({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const fromMemory = scrollPositions.get(pathname);
    const fromSession = window.sessionStorage.getItem(`scroll:${pathname}`);
    const restored =
      fromMemory ?? (fromSession ? Number.parseInt(fromSession, 10) : 0);

    node.scrollTop = Number.isFinite(restored) ? restored : 0;
  }, [pathname]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const saveScroll = () => {
      scrollPositions.set(pathname, node.scrollTop);
      window.sessionStorage.setItem(`scroll:${pathname}`, String(node.scrollTop));
    };

    node.addEventListener("scroll", saveScroll, { passive: true });
    return () => {
      saveScroll();
      node.removeEventListener("scroll", saveScroll);
    };
  }, [pathname]);

  return (
    <div ref={containerRef} className="md:h-full md:overflow-y-auto md:pr-2">
      {children}
    </div>
  );
}
