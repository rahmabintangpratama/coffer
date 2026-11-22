// @vitest-environment node
import { describe, expect, it } from "vitest";
import { composite, parseColor, ratio, rounded, sameColor, toHex } from "./wcag.ts";

describe("WCAG contrast helpers", () => {
  it("reads the colour formats browsers report", () => {
    expect(parseColor("rgb(23, 22, 20)")).toEqual({ r: 23, g: 22, b: 20, a: 1 });
    expect(parseColor("rgba(23, 22, 20, 0.08)")).toEqual({ r: 23, g: 22, b: 20, a: 0.08 });
    expect(parseColor("rgb(23 22 20 / 50%)")).toEqual({ r: 23, g: 22, b: 20, a: 0.5 });
    expect(parseColor("color(srgb 1 0 0 / 0.5)")).toEqual({ r: 255, g: 0, b: 0, a: 0.5 });
    expect(parseColor("transparent").a).toBe(0);
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(() => parseColor("lab(50% 20 30)")).toThrow();
  });

  it("matches the reference ratios: black on white is 21, a colour on itself is 1, #767676 on white is 4.54", () => {
    expect(ratio(parseColor("#000"), parseColor("#fff"))).toBeCloseTo(21, 5);
    expect(ratio(parseColor("#336699"), parseColor("#336699"))).toBe(1);
    expect(rounded(ratio(parseColor("#767676"), parseColor("#fff")))).toBe(4.54);
    expect(ratio(parseColor("#fff"), parseColor("#000"))).toBeCloseTo(21, 5);
  });

  it("paints a translucent overlay over a fill", () => {
    const over = composite({ r: 0, g: 0, b: 0, a: 0.5 }, { r: 255, g: 255, b: 255, a: 1 });
    expect(toHex(over)).toBe("#808080");
    expect(composite({ r: 1, g: 2, b: 3, a: 0 }, { r: 9, g: 8, b: 7, a: 1 })).toEqual({ r: 9, g: 8, b: 7, a: 1 });
  });

  it("calls colours the same within one step", () => {
    expect(sameColor(parseColor("rgb(10, 20, 30)"), parseColor("rgb(11, 20, 29)"))).toBe(true);
    expect(sameColor(parseColor("rgb(10, 20, 30)"), parseColor("rgb(13, 20, 30)"))).toBe(false);
  });
});
