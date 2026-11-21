import { create } from "zustand";
import type { Settings } from "@/lib/types";

/** localStorage key for the settings (ADR-007). It carries the `coffer:` prefix that Forget this device clears. */
export const SETTINGS_KEY = "coffer:settings";

export const defaultSettings: Settings = {
  theme: "system",
  density: "comfortable",
  autoLockMinutes: 15,
  confirmTrash: false,
  uploadConcurrency: 4,
  showHiddenFiles: false,
  view: "list",
  sort: { by: "name", dir: "asc" },
  coachTipsSeen: 0,
};

/** Merge stored JSON over the defaults field by field, so an old or damaged value never breaks a screen. */
export function parseSettings(raw: string | null): Settings {
  if (raw === null) return defaultSettings;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return defaultSettings;
  }
  if (typeof value !== "object" || value === null) return defaultSettings;
  const stored = value as Record<string, unknown>;
  const sort = typeof stored.sort === "object" && stored.sort !== null ? (stored.sort as Record<string, unknown>) : {};
  const pick = <T,>(candidate: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(candidate as T) ? (candidate as T) : fallback);
  return {
    ...defaultSettings,
    density: pick(stored.density, ["comfortable", "compact"] as const, defaultSettings.density),
    view: pick(stored.view, ["list", "grid"] as const, defaultSettings.view),
    showHiddenFiles: typeof stored.showHiddenFiles === "boolean" ? stored.showHiddenFiles : defaultSettings.showHiddenFiles,
    uploadConcurrency: pick(stored.uploadConcurrency, [2, 4, 6, 8] as const, defaultSettings.uploadConcurrency),
    sort: {
      by: pick(sort.by, ["name", "modified", "size"] as const, defaultSettings.sort.by),
      dir: pick(sort.dir, ["asc", "desc"] as const, defaultSettings.sort.dir),
    },
  };
}

function read(): Settings {
  try {
    return parseSettings(window.localStorage.getItem(SETTINGS_KEY));
  } catch {
    return defaultSettings;
  }
}

interface SettingsState extends Settings {
  update: (patch: Partial<Settings>) => void;
}

/** The theme has its own key so public/theme-init.js can read it before React starts (ADR-007); the rest lives here. */
export const useSettings = create<SettingsState>((set, get) => ({
  ...read(),
  update: (patch) => {
    set(patch);
    const { theme, density, autoLockMinutes, confirmTrash, uploadConcurrency, showHiddenFiles, view, sort, coachTipsSeen } = get();
    const settings: Settings = { theme, density, autoLockMinutes, confirmTrash, uploadConcurrency, showHiddenFiles, view, sort, coachTipsSeen };
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Storage can be unavailable (private mode); the choice then lasts for this tab only.
    }
  },
}));
