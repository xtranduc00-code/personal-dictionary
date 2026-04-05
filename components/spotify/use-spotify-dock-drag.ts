"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

const STORAGE_KEY = "ken.workspace.spotifyDockPos";

function clampToViewport(
  left: number,
  top: number,
  shell: HTMLElement,
  margin: number,
) {
  const w = shell.offsetWidth || 320;
  const h = shell.offsetHeight || 200;
  const maxL = Math.max(margin, window.innerWidth - w - margin);
  const maxT = Math.max(margin, window.innerHeight - h - margin);
  return {
    left: Math.min(Math.max(margin, left), maxL),
    top: Math.min(Math.max(margin, top), maxT),
  };
}

/**
 * Floating Spotify dock: fixed position, kéo như Meet mini shell (lưu localStorage).
 */
export function useSpotifyDockDrag(
  shellRef: RefObject<HTMLElement | null>,
  enabled: boolean,
) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origLeft: number;
    origTop: number;
  } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const p = JSON.parse(raw) as unknown;
      if (
        p &&
        typeof p === "object" &&
        "left" in p &&
        "top" in p &&
        typeof (p as { left: unknown }).left === "number" &&
        typeof (p as { top: unknown }).top === "number"
      ) {
        setPos({
          left: (p as { left: number }).left,
          top: (p as { top: number }).top,
        });
      }
    } catch {
      /* ignore */
    }
  }, [enabled]);

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
