import { Toast } from "@/components/Toast";
import { t } from "@/lib/i18n";
import { useToasts } from "./toast";

/** Where toasts appear: above the bottom nav below 768 px, bottom left from 768 px. */
export function ToastHost() {
  const { toasts, dismiss } = useToasts();
  return (
    <div
      role="region"
      aria-label={t("toast.region")}
      data-component="ToastHost"
      className={
        "pointer-events-none fixed inset-x-4 bottom-[calc(var(--cf-size-bnav-height)+var(--cf-space-4))] z-(--cf-z-toast) " +
        "flex flex-col gap-2 @md:inset-x-auto @md:bottom-4 @md:left-4 @md:w-(--cf-size-details-width)"
      }
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast
            message={toast.message}
            dismissLabel={t("act.dismiss")}
            {...(toast.actionLabel && toast.onAction ? { actionLabel: toast.actionLabel, onAction: toast.onAction } : {})}
            onDismiss={() => {
              dismiss(toast.id);
            }}
          />
        </div>
      ))}
    </div>
  );
}
