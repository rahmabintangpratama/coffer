// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { metaTags, readConfig } from "../deploy/render.ts";
import { deployTarget, withMetaPolicy } from "./deploy.ts";

// ADR-010: the GitHub Pages build carries its policy in the page.
const index = readFileSync(fileURLToPath(new URL("../../index.html", import.meta.url)), "utf8");

describe("the GitHub Pages policy", () => {
  it("comes before the first script and every link", () => {
    const html = withMetaPolicy(index, metaTags(readConfig()));
    const policy = html.indexOf('http-equiv="Content-Security-Policy"');
    expect(policy).toBeGreaterThan(0);
    expect(policy).toBeLessThan(html.indexOf("<script"));
    expect(policy).toBeLessThan(html.indexOf("<link"));
  });

  it("refuses a page it cannot place the policy in, and an unknown target", () => {
    expect(() => withMetaPolicy("<html></html>", [])).toThrow("charset");
    expect(() => deployTarget("netlfy")).toThrow("COFFER_TARGET");
    expect([deployTarget(undefined), deployTarget(""), deployTarget("github-pages")]).toEqual(["headers", "headers", "github-pages"]);
  });
});
