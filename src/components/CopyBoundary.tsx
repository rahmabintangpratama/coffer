import { type ReactNode, useEffect, useState } from "react";
import { type LazyCopyGroup, isCopyGroupLoaded, loadCopyGroups } from "@/lib/i18n";

interface CopyBoundaryProps {
  /** The copy groups the children use (a feature's `ob`, `files`, ...). */
  groups: readonly LazyCopyGroup[];
  /** Shown while the groups load. */
  fallback: ReactNode;
  /** Shown if a group cannot be loaded (for example the chunk request failed). */
  errorFallback: ReactNode;
  children: ReactNode;
}

/**
 * Loads a feature's copy groups, then renders it. The groups are separate chunks,
 * not in the first bundle. The children must call t() inside their own components:
 * a t() call written in the expression passed as children runs before the load.
 */
export function CopyBoundary({ groups, fallback, errorFallback, children }: CopyBoundaryProps) {
  // Readiness is read from what is loaded on every render, not kept in state: the router can reuse one boundary
  // for two routes with different groups, and a stale "ready" would render the second route before its copy exists.
  const ready = groups.every((group) => isCopyGroupLoaded(group));
  const [failed, setFailed] = useState<readonly LazyCopyGroup[] | null>(null);
  const [, setLoadedCount] = useState(0);

  useEffect(() => {
    if (ready) return;
    let active = true;
    loadCopyGroups(...groups).then(
      () => {
        if (active) setLoadedCount((count) => count + 1);
      },
      () => {
        if (active) setFailed(groups);
      },
    );
    return () => {
      active = false;
    };
  }, [groups, ready]);

  if (ready) return children;
  return failed === groups ? errorFallback : fallback;
}
