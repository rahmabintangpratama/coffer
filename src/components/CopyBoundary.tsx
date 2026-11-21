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
  const [state, setState] = useState<"loading" | "ready" | "failed">(() =>
    groups.every((group) => isCopyGroupLoaded(group)) ? "ready" : "loading",
  );

  useEffect(() => {
    if (state !== "loading") return;
    let active = true;
    loadCopyGroups(...groups).then(
      () => {
        if (active) setState("ready");
      },
      () => {
        if (active) setState("failed");
      },
    );
    return () => {
      active = false;
    };
  }, [groups, state]);

  if (state === "ready") return children;
  return state === "failed" ? errorFallback : fallback;
}
