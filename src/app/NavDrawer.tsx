import { type PointerEvent, type RefObject, useRef } from "react";
import { Sheet } from "@/components/Sheet";
import { t } from "@/lib/i18n";
import { mainDestinations } from "./nav-items";
import { NavLink } from "./NavLink";

const SWIPE_DISTANCE = 60;

/**
 * Left drawer opened by the menu button below 768 px. Closes on Escape, a tap
 * on the scrim, a link, the close button or a swipe to the left.
 */
export function NavDrawer({
  open,
  onClose,
  returnFocusRef,
}: {
  open: boolean;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    start.current = { x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const origin = start.current;
    start.current = null;
    if (!origin) return;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    if (dx < -SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy)) onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("nav.sidebar.label")}
      closeLabel={t("act.close")}
      side="start"
      component="NavDrawer"
      returnFocusRef={returnFocusRef}
      panelProps={{ onPointerDown, onPointerUp, className: "touch-pan-y" }}
    >
      <nav aria-label={t("nav.sidebar.label")} className="flex flex-col gap-1">
        {mainDestinations.map((destination) => (
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
