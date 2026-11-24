import { ArrowLeft, ChevronRight } from "lucide-react";
import { useLocation } from "wouter";
import { useLayout } from "@/components/layout";
import { ConnectionsSettings, SecuritySettings } from "@/features/vault";
import { t } from "@/lib/i18n";
import { vault } from "@/lib/storage/vault";
import type { ConnectionSummary, Settings } from "@/lib/types";
import { cn } from "@/lib/utils";
import { forgetThisDevice, lockNow } from "../lock";
import { connectionRemoval } from "../removal";
import { useSession } from "../session";
import { useSettings } from "../settings";
import { AboutPage } from "./settings/AboutPage";
import { AppearancePage } from "./settings/AppearancePage";
import { BehaviorPage } from "./settings/BehaviorPage";
import { DEFAULT_WIDE_PAGE, hrefOf, pageLabel, pageOf, type SettingsPage, settingsPages } from "./settings/pages";

/** The second line of a row in the list (S50). */
function summaryOf(page: SettingsPage, settings: Pick<Settings, "autoLockMinutes">, connections: number): string {
  switch (page) {
    case "appearance": return t("set.appearance.sub");
    case "behavior": return t("set.behavior.sub");
    case "connections": return t("set.connections.sub", { count: connections });
    case "security": return settings.autoLockMinutes === 0 ? t("sec.autolockNever") : t("set.security.sub", { minutes: settings.autoLockMinutes });
    case "about": return t("set.about.sub");
  }
}

/**
 * Settings (FR-100, S50, T50): below 768 px a list that opens detail pages, from 768 px a section nav beside the page. The page
 * is in the address (`#/settings/security`), so it survives a reload and the back button works.
 */
export function SettingsScreen({ connection, notify }: { connection: ConnectionSummary; notify: (message: string) => void }) {
  const layout = useLayout();
  const [location] = useLocation();
  const autoLockMinutes = useSettings((state) => state.autoLockMinutes);
  const update = useSettings((state) => state.update);
  const saved = useSession((state) => state.saved);
  const session = useSession.getState();
  const compact = layout === "compact";
  const requested = pageOf(location);
  const page = requested ?? (compact ? null : DEFAULT_WIDE_PAGE);
  const connectionCount = saved.some((entry) => entry.id === connection.id) ? saved.length : saved.length + 1;

  const detail = (current: SettingsPage) => {
    switch (current) {
      case "appearance": return <AppearancePage />;
      case "behavior": return <BehaviorPage />;
      case "about": return <AboutPage />;
      case "connections":
        return (
          <ConnectionsSettings
            active={connection}
            saved={saved}
            removal={connectionRemoval}
            notify={notify}
            onRemoved={(removed) => {
              session.setSaved(saved.filter((entry) => entry.id !== removed.id));
              // Removing the connection that is open ends the session with it; another saved one opens through Unlock.
              if (removed.id === connection.id) {
                void vault.savedCount().then((count) => {
                  session.disconnect();
                  if (count > 0) session.lock({ reason: "start" });
                  else session.leaveLock();
                });
              }
            }}
          />
        );
      case "security":
        return (
          <SecuritySettings
            autoLockMinutes={autoLockMinutes}
            onAutoLock={(minutes) => { update({ autoLockMinutes: minutes }); }}
            savedCount={saved.length}
            onLock={() => { lockNow("manual"); }}
            onForget={forgetThisDevice}
          />
        );
    }
  };

  if (compact) {
    return (
      <section data-component="SettingsScreen">
        <h1 className={cn("text-xl font-semibold", page !== null && "sr-only")}>{t("nav.settings")}</h1>
        {page === null ? (
          <ul aria-label={t("set.nav")} className="mt-4 flex flex-col divide-y divide-line">
            {settingsPages.map((entry) => (
              <li key={entry}>
                <a href={hrefOf(entry)} className="flex min-h-(--cf-size-touch-min) items-center gap-3 py-3 hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-base">{t(pageLabel[entry])}</span>
                    <span className="truncate text-sm text-fg-muted">{summaryOf(entry, { autoLockMinutes }, connectionCount)}</span>
                  </span>
                  <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-fg-subtle" />
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <>
            <a href="#/settings" className="-ml-1 inline-flex min-h-(--cf-size-touch-min) items-center gap-1 rounded-sm px-1 text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
              <ArrowLeft aria-hidden="true" className="size-5" />
              {t("set.back")}
            </a>
            <div className="mt-2">{detail(page)}</div>
          </>
        )}
      </section>
    );
  }

  return (
    <section data-component="SettingsScreen">
      <h1 className="text-xl font-semibold">{t("nav.settings")}</h1>
      <div className="mt-4 flex gap-8">
        <nav aria-label={t("set.nav")} className="w-56 shrink-0">
          <ul className="flex flex-col gap-1">
            {settingsPages.map((entry) => (
              <li key={entry}>
                <a
                  href={hrefOf(entry)}
                  aria-current={page === entry ? "page" : undefined}
                  className={cn(
                    "flex min-h-(--cf-size-control-md) items-center rounded-md px-3 text-base hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                    page === entry && "bg-accent-subtle font-medium text-accent-fg",
                  )}
                >
                  {t(pageLabel[entry])}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 flex-1 max-w-2xl">{page !== null && detail(page)}</div>
      </div>
    </section>
  );
}
