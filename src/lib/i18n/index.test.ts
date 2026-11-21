// @vitest-environment node
import { IntlMessageFormat } from "intl-messageformat";
import { describe, expect, it } from "vitest";
import { t } from "./index";
import { allMessages, messageFor } from "./messages";

describe("t", () => {
  it("returns plain design copy", () => {
    expect(t("app.name")).toBe("Coffer");
    expect(t("nav.home")).toBe("Home");
  });

  it("fills placeholders and plurals", () => {
    expect(t("forget.connections", { count: 1 })).toBe("1 saved connection and its key");
    expect(t("forget.connections", { count: 3 })).toBe("3 saved connections and their keys");
    expect(t("conn.name", { provider: "Cloudflare R2", bucket: "exports" })).toBe("Cloudflare R2 · exports");
  });

  it("reads keys from the additions file, which wins over the design file", () => {
    expect(t("nav.files")).toBe("Files");
    expect(t("files.emptyBucket.body")).toBe("Upload your first file, drag a folder in, or create a folder with New.");
  });

  it("fails loudly on a key that does not exist", () => {
    expect(() => messageFor("no.such.key")).toThrow("Unknown copy key: no.such.key");
  });

  it("rejects an unknown key at compile time", () => {
    // @ts-expect-error not a copy key
    expect(() => t("no.such.key")).toThrow();
  });

  it("has valid ICU syntax in every message", () => {
    const broken: string[] = [];
    for (const [key, message] of allMessages()) {
      try {
        new IntlMessageFormat(message, "en");
      } catch {
        broken.push(key);
      }
    }
    expect(broken).toEqual([]);
  });
});
