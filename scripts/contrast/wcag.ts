/** WCAG 2.x contrast, on the colours a browser reports from `getComputedStyle`. Shared by the e2e contrast pass and its report. */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** `rgb(1, 2, 3)`, `rgba(1, 2, 3, 0.5)` and `color(srgb 0.1 0.2 0.3 / 0.5)`, which is what Chromium, WebKit and Firefox return. */
export function parseColor(text: string): Rgba {
  const value = text.trim().toLowerCase();
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(value);
  if (rgb) {
    const alpha = rgb[4] === undefined ? 1 : rgb[4].endsWith("%") ? Number.parseFloat(rgb[4]) / 100 : Number.parseFloat(rgb[4]);
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a: alpha };
  }
  const srgb = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/.exec(value);
  if (srgb) {
    const alpha = srgb[4] === undefined ? 1 : srgb[4].endsWith("%") ? Number.parseFloat(srgb[4]) / 100 : Number.parseFloat(srgb[4]);
    return { r: Number(srgb[1]) * 255, g: Number(srgb[2]) * 255, b: Number(srgb[3]) * 255, a: alpha };
  }
  if (value === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(value);
  if (hex) {
    const digits = hex[1] ?? "";
    const full = digits.length === 3 ? Array.from(digits, (digit) => digit + digit).join("") : digits;
    return { r: Number.parseInt(full.slice(0, 2), 16), g: Number.parseInt(full.slice(2, 4), 16), b: Number.parseInt(full.slice(4, 6), 16), a: full.length === 8 ? Number.parseInt(full.slice(6, 8), 16) / 255 : 1 };
  }
  throw new Error(`Unrecognized colour: ${text}`);
}

/** The colour a translucent `top` paints over an opaque `bottom`. */
export function composite(top: Rgba, bottom: Rgba): Rgba {
  const a = top.a + bottom.a * (1 - top.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = (t: number, b: number) => (t * top.a + b * bottom.a * (1 - top.a)) / a;
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a };
}

const channel = (value: number): number => {
  const unit = value / 255;
  return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
};

export const luminance = (color: Rgba): number => 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);

/** The contrast ratio of two opaque colours, 1 to 21. */
export function ratio(a: Rgba, b: Rgba): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** Two computed colours are the same colour to the eye: each channel within one step of 255. */
export const sameColor = (a: Rgba, b: Rgba): boolean => Math.abs(a.r - b.r) <= 1 && Math.abs(a.g - b.g) <= 1 && Math.abs(a.b - b.b) <= 1 && Math.abs(a.a - b.a) <= 0.01;

export const toHex = (color: Rgba): string => `#${[color.r, color.g, color.b].map((part) => Math.round(part).toString(16).padStart(2, "0")).join("")}`;

export const rounded = (value: number): number => Math.round(value * 100) / 100;
