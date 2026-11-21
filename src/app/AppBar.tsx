import { Menu } from "lucide-react";
import { lazy, type RefObject, Suspense } from "react";
import { Button } from "@/components/Button";
import { CofferMark } from "@/components/CofferMark";
import { useFilesChrome } from "@/features/files/chrome";
import { t } from "@/lib/i18n";

// The Files route's search, chips and selection bar. It is part of the Files chunk; the shell only asks for it while Files is showing.
const FilesAppBar = lazy(() => import("@/features/files/AppBarContent"));

/**
 * Top bar. It is route-aware: on Files it carries the search pill and filter
 * chips, and the selection bar replaces it while items are selected (design:
 * components.md). The connection avatar arrives with M8.
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
  const filesActive = useFilesChrome((state) => state.active);
  const menuButton = (
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
  );
  const brand = (
    <span className="flex shrink-0 items-center gap-2">
      <CofferMark size={8} />
      <span className="text-lg font-semibold">{t("app.name")}</span>
    </span>
  );
  const plain = (
    <div className="flex h-(--cf-size-appbar-height) items-center gap-2 px-3 @md:px-6">
      {menuButton}
      {brand}
    </div>
  );
  return (
    <header data-component="AppBar" className="sticky top-0 z-(--cf-z-sticky) shrink-0 border-b border-line bg-surface">
      {filesActive ? (
        <Suspense fallback={plain}>
          <FilesAppBar menuButton={menuButton} brand={brand} />
        </Suspense>
      ) : (
        plain
      )}
    </header>
  );
}
