import { describe, expect, it } from "vitest";
import { defaultSettings, parseSettings } from "./settings";

describe("AC-20.3 settings persistence", () => {
  it("falls back to the defaults for nothing, bad JSON or a non-object", () => {
    expect(parseSettings(null)).toEqual(defaultSettings);
    expect(parseSettings("{")).toEqual(defaultSettings);
    expect(parseSettings("3")).toEqual(defaultSettings);
  });
  it("keeps valid fields and replaces invalid ones one by one", () => {
    const parsed = parseSettings(JSON.stringify({ view: "grid", density: "huge", sort: { by: "size", dir: "up" }, showHiddenFiles: true }));
    expect(parsed.view).toBe("grid");
    expect(parsed.density).toBe(defaultSettings.density);
    expect(parsed.sort).toEqual({ by: "size", dir: defaultSettings.sort.dir });
    expect(parsed.showHiddenFiles).toBe(true);
  });
  it("AC-100.1 every behavior and security setting round-trips, so a reload keeps it", () => {
    const chosen = { density: "compact", confirmTrash: true, showHiddenFiles: true, uploadConcurrency: 8, autoLockMinutes: 30, coachTipsSeen: 2, view: "grid", sort: { by: "modified", dir: "desc" } };
    expect(parseSettings(JSON.stringify(chosen))).toMatchObject(chosen);
    expect(parseSettings(JSON.stringify({ autoLockMinutes: 0 })).autoLockMinutes).toBe(0);
  });
  it("replaces values that are not one of the choices", () => {
    const parsed = parseSettings(JSON.stringify({ confirmTrash: "yes", uploadConcurrency: 5, autoLockMinutes: 7, coachTipsSeen: 9 }));
    expect(parsed).toMatchObject({ confirmTrash: false, uploadConcurrency: defaultSettings.uploadConcurrency, autoLockMinutes: defaultSettings.autoLockMinutes, coachTipsSeen: defaultSettings.coachTipsSeen });
  });
});
