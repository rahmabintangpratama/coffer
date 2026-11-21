import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import type { Destination } from "./nav-items";
import { isActiveRoute } from "./routes";

interface NavLinkProps {
  destination: Destination;
  label: string;
  /** stacked: icon over label (rail, bottom bar). row: icon beside label. */
  layout: "stacked" | "row";
  onNavigate?: () => void;
  className?: string;
  /** Hide the visible label but keep it as the accessible name. */
  iconOnly?: boolean;
}

/** A link to a destination. It marks itself with aria-current="page" and data-status="active". */
export function NavLink({ destination, label, layout, onNavigate, className, iconOnly = false }: NavLinkProps) {
  const [location] = useLocation();
  const active = isActiveRoute(destination.to, location);
  const Icon = destination.icon;
  return (
    <Link
      href={destination.to}
      {...(onNavigate ? { onClick: onNavigate } : {})}
      aria-current={active ? "page" : undefined}
      data-status={active ? "active" : "inactive"}
      className={cn(
        "group flex items-center rounded-md text-fg",
        "min-h-(--cf-size-touch-min) min-w-(--cf-size-touch-min)",
        "hover:bg-hover active:bg-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        layout === "stacked" ? "flex-col justify-center gap-0.5 px-1 py-1 text-sm" : "gap-3 px-3 py-2 text-base",
        "data-[status=active]:font-semibold",
        className,
      )}
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-full",
          layout === "stacked" ? "h-8 w-14" : "size-6",
          "group-data-[status=active]:bg-accent-subtle group-data-[status=active]:text-accent-fg",
        )}
      >
        <Icon aria-hidden="true" className="size-6" />
      </span>
      <span className={iconOnly ? "sr-only" : undefined}>{label}</span>
    </Link>
  );
}
