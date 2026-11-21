import { ChevronDown, ChevronRight } from "lucide-react";
import { ActionMenu, type MenuGroup } from "@/components/ActionMenu";
import { useLayout } from "@/components/layout";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { crumbsOf, pathFromPrefix } from "./model";

const linkClass = "rounded-xs px-1 py-2 text-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/**
 * Where you are (FR-22). At 375 px the middle folders fold into an ellipsis that
 * goes up one level: `Root › … › current`. The current folder has a menu when
 * the folder has actions (none until upload lands).
 */
export function Breadcrumb({ rootLabel, prefix, menu }: { rootLabel: string; prefix: string; menu: MenuGroup[] }) {
  const layout = useLayout();
  const crumbs = crumbsOf(prefix);
  const current = crumbs.at(-1);
  const parents = crumbs.slice(0, -1);
  const folded = layout === "compact" && parents.length > 1;
  const shown = folded ? [] : parents;
  const up = parents.at(-1);

  const sep = <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-fg-subtle" />;
  return (
    <nav aria-label={t("files.breadcrumb.label")} data-component="Breadcrumb">
      <ol className="flex min-w-0 flex-wrap items-center gap-1 text-base">
        <li className="flex items-center gap-1">
          {current ? <a href={`#${pathFromPrefix("")}`} className={linkClass}>{rootLabel}</a> : <span aria-current="page" className="px-1 py-2 font-semibold">{rootLabel}</span>}
        </li>
        {folded && (
          <li className="flex items-center gap-1">
            {sep}
            <a href={`#${pathFromPrefix(up?.prefix ?? "")}`} aria-label={t("files.breadcrumb.up")} className={linkClass}>…</a>
          </li>
        )}
        {shown.map((crumb) => (
          <li key={crumb.prefix} className="flex min-w-0 items-center gap-1">
            {sep}
            <a href={`#${pathFromPrefix(crumb.prefix)}`} className={cn(linkClass, "truncate")}>{crumb.name}</a>
          </li>
        ))}
        {current && (
          <li className="flex min-w-0 items-center gap-1">
            {sep}
            {menu.length > 0 ? (
              <ActionMenu
                groups={menu}
                triggerLabel={t("menu.folder.label")}
                title={current.name}
                closeLabel={t("act.close")}
                component="FolderMenu"
                trigger={(props) => (
                  <button type="button" aria-label={t("menu.folder.label")} aria-haspopup="menu" {...props} className={cn(linkClass, "inline-flex items-center gap-1 font-semibold text-fg no-underline")}>
                    <span className="truncate">{current.name}</span>
                    <ChevronDown aria-hidden="true" className="size-4" />
                  </button>
                )}
              />
            ) : (
              <span aria-current="page" className="truncate px-1 py-2 font-semibold">{current.name}</span>
            )}
          </li>
        )}
      </ol>
    </nav>
  );
}
