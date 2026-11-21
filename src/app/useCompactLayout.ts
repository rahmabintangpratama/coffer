import { type RefObject, useEffect, useState } from "react";

// breakpoint.md in design/tokens.json. Layout switches on the width of the app
// root (a container), not the viewport.
const BREAKPOINT_MD = 768;

/** True while the element is narrower than the md breakpoint (bottom nav and sheets instead of rail and dialogs). */
export function useCompactLayout(root: RefObject<HTMLElement | null>): boolean {
  const [compact, setCompact] = useState(true);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const update = (width: number) => {
      setCompact(width < BREAKPOINT_MD);
    };
    update(element.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width !== undefined) update(width);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [root]);
  return compact;
}
