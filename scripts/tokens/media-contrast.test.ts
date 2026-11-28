// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseColor, ratio } from "../contrast/wcag.ts";

// DC-27: the media layer under the full-screen viewer. WCAG 2.1: text 4.5:1 (1.4.3), icons, borders and focus 3:1 (1.4.11).
interface Leaf { $value: string; $extensions: { "coffer.dark": string } }
const tokens = JSON.parse(readFileSync(fileURLToPath(new URL("../../design/tokens.json", import.meta.url)), "utf8")) as {
  primitive: Record<string, Record<string, { $value: string }>>;
  color: { media: Record<string, Leaf> };
};

function color(name: string, theme: "light" | "dark") {
  const leaf = tokens.color.media[name];
  const value = theme === "light" ? leaf?.$value : leaf?.$extensions["coffer.dark"];
  const [, group = "", step = ""] = /^\{primitive\.(\w+)\.([\w-]+)\}$/.exec(value ?? "") ?? [];
  const hex = tokens.primitive[group]?.[step]?.$value;
  if (hex === undefined) throw new Error(`media.${name} has no ${theme} color`);
  const [r, g, b] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
  return parseColor(`rgb(${String(r)}, ${String(g)}, ${String(b)})`);
}

describe.each(["light", "dark"] as const)("DC-27 media tokens in the %s theme", (theme) => {
  for (const ground of ["bg", "surface"]) {
    it.each(["fg", "fg-muted"])(`%s reads on ${ground} at 4.5:1`, (text) => {
      expect(ratio(color(text, theme), color(ground, theme))).toBeGreaterThanOrEqual(4.5);
    });
    it.each(["fg", "border", "focus-ring"])(`%s as an icon or edge shows on ${ground} at 3:1`, (part) => {
      expect(ratio(color(part, theme), color(ground, theme))).toBeGreaterThanOrEqual(3);
    });
  }
});
