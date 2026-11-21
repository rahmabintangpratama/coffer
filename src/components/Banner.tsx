import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BannerTone = "info" | "success" | "warning" | "danger";

const tones: Record<BannerTone, { icon: LucideIcon; box: string }> = {
  info: { icon: Info, box: "border-info-line bg-info-subtle text-info-fg" },
  success: { icon: CircleCheck, box: "border-success-line bg-success-subtle text-success-fg" },
  warning: { icon: TriangleAlert, box: "border-warning-line bg-warning-subtle text-warning-fg" },
  danger: { icon: CircleAlert, box: "border-danger-line bg-danger-subtle text-danger-fg" },
};

export interface BannerProps {
  tone: BannerTone;
  title?: string;
  children?: ReactNode;
  /** Buttons or links, stacked on mobile and on the right from 768 px. */
  actions?: ReactNode;
  className?: string;
}

/**
 * An inline notice. The icon and the words carry the meaning, never the color
 * alone. Errors use role="alert", everything else role="status".
 */
export function Banner({ tone, title, children, actions, className }: BannerProps) {
  const { icon: Icon, box } = tones[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      data-component="Banner"
      data-tone={tone}
      className={cn("flex flex-col gap-3 rounded-md border p-3 @md:flex-row @md:items-start", box, className)}
    >
      <Icon aria-hidden="true" className="size-5 shrink-0" />
      <div className="min-w-0 flex-1 text-base">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && "mt-1")}>{children}</div> : null}
      </div>
      {actions ? <div className="flex flex-col gap-2 @md:flex-row @md:shrink-0">{actions}</div> : null}
    </div>
  );
}
