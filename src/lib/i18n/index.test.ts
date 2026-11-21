// @vitest-environment node
import { IntlMessageFormat } from "intl-messageformat";
import { describe, expect, it, vi } from "vitest";
import { t } from "./index";
import { allMessages, messageFor } from "./messages";
import { isCopyGroupLoaded, lazyCopyGroups, loadCopyGroups } from "./index";

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

  it("has valid ICU syntax in every message", async () => {
    await loadCopyGroups(...lazyCopyGroups());
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

describe("copy groups", () => {
  // Each test imports a fresh copy of the module, so nothing is loaded yet.
  const fresh = async () => {
    vi.resetModules();
    return import("./messages");
  };

  it("has the shell groups ready and the feature groups not loaded", async () => {
    const messages = await fresh();
    expect(messages.isCopyGroupLoaded("nav")).toBe(true);
    expect(messages.isCopyGroupLoaded("ob")).toBe(false);
    expect(messages.messageFor("nav.home")).toBe("Home");
  });

  it("explains how to fix a key from a group that is not loaded yet", async () => {
    const messages = await fresh();
    expect(() => messages.messageFor("ob.connect")).toThrow(/Copy group "ob" is not loaded.*loadCopyGroups\("ob"\)/);
  });

  it("loads a group on demand, once, and keeps plain keys working", async () => {
    const messages = await fresh();
    const first = messages.loadCopyGroups("ob");
    const second = messages.loadCopyGroups("ob");
    await Promise.all([first, second]);
    expect(messages.isCopyGroupLoaded("ob")).toBe(true);
    expect(messages.messageFor("ob.connect")).toBe("Connect a bucket");
    await expect(messages.loadCopyGroups("ob")).resolves.toBeUndefined();
  });

  it("keeps overrides from the additions file inside a lazy group", async () => {
    const messages = await fresh();
    await messages.loadCopyGroups("files");
    expect(messages.messageFor("files.emptyBucket.body")).toBe(
      "Upload your first file, drag a folder in, or create a folder with New.",
    );
  });

  it("lists every group that is not core as lazy", () => {
    expect(lazyCopyGroups()).toContain("ob");
    expect(lazyCopyGroups()).not.toContain("nav");
    expect(isCopyGroupLoaded("nav")).toBe(true);
  });
});
