import { useEffect } from "react";

const THRESHOLD = 72;

/**
 * Pull down at the top of the page to reload from page 1 (AC-21.5). Touch only;
 * a pull that starts below the top, or one that moves sideways, does nothing.
 */
export function usePullToRefresh(onRefresh: () => void, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let startY: number | null = null;
    const start = (event: TouchEvent) => {
      startY = window.scrollY <= 0 ? (event.touches[0]?.clientY ?? null) : null;
    };
    const end = (event: TouchEvent) => {
      const endY = event.changedTouches[0]?.clientY;
      if (startY !== null && endY !== undefined && endY - startY > THRESHOLD && window.scrollY <= 0) onRefresh();
      startY = null;
    };
    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchend", end, { passive: true });
    return () => {
      window.removeEventListener("touchstart", start);
      window.removeEventListener("touchend", end);
    };
  }, [onRefresh, enabled]);
}
