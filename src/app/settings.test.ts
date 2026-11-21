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
});
