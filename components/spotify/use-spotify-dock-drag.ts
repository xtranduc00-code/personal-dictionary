"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

const STORAGE_KEY = "ken.workspace.spotifyDockPos";
/** md: sidebar is `w-80` (320px); keep the dock out of that band. */
const MD_BREAKPOINT = 768;
const SIDEBAR_WIDTH = 320;

function minDockLeftPx(): number {
  if (typeof window === "undefined") return 8;
  if (window.innerWidth < MD_BREAKPOINT) return 8;
  try {
    if (window.localStorage.getItem("sidebarOpen") === "false") return 16;
  } catch {
    /* ignore */
  }
  return SIDEBAR_WIDTH + 8;
}

function shellSizePx(shell: HTMLElement) {
  const r = shell.getBoundingClientRect();
  return {
    w: Math.max(1, Math.round(r.width)) || 320,
    h: Math.max(1, Math.round(r.height)) || 200,
  };
}

function clampToViewport(
  left: number,
  top: number,
  shell: HTMLElement,
  margin: number,
) {
  const { w, h } = shellSizePx(shell);
  const minL = Math.max(margin, minDockLeftPx());
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const maxL = Math.max(minL, vw - w - margin);
  const maxT = Math.max(margin, vh - h - margin);
  return {
    left: Math.min(Math.max(minL, left), maxL),
    top: Math.min(Math.max(margin, top), maxT),
  };
}

function readStoragePos(): { left: number; top: number } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as unknown;
    if (
      p &&
      typeof p === "object" &&
      "left" in p &&
      "top" in p &&
      typeof (p as { left: unknown }).left === "number" &&
      typeof (p as { top: unknown }).top === "number"
    ) {
      return {
        left: (p as { left: number }).left,
        top: (p as { top: number }).top,
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Floating Spotify dock: fixed position, kéo như Meet mini shell (lưu localStorage).
 * `expanded` must be passed so we reclamp `top` when the playlist opens — otherwise
 * `clamp` used the collapsed height and the tall panel slides below the viewport.
 */
export function useSpotifyDockDrag(
  shellRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  expanded: boolean,
) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origLeft: number;
    origTop: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!enabled) return;
    const shell = shellRef.current;
    if (!shell) return;

    let rafChain = 0;
    const tick = () => {
      const sh = shellRef.current;
      if (!sh) return;
      setPos((prev) => {
        let base = prev;
        if (base === null) {
          base = readStoragePos();
        }
        if (base === null) return null;
        return clampToViewport(base.left, base.top, sh, 8);
      });
    };

    const scheduleTick = () => {
      cancelAnimationFrame(rafChain);
      rafChain = requestAnimationFrame(tick);
    };

    tick();
    rafChain = requestAnimationFrame(() => {
      tick();
      requestAnimationFrame(tick);
    });

    const onResize = () => scheduleTick();
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);

    const ro = new ResizeObserver(() => scheduleTick());
    ro.observe(shell);

    return () => {
      cancelAnimationFrame(rafChain);
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
      ro.disconnect();
    };
  }, [enabled, shellRef, expanded]);

  const onDragHandlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!enabled || e.button !== 0) return;
      const shell = shellRef.current;
      if (!shell) return;
      e.preventDefault();
      const rect = shell.getBoundingClientRect();
      const origLeft = pos?.left ?? rect.left;
      const origTop = pos?.top ?? rect.top;
      if (pos === null) {
        setPos({ left: origLeft, top: origTop });
      }
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origLeft,
        origTop,
      };

      const onMove = (ev: PointerEvent) => {
        const d = dragRef.current;
        const sh = shellRef.current;
        if (!d || !sh) return;
        const nl = d.origLeft + ev.clientX - d.startX;
        const nt = d.origTop + ev.clientY - d.startY;
        setPos(clampToViewport(nl, nt, sh, 8));
      };

      const onUp = () => {
        dragRef.current = null;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        const sh = shellRef.current;
        setPos((p) => {
          if (!p || !sh) return p;
          const c = clampToViewport(p.left, p.top, sh, 8);
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
          } catch {
            /* ignore */
          }
          return c;
        });
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [enabled, pos, shellRef],
  );

  return {
    pos: enabled ? pos : null,
    onDragHandlePointerDown: enabled ? onDragHandlePointerDown : () => {},
  };
}
