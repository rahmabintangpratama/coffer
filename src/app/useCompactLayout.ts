import { type RefObject, useEffect, useState } from "react";
import type { LayoutMode } from "@/components/layout";

// breakpoint.md in design/tokens.json. Layout switches on the width of the app
// root (a container), not the viewport.
const BREAKPOINT_MD = 768;
const BREAKPOINT_LG = 1024;

const modeFor = (width: number): LayoutMode => (width < BREAKPOINT_MD ? "compact" : width < BREAKPOINT_LG ? "rail" : "sidebar");

/** The layout mode of the element's width. Starts compact until the first measurement. */
export function useLayoutMode(root: RefObject<HTMLElement | null>): LayoutMode {
  const [mode, setMode] = useState<LayoutMode>("compact");
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width !== undefined) setMode(modeFor(width));
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [root]);
  return mode;
}

/** True while the element is narrower than the md breakpoint (bottom nav and sheets instead of rail and dialogs). */
export function useCompactLayout(root: RefObject<HTMLElement | null>): boolean {
  return useLayoutMode(root) === "compact";
}
