import { Download, Info, Link2 } from "lucide-react";
import { createElement } from "react";
import type { MenuGroup } from "@/components/ActionMenu";
import { t } from "@/lib/i18n";
import type { Item } from "./model";

export interface ActionHandlers {
  download: (items: Item[]) => void;
  details: (item: Item) => void;
  copyKey: (item: Item) => void;
}

const icon = (component: typeof Download) => createElement(component, { "aria-hidden": true, className: "size-5 text-fg-muted" });

/**
 * The actions that exist so far (FR-31). Each later milestone adds its own;
 * a menu never lists an action that does nothing. A folder has none yet, so it
 * has no menu.
 */
export function actionsFor(item: Item, handlers: ActionHandlers): MenuGroup[] {
  if (item.kind === "folder") return [];
  return [
    {
      id: "file",
      actions: [
        { id: "download", label: t("act.download"), icon: icon(Download), onSelect: () => { handlers.download([item]); } },
        { id: "details", label: t("act.details"), icon: icon(Info), onSelect: () => { handlers.details(item); } },
        { id: "copyKey", label: t("act.copyKey"), icon: icon(Link2), onSelect: () => { handlers.copyKey(item); } },
      ],
    },
  ];
}
