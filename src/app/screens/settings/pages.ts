import type { CopyKey } from "@/lib/i18n";

/** The Settings pages, in the order of the list and the section nav (FR-100). */
export const settingsPages = ["appearance", "behavior", "connections", "security", "about"] as const;
export type SettingsPage = (typeof settingsPages)[number];

export const pageLabel: Record<SettingsPage, CopyKey> = {
  appearance: "set.appearanceLabel",
  behavior: "set.behaviorLabel",
  connections: "set.connectionsLabel",
  security: "set.securityLabel",
  about: "set.aboutLabel",
};

/** The page in a location like `/settings/security`, or null for the list (`/settings`) and anything unknown. */
export function pageOf(location: string): SettingsPage | null {
  const name = location.replace(/^\/settings\/?/, "").split("/")[0];
  return settingsPages.find((page) => page === name) ?? null;
}

/** From 768 px there is no list, so the bare address shows this page (S50: security on tablet and desktop). */
export const DEFAULT_WIDE_PAGE: SettingsPage = "security";

export const hrefOf = (page: SettingsPage): string => `#/settings/${page}`;
