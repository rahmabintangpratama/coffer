import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Destination } from "./nav-items";

interface NavLinkProps {
  destination: Destination;
  label: string;
  /** rail: icon over label. row: icon beside label. */
  layout: "stacked" | "row";
  onNavigate?: () => void;
  className?: string;
  /** Hide the visible label but keep it as the accessible name. */
  iconOnly?: boolean;
  children?: ReactNode;
}

/** A link to a destination. TanStack Router sets aria-current="page" and data-status="active". */
export function NavLink({ destination, label, layout, onNavigate, className, iconOnly = false }: NavLinkProps) {
  const Icon = destination.icon;
  return (
    <Link
      to={destination.to}
      activeOptions={{ exact: destination.to === "/" }}
      {...(onNavigate ? { onClick: onNavigate } : {})}
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
