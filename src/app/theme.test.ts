import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initTheme, parseTheme, resolveTheme, THEME_KEY, useTheme } from "./theme";

interface FakeQuery {
  matches: boolean;
  listeners: Set<() => void>;
}

// jsdom has no matchMedia. This fake lets a test flip the system theme.
function fakeMatchMedia(initial: boolean): FakeQuery {
  const state: FakeQuery = { matches: initial, listeners: new Set() };
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return state.matches;
    },
    addEventListener: (_type: string, listener: () => void) => state.listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => state.listeners.delete(listener),
  }));
  return state;
}

const attribute = () => document.documentElement.getAttribute("data-theme");

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("theme resolution", () => {
  it("falls back to system for unknown stored values", () => {
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("purple")).toBe("system");
    expect(parseTheme(null)).toBe("system");
  });

  it("follows the system only when the setting is system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("theme store", () => {
  it("applies and saves the chosen theme", () => {
    fakeMatchMedia(false);
    useTheme.getState().setTheme("dark");
    expect(attribute()).toBe("dark");
    expect(window.localStorage.getItem(THEME_KEY)).toBe("dark");
    expect(useTheme.getState().theme).toBe("dark");
  });

  it("loads the saved setting on init and updates live with the system theme", () => {
    const system = fakeMatchMedia(false);
    window.localStorage.setItem(THEME_KEY, "system");
    const stop = initTheme();
    expect(attribute()).toBe("light");

    system.matches = true;
    system.listeners.forEach((listener) => {
      listener();
    });
    expect(attribute()).toBe("dark");
    stop();
    expect(system.listeners.size).toBe(0);
  });

  it("ignores system changes when the setting is explicit", () => {
    const system = fakeMatchMedia(false);
    window.localStorage.setItem(THEME_KEY, "light");
    initTheme();
    system.matches = true;
    system.listeners.forEach((listener) => {
      listener();
    });
    expect(attribute()).toBe("light");
  });

  it("keeps working when storage throws", () => {
    fakeMatchMedia(true);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    initTheme();
    expect(attribute()).toBe("dark");
    expect(() => {
      useTheme.getState().setTheme("light");
    }).not.toThrow();
    expect(attribute()).toBe("light");
  });
});

describe("public/theme-init.js (runs before first paint)", () => {
  const script = readFileSync("public/theme-init.js", "utf8");
  // Runs the real file in a sandbox that only exposes window and document.
  const run = () => {
    runInNewContext(script, { window, document });
  };

  it.each([
    ["dark", false, "dark"],
    ["light", true, "light"],
    [null, true, "dark"],
    [null, false, "light"],
    ["system", true, "dark"],
    ["nonsense", false, "light"],
  ] as const)("stored %s with system dark=%s gives %s", (stored, systemDark, expected) => {
    fakeMatchMedia(systemDark);
    if (stored !== null) window.localStorage.setItem(THEME_KEY, stored);
    run();
    expect(attribute()).toBe(expected);
  });

  it("falls back to the system theme when storage throws", () => {
    fakeMatchMedia(true);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    run();
    expect(attribute()).toBe("dark");
  });
});
