import { t } from "@/lib/i18n";
import { ConnectionSwitch } from "./ConnectionSwitch";
import { mainDestinations } from "./nav-items";
import { NavLink } from "./NavLink";

/** Navigation rail for 768 to 1023 px. */
export function NavRail() {
  return (
    <nav
      aria-label={t("nav.sidebar.label")}
      data-component="NavRail"
      className="hidden w-(--cf-size-rail-width) shrink-0 flex-col items-center gap-1 border-r border-line bg-surface px-1 py-3 @md:flex @lg:hidden"
    >
      {mainDestinations.map((destination) => (
        <NavLink
          key={destination.id}
          destination={destination}
          label={t(destination.labelKey)}
          layout="stacked"
          className="w-full"
        />
      ))}
      <div className="mt-auto">
        <ConnectionSwitch variant="icon" />
      </div>
    </nav>
  );
}
