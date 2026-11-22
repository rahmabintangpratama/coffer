import { Copy, Download, Eye, FolderInput, Info, Link2, Pencil, Share2, Trash2 } from "lucide-react";
import { createElement } from "react";
import type { MenuGroup } from "@/components/ActionMenu";
import { t } from "@/lib/i18n";
import { writeGate } from "@/features/readonly";
import type { Item } from "./model";

export interface ActionHandlers {
  preview: (item: Item) => void;
  download: (items: Item[]) => void;
  details: (item: Item) => void;
  copyKey: (item: Item) => void;
  /** One file only; a folder's menu shows it disabled (AC-60.4). */
  share: (item: Item) => void;
  rename: (item: Item) => void;
  makeCopy: (item: Item) => void;
  move: (items: Item[]) => void;
  /** Left out inside the trash (AC-36.5). */
  trash?: (items: Item[]) => void;
}

const icon = (component: typeof Download) => createElement(component, { "aria-hidden": true, className: "size-5 text-fg-muted" });

/**
 * The actions that exist so far (FR-31). Each later milestone adds its own; a menu never lists
 * an action that does nothing. A folder has Rename and Move; Preview, Download and Make a
 * copy are for files (AC-31.3, FR-33). On a read-only connection the write actions are
 * shown disabled with the reason, never left out (FR-111).
 */
export function actionsFor(item: Item, handlers: ActionHandlers, readOnly = false): MenuGroup[] {
  const gate = writeGate(readOnly);
  const write = gate.action;
  const organize: MenuGroup = {
    id: "organize",
    label: t("menu.group.organize"),
    actions: [
      { id: "rename", label: t("act.rename"), icon: icon(Pencil), ...write(false), onSelect: () => { handlers.rename(item); } },
      ...(item.kind === "file" ? [{ id: "makeCopy", label: t("act.makeCopy"), icon: icon(Copy), ...write(false), onSelect: () => { handlers.makeCopy(item); } }] : []),
      { id: "move", label: t("act.moveTo"), icon: icon(FolderInput), ...write(false), onSelect: () => { handlers.move([item]); } },
    ],
  };
  const share = (disabledReason?: string) => ({
    id: "share",
    label: t("act.share"),
    icon: icon(Share2),
    ...(disabledReason === undefined ? { onSelect: () => { handlers.share(item); } } : { disabled: true, reason: disabledReason, onSelect: () => undefined }),
  });
  const remove: MenuGroup[] = handlers.trash
    ? [{ id: "remove", actions: [{ id: "trash", label: t("act.trash"), icon: icon(Trash2), ...write(false), onSelect: () => { handlers.trash?.([item]); } }] }]
    : [];
  if (item.kind === "folder") return [{ id: "share", actions: [share(t("share.reason.folder"))] }, organize, ...remove];
  return [
    {
      id: "file",
      actions: [
        { id: "preview", label: t("act.preview"), icon: icon(Eye), onSelect: () => { handlers.preview(item); } },
        { id: "download", label: t("act.download"), icon: icon(Download), onSelect: () => { handlers.download([item]); } },
        share(),
      ],
    },
    organize,
    {
      id: "info",
      actions: [
        { id: "details", label: t("act.details"), icon: icon(Info), onSelect: () => { handlers.details(item); } },
        { id: "copyKey", label: t("act.copyKey"), icon: icon(Link2), onSelect: () => { handlers.copyKey(item); } },
      ],
    },
    ...remove,
  ];
}
