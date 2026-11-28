import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Toast } from "@/components/Toast";
import { useLayout } from "@/components/layout";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useToasts } from "./toast";

/**
 * Where toasts appear: above the bottom nav below 768 px, bottom left of the content from 768 px,
 * clear of the rail or sidebar (the connection switcher sits at its bottom). A toast with no action
 * goes when the screen changes; one whose action still applies (Undo) stays until its time ends.
 * Choosing the action closes the toast at once.
 */
export function ToastHost({ sidebarCollapsed = false }: { sidebarCollapsed?: boolean }) {
  const { toasts, dismiss } = useToasts();
  const layout = useLayout();
  // The screen, not the viewer or the open file: `?preview=` changes do not count.
  const [location] = useLocation();
  const screen = location.split("?")[0] ?? location;
  const shown = useRef(screen);
  useEffect(() => {
    if (shown.current === screen) return;
    shown.current = screen;
    for (const toast of useToasts.getState().toasts) if (!toast.onAction) dismiss(toast.id);
  }, [screen, dismiss]);
  const offset =
    layout === "sidebar" && !sidebarCollapsed
      ? "@md:left-[calc(var(--cf-size-sidebar-width)+var(--cf-space-4))]"
      : "@md:left-[calc(var(--cf-size-rail-width)+var(--cf-space-4))]";
  return (
    <div
      role="region"
      aria-label={t("toast.region")}
      data-component="ToastHost"
      className={cn(
        "pointer-events-none fixed inset-x-4 bottom-[calc(var(--cf-size-bnav-height)+var(--cf-space-4))] z-(--cf-z-toast)",
        "flex flex-col gap-2 @md:inset-x-auto @md:bottom-4 @md:w-(--cf-size-details-width)",
        offset,
      )}
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast
            message={toast.message}
            dismissLabel={t("act.dismiss")}
            {...(toast.actionLabel && toast.onAction
              ? {
                  actionLabel: toast.actionLabel,
                  onAction: () => {
                    dismiss(toast.id);
                    toast.onAction?.();
                  },
                }
              : {})}
            onDismiss={() => {
              dismiss(toast.id);
            }}
          />
        </div>
      ))}
    </div>
  );
}
