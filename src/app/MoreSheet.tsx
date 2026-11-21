import type { RefObject } from "react";
import { Sheet } from "@/components/Sheet";
import { t } from "@/lib/i18n";
import { moreDestinations } from "./nav-items";
import { NavLink } from "./NavLink";

/** The More sheet below 768 px: Trash, Storage and Settings. */
export function MoreSheet({
  open,
  onClose,
  returnFocusRef,
}: {
  open: boolean;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={t("nav.more")} closeLabel={t("act.close")} component="MoreSheet" returnFocusRef={returnFocusRef}>
      <nav aria-label={t("nav.more")} className="flex flex-col gap-1">
        {moreDestinations.map((destination) => (
          <NavLink
            key={destination.id}
            destination={destination}
            label={t(destination.labelKey)}
            layout="row"
            onNavigate={onClose}
          />
        ))}
      </nav>
    </Sheet>
  );
}
