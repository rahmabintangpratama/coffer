import { Folder, HardDrive, House, Settings, Star, Trash2, type LucideIcon } from "lucide-react";
import type { CopyKey } from "@/lib/i18n";

// The destinations from design/screens.md. Typing labelKey as CopyKey makes a
// missing copy key a compile error even though it is not a t("…") call.
export interface Destination {
  id: "home" | "files" | "starred" | "trash" | "storage" | "settings";
  to: "/" | "/files" | "/starred" | "/trash" | "/storage" | "/settings";
  labelKey: CopyKey;
  icon: LucideIcon;
}

const home: Destination = { id: "home", to: "/", labelKey: "nav.home", icon: House };
const files: Destination = { id: "files", to: "/files", labelKey: "nav.files", icon: Folder };
const starred: Destination = { id: "starred", to: "/starred", labelKey: "nav.starred", icon: Star };
const trash: Destination = { id: "trash", to: "/trash", labelKey: "nav.trash", icon: Trash2 };
const storage: Destination = { id: "storage", to: "/storage", labelKey: "nav.storage", icon: HardDrive };
const settings: Destination = { id: "settings", to: "/settings", labelKey: "nav.settings", icon: Settings };

/** Rail, sidebar and drawer. */
export const mainDestinations: readonly Destination[] = [home, files, starred, trash, storage, settings];
/** Bottom navigation below 768 px: Home, Starred, Files, then More. */
export const bottomDestinations: readonly Destination[] = [home, starred, files];
/** What the More sheet lists. */
export const moreDestinations: readonly Destination[] = [trash, storage, settings];
