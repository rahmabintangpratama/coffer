import { Copy, Download, Eye, FolderInput, FolderOpen, Info, Link2, Pencil, Share2, Star, StarOff, Trash2 } from "lucide-react";
import { createElement } from "react";
import type { MenuGroup } from "@/components/ActionMenu";
import { t } from "@/lib/i18n";
import { writeGate } from "@/features/readonly";
import type { Item } from "./model";
import { hints } from "./shortcuts";

export interface ActionHandlers {
  /** A folder opens (navigates); a file previews. */
  open: (item: Item) => void;
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
  /** FR-80: stars are local, so they stay on a read-only connection. */
  isStarred: (item: Item) => boolean;
  star: (items: Item[], add: boolean) => void;
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
      { id: "rename", label: t("act.rename"), icon: icon(Pencil), shortcut: hints.rename, ...write(false), onSelect: () => { handlers.rename(item); } },
      ...(item.kind === "file" ? [{ id: "makeCopy", label: t("act.makeCopy"), icon: icon(Copy), ...write(false), onSelect: () => { handlers.makeCopy(item); } }] : []),
      { id: "move", label: t("act.moveTo"), icon: icon(FolderInput), shortcut: hints.move, ...write(false), onSelect: () => { handlers.move([item]); } },
    ],
  };
  const share = (disabledReason?: string) => ({
    id: "share",
    label: t("act.share"),
    icon: icon(Share2),
    ...(disabledReason === undefined ? { onSelect: () => { handlers.share(item); } } : { disabled: true, reason: disabledReason, onSelect: () => undefined }),
  });
  const remove: MenuGroup[] = handlers.trash
    ? [{ id: "remove", actions: [{ id: "trash", label: t("act.trash"), icon: icon(Trash2), shortcut: hints.trash, ...write(false), onSelect: () => { handlers.trash?.([item]); } }] }]
    : [];
  const starred = handlers.isStarred(item);
  const starAction = {
    id: "star",
    label: starred ? t("act.unstar") : t("act.star"),
    icon: icon(starred ? StarOff : Star),
    shortcut: hints.star,
    onSelect: () => { handlers.star([item], !starred); },
  };
  if (item.kind === "folder") {
    return [
      { id: "open", actions: [{ id: "open", label: t("kb.open"), icon: icon(FolderOpen), shortcut: hints.open, onSelect: () => { handlers.open(item); } }] },
      { id: "share", actions: [share(t("share.reason.folder")), starAction] },
      organize,
      ...remove,
    ];
  }
  return [
    {
      id: "file",
      actions: [
        { id: "preview", label: t("act.preview"), icon: icon(Eye), shortcut: hints.preview, onSelect: () => { handlers.preview(item); } },
        { id: "download", label: t("act.download"), icon: icon(Download), onSelect: () => { handlers.download([item]); } },
        share(),
      ],
    },
    organize,
    {
      id: "info",
      actions: [
        starAction,
        { id: "details", label: t("act.details"), icon: icon(Info), shortcut: hints.details, onSelect: () => { handlers.details(item); } },
        { id: "copyKey", label: t("act.copyKey"), icon: icon(Link2), onSelect: () => { handlers.copyKey(item); } },
      ],
    },
    ...remove,
  ];
}
