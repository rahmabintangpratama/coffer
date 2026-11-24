// @vitest-environment node
import { describe, expect, it } from "vitest";
import { t } from "./i18n";
import { hasHiddenChars, hiddenCodePoints, isolate, revealHiddenChars, stripHiddenChars } from "./names";
import { attachmentDisposition } from "./s3/disposition";

const RLO = "\u202E";

describe("hidden characters in names (S-10)", () => {
  it("detects every character in scope and nothing else", () => {
    const inScope = ["\u202A", "\u202B", "\u202C", "\u202D", RLO, "\u2066", "\u2067", "\u2068", "\u2069", "\u200E", "\u200F", "\u061C", "\u200B", "\u200C", "\u200D", "\uFEFF"];
    for (const char of inScope) expect(hasHiddenChars(`a${char}b`), char.codePointAt(0)?.toString(16)).toBe(true);
    for (const plain of ["report.pdf", "résumé.txt", "日本語.md", "שלום.txt", "مرحبا.txt", "a b", "😀.png"]) expect(hasHiddenChars(plain)).toBe(false);
  });

  it("draws each character as a marker so the stored order is what shows", () => {
    expect(revealHiddenChars(`invoice${RLO}fdp.exe`)).toBe("invoice⟨U+202E⟩fdp.exe");
    expect(revealHiddenChars("a\u200Bb\uFEFFc")).toBe("a⟨U+200B⟩b⟨U+FEFF⟩c");
    expect(revealHiddenChars("plain.txt")).toBe("plain.txt");
    expect(hiddenCodePoints(`x${RLO}y${RLO}z\u061C`)).toEqual(["U+202E", "U+061C"]);
  });

  it("strips them for the download name", () => {
    expect(stripHiddenChars(`invoice${RLO}fdp.exe`)).toBe("invoicefdp.exe");
    expect(attachmentDisposition(`invoice${RLO}fdp.exe`)).toBe(`attachment; filename="invoicefdp.exe"; filename*=UTF-8''invoicefdp.exe`);
  });

  describe("isolate", () => {
    it("leaves a plain name alone", () => {
      expect(isolate("report.pdf")).toBe("report.pdf");
      expect(isolate("שלום.txt")).toBe("שלום.txt");
    });

    it("wraps a name with controls in a first-strong isolate and closes what it opens", () => {
      expect(isolate(`a${RLO}b`)).toBe("\u2068a\u202Eb\u202C\u2069");
      expect(isolate("a\u2067b")).toBe("\u2068a\u2067b\u2069\u2069");
    });

    it("drops a closer that has nothing to close, so it cannot end the isolate early", () => {
      expect(isolate("a\u2069b\u200B")).toBe("\u2068ab\u200B\u2069");
      expect(isolate("a\u202Cb\u200B")).toBe("\u2068ab\u200B\u2069");
    });

    it("closes embeddings inside an isolate the name itself opens and closes", () => {
      expect(isolate(`a\u2066b${RLO}c\u2069d`)).toBe("\u2068a\u2066b\u202Ec\u202C\u2069d\u2069");
    });
  });

  it("isolates text values in copy, and only those that need it", () => {
    expect(t("act.rename")).toBe("Rename");
    expect(t("del.one.body", { name: "report.pdf", bucket: "docs" })).toBe("report.pdf will be deleted from docs. You can’t undo this.");
    expect(t("del.one.body", { name: `invoice${RLO}fdp.exe`, bucket: "docs" })).toBe("\u2068invoice\u202Efdp.exe\u202C\u2069 will be deleted from docs. You can’t undo this.");
  });
});
