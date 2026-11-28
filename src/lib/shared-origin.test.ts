import { describe, expect, it } from "vitest";
import { isSharedOrigin } from "./shared-origin";

describe("FR-1 AC-1.4 a shared origin", () => {
  it("is any base path, and a path on a GitHub Pages host", () => {
    expect(isSharedOrigin("/coffer/", "files.example.com", "/coffer/")).toBe(true);
    expect(isSharedOrigin("/", "Someone.GitHub.io", "/coffer/")).toBe(true);
  });

  it("is not the root of an origin, on GitHub Pages or anywhere else", () => {
    for (const [host, path] of [["someone.github.io", "/"], ["someone.github.io", "/index.html"], ["files.example.com", "/"], ["coffer.pages.dev", "/"], ["github.io.example.com", "/x"]]) {
      expect(isSharedOrigin("/", host ?? "", path ?? ""), `${host ?? ""}${path ?? ""}`).toBe(false);
    }
  });
});
