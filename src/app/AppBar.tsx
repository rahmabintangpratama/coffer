import { Menu } from "lucide-react";
import type { RefObject } from "react";
import { Button } from "@/components/Button";
import { t } from "@/lib/i18n";

/**
 * Top bar. The search pill, connection avatar and info toggle arrive with the
 * features they belong to (M3 and M8); they are not drawn here as dead controls.
 */
export function AppBar({
  onMenu,
  menuOpen,
  menuRef,
}: {
  onMenu: () => void;
  menuOpen: boolean;
  menuRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <header
      data-component="AppBar"
      className="sticky top-0 z-(--cf-z-sticky) flex h-(--cf-size-appbar-height) shrink-0 items-center gap-2 border-b border-line bg-surface px-3 @md:px-6"
    >
      <Button
        ref={menuRef}
        variant="ghost"
        iconOnly
        aria-label={t("nav.menu")}
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        icon={<Menu aria-hidden="true" className="size-6" />}
        onClick={onMenu}
        className="@md:hidden"
      />
      <span className="text-lg font-semibold">{t("app.name")}</span>
    </header>
  );
}
