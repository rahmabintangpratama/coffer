import { Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { AppBar } from "./AppBar";
import { BottomNav } from "./BottomNav";
import { MoreSheet } from "./MoreSheet";
import { mainDestinations } from "./nav-items";
import { NavDrawer } from "./NavDrawer";
import { NavRail } from "./NavRail";
import { Sidebar } from "./Sidebar";
import { ToastHost } from "./ToastHost";
import { useCompactLayout } from "./useCompactLayout";

/**
 * The three shells from design/screens.md, chosen by the width of .cf-root:
 * top bar, bottom nav and drawer below 768 px; rail from 768 px; sidebar from
 * 1024 px. .cf-app sits directly inside .cf-root, which is the container.
 */
export function Shell() {
  const root = useRef<HTMLDivElement>(null);
  const main = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  const compact = useCompactLayout(root);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const destination = mainDestinations.find((item) => item.to === pathname);

  // One title per screen, so a screen reader hears where it is.
  useEffect(() => {
    document.title = `${destination ? t(destination.labelKey) : t("app.name")} · ${t("app.name")}`;
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
            className="flex-1 p-4 outline-none @md:p-6"
          >
            <Outlet />
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
      </div>
    </div>
  );
}
