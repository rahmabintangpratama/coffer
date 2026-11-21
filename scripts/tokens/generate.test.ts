// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { generate, type TokenTree } from "./generate.ts";

const repo = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url));
const read = (path: string) => readFileSync(repo(path), "utf8");
const tokens = JSON.parse(read("design/tokens.json")) as TokenTree;

// Differences between the design package's CSS and the generated CSS that are
// understood and accepted. Keep this list short; every entry needs a reason.
const KNOWN_DESIGN_DEVIATIONS: readonly { design: string; generated: string; reason: string }[] = [
  {
    design: "var(--cf-inverse-accent)",
    generated: "var(--cf-color-inverse-accent)",
    reason:
      "design/tokens.css references a custom property that is never defined, so the toast focus ring " +
      "would be invalid. tokens.json says {color.inverse.accent}, which the generator resolves correctly. " +
      "Logged as DC-25 in docs/open-questions.md.",
  },
];

const normalize = (css: string) => css.replace(/\s+/g, " ").trim();
const withoutKnownDeviations = (designCss: string) =>
  KNOWN_DESIGN_DEVIATIONS.reduce(
    (css, { design, generated }) => css.replaceAll(design, generated),
    designCss,
  );

describe("token generator", () => {
  const generated = generate(tokens);

  it("reproduces design/tokens.css (golden)", () => {
    expect(normalize(generated.tokensCss)).toBe(normalize(withoutKnownDeviations(read("design/tokens.css"))));
  });

  it("reproduces design/tailwind.css (golden)", () => {
    expect(normalize(generated.tailwindCss)).toBe(normalize(read("design/tailwind.css")));
  });

  it("is deterministic", () => {
    expect(generate(tokens)).toEqual(generated);
  });

  it("matches the committed files in src/styles", () => {
    expect(read("src/styles/tokens.css")).toBe(generated.tokensCss);
    expect(read("src/styles/tailwind.css")).toBe(generated.tailwindCss);
  });

  it("only accepts documented deviations", () => {
    const raw = normalize(read("design/tokens.css"));
    for (const { design } of KNOWN_DESIGN_DEVIATIONS) {
      expect(raw).toContain(design);
    }
  });

  it("fails on a reference to a token that does not exist", () => {
    const broken = structuredClone(tokens) as { color: { bg: { app: { $value: string } } } };
    broken.color.bg.app.$value = "{primitive.gray.9999}";
    expect(() => generate(broken)).toThrow(/Unknown token reference: primitive\.gray\.9999/);
  });
});
