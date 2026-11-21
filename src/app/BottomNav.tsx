import { Ellipsis } from "lucide-react";
import type { RefObject } from "react";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { bottomDestinations } from "./nav-items";
import { NavLink } from "./NavLink";

/** Bottom navigation below 768 px: Home, Starred, Files, More. */
export function BottomNav({
  onMore,
  moreOpen,
  moreRef,
}: {
  onMore: () => void;
  moreOpen: boolean;
  moreRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <nav
      aria-label={t("nav.sidebar.label")}
      data-component="BottomNav"
      className={cn(
        "sticky bottom-0 z-(--cf-z-sticky) box-content flex h-(--cf-size-bnav-height) items-stretch justify-around",
        "border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] @md:hidden",
      )}
    >
      {bottomDestinations.map((destination) => (
        <NavLink
          key={destination.id}
          destination={destination}
          label={t(destination.labelKey)}
          layout="stacked"
          className="flex-1 justify-center rounded-none"
        />
      ))}
      <button
        ref={moreRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={moreOpen}
        onClick={onMore}
        className={cn(
          "flex flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 px-1 py-1 text-sm text-fg",
          "min-h-(--cf-size-touch-min) hover:bg-hover active:bg-active",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        )}
      >
        <span className="flex h-8 w-14 items-center justify-center">
          <Ellipsis aria-hidden="true" className="size-6" />
        </span>
        <span>{t("nav.more")}</span>
      </button>
    </nav>
  );
}
