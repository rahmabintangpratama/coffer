import { describe, expect, it } from "vitest";
import { t } from "@/lib/i18n";
import { bottomDestinations, mainDestinations, moreDestinations } from "./nav-items";

describe("navigation destinations", () => {
  it("lists Home, Files, Starred, Trash, Storage and Settings once each", () => {
    expect(mainDestinations.map((item) => t(item.labelKey))).toEqual([
      "Home",
      "Files",
      "Starred",
      "Trash",
      "Storage",
      "Settings",
    ]);
    expect(new Set(mainDestinations.map((item) => item.to)).size).toBe(mainDestinations.length);
  });

  it("puts Home, Starred and Files in the bottom bar and Trash, Storage and Settings under More", () => {
    expect(bottomDestinations.map((item) => item.id)).toEqual(["home", "starred", "files"]);
    expect(moreDestinations.map((item) => item.id)).toEqual(["trash", "storage", "settings"]);
  });

  it("covers every destination exactly once across the bottom bar and More", () => {
    const ids = [...bottomDestinations, ...moreDestinations].map((item) => item.id).sort();
    expect(ids).toEqual(mainDestinations.map((item) => item.id).sort());
  });
});
