import { create } from "zustand";
import type { Theme } from "@/lib/types";

export type ResolvedTheme = "light" | "dark";

/** localStorage key shared with public/theme-init.js (ADR-007). */
export const THEME_KEY = "coffer:theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

export function parseTheme(value: unknown): Theme {
  return value === "light" || value === "dark" ? value : "system";
}

export function resolveTheme(setting: Theme, systemPrefersDark: boolean): ResolvedTheme {
  if (setting === "system") return systemPrefersDark ? "dark" : "light";
  return setting;
}

function readStoredTheme(): Theme {
  try {
    return parseTheme(window.localStorage.getItem(THEME_KEY));
  } catch {
    return "system";
  }
}

function systemPrefersDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches;
}

/** tokens.css defines dark only under [data-theme="dark"], so the attribute is always set. */
function applyTheme(setting: Theme): void {
  document.documentElement.setAttribute("data-theme", resolveTheme(setting, systemPrefersDark()));
}

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export const useTheme = create<ThemeState>((set) => ({
  theme: "system",
  setTheme: (theme) => {
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Storage can be unavailable (private mode); the choice then lasts for this tab only.
    }
    applyTheme(theme);
    set({ theme });
  },
}));

/**
 * Load the saved setting and keep the page in sync with the system theme while
 * the setting is "system". Returns a function that removes the listeners.
 */
export function initTheme(): () => void {
  const initial = readStoredTheme();
  useTheme.setState({ theme: initial });
  applyTheme(initial);

  const query = window.matchMedia(DARK_QUERY);
  const onSystemChange = () => {
    applyTheme(useTheme.getState().theme);
  };
  // Another tab changed the setting.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_KEY) return;
    const next = parseTheme(event.newValue);
    useTheme.setState({ theme: next });
    applyTheme(next);
  };
  query.addEventListener("change", onSystemChange);
  window.addEventListener("storage", onStorage);
  return () => {
    query.removeEventListener("change", onSystemChange);
    window.removeEventListener("storage", onStorage);
  };
}
