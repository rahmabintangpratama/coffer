import { Menu } from "lucide-react";
import { lazy, type RefObject, Suspense } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/Button";
import { CofferMark } from "@/components/CofferMark";
import { useFilesChrome } from "@/features/files/chrome";
import { t } from "@/lib/i18n";
import { ConnectionSwitch } from "./ConnectionSwitch";
import { ReadOnlyChip } from "./ReadOnlyChip";
import { isActiveRoute, routes } from "./routes";

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
  // The address decides the bar: the search and chips leave it the moment the route changes, not when the next screen has finished
  // loading. The Files screen says when it is mounted; until then the Files bar is only reserved space, so its search placeholder
  // never shows an empty folder name.
  const [location] = useLocation();
  const screenMounted = useFilesChrome((state) => state.active);
  const onFiles = isActiveRoute(routes.files, location);
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
  // Below 768 px the switcher is the avatar at the end of the bar, next to the search pill (components.md, S37); from 768 px it
  // lives in the rail and the sidebar.
  const avatar = <ConnectionSwitch variant="avatar" part="button" className="@md:hidden" />;
  const plain = (
    <div className="flex h-(--cf-size-appbar-height) items-center gap-2 px-3 @md:px-6">
      {menuButton}
      {brand}
      <span className="ms-auto flex items-center gap-2">
        <ReadOnlyChip />
        <span className="flex @md:hidden">{avatar}</span>
      </span>
    </div>
  );
  // The bar of the Files route is a lazy chunk, and the screen only says it is mounted after its first render. Until both are
  // true the bar keeps its final height (the chips row included), so the list does not drop by one row when they land. A tap
  // aimed at a row would otherwise hit what moved under it.
  const filesFallback = (
    <div data-component="FilesAppBarLoading" className="flex flex-col">
      {plain}
      <div aria-hidden="true" className="py-1">
        <div className="h-(--cf-size-chip-height)" />
      </div>
    </div>
  );
  return (
    <header data-component="AppBar" className="sticky top-0 z-(--cf-z-sticky) shrink-0 border-b border-line bg-surface">
      {/* The avatar's dialog is drawn here, once: the button beside the search pill is rebuilt when the Files bar loads. */}
      <ConnectionSwitch variant="avatar" part="dialog" />
      {onFiles ? (
        screenMounted ? (
          <Suspense fallback={filesFallback}>
            <FilesAppBar menuButton={menuButton} brand={brand} trailing={<><ReadOnlyChip />{avatar}</>} />
          </Suspense>
        ) : (
          filesFallback
        )
      ) : (
        plain
      )}
    </header>
  );
}
