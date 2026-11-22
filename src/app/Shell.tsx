import { type ReactNode, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { LayoutContext } from "@/components/layout";
import { TransferPanelHost } from "./TransferPanelHost";
import { t } from "@/lib/i18n";
import { AppBar } from "./AppBar";
import { BottomNav } from "./BottomNav";
import { MoreSheet } from "./MoreSheet";
import { mainDestinations } from "./nav-items";
import { NavDrawer } from "./NavDrawer";
import { NavRail } from "./NavRail";
import { isActiveRoute } from "./routes";
import { Sidebar } from "./Sidebar";
import { ToastHost } from "./ToastHost";
import { useLayoutMode } from "./useCompactLayout";

/**
 * The three shells from design/screens.md, chosen by the width of .cf-root:
 * top bar, bottom nav and drawer below 768 px; rail from 768 px; sidebar from
 * 1024 px. .cf-app sits directly inside .cf-root, which is the container.
 */
export function Shell({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const main = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  const layout = useLayoutMode(root);
  const compact = layout === "compact";
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [pathname] = useLocation();
  const destination = mainDestinations.find((item) => isActiveRoute(item.to, pathname));

  // One title per screen, so a screen reader hears where it is.
  useEffect(() => {
    document.title = destination ? `${t(destination.labelKey)} · ${t("app.name")}` : t("app.name");
  }, [destination]);

  // After a navigation, move focus to the page so keyboard and screen reader users start at the top of it.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    main.current?.focus();
  }, [pathname]);

  // The drawer and the More sheet only exist below 768 px. Closing them when the
  // layout widens is done while rendering (a state adjustment), not in an effect.
  const [wasCompact, setWasCompact] = useState(compact);
  if (wasCompact !== compact) {
    setWasCompact(compact);
    if (!compact) {
      setDrawerOpen(false);
      setMoreOpen(false);
    }
  }

  return (
    <LayoutContext value={layout}>
    <div ref={root} className="cf-root min-h-dvh">
      <div className="cf-app flex min-h-dvh flex-col bg-app text-fg @md:flex-row">
        <button
          type="button"
          onClick={() => {
            main.current?.focus();
          }}
          className={
            "sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-(--cf-z-tooltip) focus:rounded-md " +
            "focus:bg-surface focus:px-4 focus:py-2 focus:shadow-overlay"
          }
        >
          {t("nav.skip")}
        </button>
        <NavRail />
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => {
            setSidebarCollapsed((value) => !value);
          }}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppBar
            menuRef={menuButton}
            menuOpen={drawerOpen}
            onMenu={() => {
              setDrawerOpen(true);
            }}
          />
          <main
            ref={main}
            id="main"
            tabIndex={-1}
            aria-label={t("main.label")}
            // The transfer panel is fixed over the bottom (full width on a phone, a card at the right from 768 px); its height is kept as padding so nothing hides under it.
            className="flex-1 p-4 pb-[calc(var(--cf-space-4)+var(--cf-tray-height,0px))] outline-none @md:p-6 @md:pb-[calc(var(--cf-space-6)+var(--cf-tray-height,0px))]"
          >
            {children}
          </main>
          <BottomNav
            moreRef={moreButton}
            moreOpen={moreOpen}
            onMore={() => {
              setMoreOpen(true);
            }}
          />
        </div>
        <NavDrawer
          returnFocusRef={menuButton}
          open={drawerOpen}
          onClose={() => {
            setDrawerOpen(false);
          }}
        />
        <MoreSheet
          returnFocusRef={moreButton}
          open={moreOpen}
          onClose={() => {
            setMoreOpen(false);
          }}
        />
        <ToastHost />
        <TransferPanelHost />
      </div>
    </div>
    </LayoutContext>
  );
}
