import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/Button";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { ConnectionSwitch } from "./ConnectionSwitch";
import { mainDestinations } from "./nav-items";
import { NavLink } from "./NavLink";

/** Sidebar from 1024 px. Collapsing keeps the icons and moves the labels to the accessible name. */
export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const label = collapsed ? t("nav.sidebar.expand") : t("nav.sidebar.collapse");
  return (
    <nav
      aria-label={t("nav.sidebar.label")}
      data-component="Sidebar"
      data-collapsed={collapsed}
      className={cn(
        "hidden shrink-0 flex-col gap-1 border-r border-line bg-surface p-2 @lg:flex",
        collapsed ? "w-(--cf-size-rail-width)" : "w-(--cf-size-sidebar-width)",
      )}
    >
      <div className="flex flex-1 flex-col gap-1">
        {mainDestinations.map((destination) => (
          <NavLink
            key={destination.id}
            destination={destination}
            label={t(destination.labelKey)}
            layout="row"
            iconOnly={collapsed}
            className={collapsed ? "justify-center px-0" : ""}
          />
        ))}
      </div>
      <ConnectionSwitch variant={collapsed ? "icon" : "block"} className={collapsed ? "self-center" : "w-full"} />
      <Button
        variant="ghost"
        iconOnly
        aria-label={label}
        aria-expanded={!collapsed}
        icon={<Icon aria-hidden="true" className="size-5" />}
        onClick={onToggle}
        className="self-end"
      />
    </nav>
  );
}
