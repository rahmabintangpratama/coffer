import { COLOR_ALIASES, BUTTON_VARIANTS, ELEVATED_ORDER } from "./aliases.ts";
import {
  btnComment,
  elevatedComment,
  inverseComment,
  layoutStatic,
  shadcn,
  tailwindHead,
  tokensHead,
  utilities,
} from "./templates.ts";

export interface TokenLeaf {
  $type?: string;
  $value: unknown;
  $extensions?: Record<string, unknown>;
}
export type TokenTree = Record<string, unknown>;
export interface GeneratedCss {
  tokensCss: string;
  tailwindCss: string;
}

type Theme = "light" | "dark";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isLeaf = (value: unknown): value is TokenLeaf => isRecord(value) && "$value" in value;

const NUMERIC_STEP = /^\d+(-\d+)?$/;
const stepValue = (key: string) => Number.parseFloat(key.replace("-", "."));

/**
 * Entries of a group in file order, skipping `$description` and similar metadata.
 * JavaScript puts integer-like keys first, which would scramble scales such as
 * `0, 0-5, 1, 1-5`; a group made only of numeric steps is therefore ordered by
 * value (`0-5` means 0.5), which is also the order used in tokens.json.
 */
function children(node: unknown): [string, unknown][] {
  if (!isRecord(node)) return [];
  const entries = Object.entries(node).filter(([key]) => !key.startsWith("$"));
  return entries.length > 0 && entries.every(([key]) => NUMERIC_STEP.test(key))
    ? entries.sort(([a], [b]) => stepValue(a) - stepValue(b))
    : entries;
}

function walk(node: unknown, path: string[] = []): { path: string[]; leaf: TokenLeaf }[] {
  if (isLeaf(node)) return [{ path, leaf: node }];
  return children(node).flatMap(([key, child]) => walk(child, [...path, key]));
}

function lookup(tokens: TokenTree, dotted: string): TokenLeaf {
  let node: unknown = tokens;
  for (const part of dotted.split(".")) {
    node = isRecord(node) ? node[part] : undefined;
  }
  if (!isLeaf(node)) {
    throw new Error(`Unknown token reference: ${dotted}`);
  }
  return node;
}

/** CSS custom property name of the token at `path` (the output naming rules). */
function varName(path: string[]): string {
  const [head, ...rest] = path;
  if (head === "primitive") return `--cf-${rest.join("-")}`;
  if (head === "font" && rest[0] === "family") return `--cf-font-${rest.slice(1).join("-")}`;
  return `--cf-${path.join("-")}`;
}

/** Resolve a token value to CSS. `{a.b}` becomes `var(--cf-…)` and is checked to exist. */
function css(tokens: TokenTree, value: unknown): string {
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return `cubic-bezier(${value.join(", ")})`;
  if (typeof value !== "string") {
    throw new Error(`Unsupported token value: ${JSON.stringify(value)}`);
  }
  const match = /^\{([^}]+)\}$/.exec(value);
  if (!match?.[1]) return value;
  lookup(tokens, match[1]);
  return `var(${varName(match[1].split("."))})`;
}

function extension(leaf: TokenLeaf, name: string): unknown {
  return leaf.$extensions?.[name];
}

const decl = (name: string, value: string) => `  ${name}: ${value};`;

// ---------------------------------------------------------------- tokens.css

function rootDeclarations(tokens: TokenTree): string[] {
  const lines: string[] = [];
  const emit = (path: string[], leaf: TokenLeaf) =>
    lines.push(decl(varName(path), css(tokens, leaf.$value)));

  for (const { path, leaf } of walk(tokens.primitive, ["primitive"])) emit(path, leaf);
  for (const { path, leaf } of walk(tokens.color, ["color"])) emit(path, leaf);

  const font = tokens.font;
  for (const { path, leaf } of walk(isRecord(font) ? font.family : undefined, ["font", "family"])) {
    emit(path, leaf);
  }
  // Type scale: one size and one line height per step, in typography order.
  for (const [step] of children(tokens.typography)) {
    lines.push(decl(`--cf-font-size-${step}`, css(tokens, lookup(tokens, `font.size.${step}`).$value)));
    lines.push(
      decl(`--cf-line-height-${step}`, css(tokens, lookup(tokens, `font.line-height.${step}`).$value)),
    );
  }
  for (const { path, leaf } of walk(isRecord(font) ? font.weight : undefined, ["font", "weight"])) {
    emit(path, leaf);
  }
  for (const group of ["space", "radius", "border", "shadow", "motion", "z", "size"]) {
    for (const { path, leaf } of walk(tokens[group], [group])) emit(path, leaf);
  }
  lines.push(decl("color-scheme", "light"));
  return lines;
}

function darkDeclarations(tokens: TokenTree): string[] {
  const lines: string[] = [];
  for (const { path, leaf } of walk(tokens.color, ["color"])) {
    const dark = extension(leaf, "coffer.dark");
    if (dark !== undefined) lines.push(decl(varName(path), css(tokens, dark)));
  }
  for (const { path, leaf } of walk(tokens.shadow, ["shadow"])) {
    const dark = extension(leaf, "coffer.dark");
    if (dark !== undefined) lines.push(decl(varName(path), css(tokens, dark)));
  }
  lines.push(decl("color-scheme", "dark"));
  return lines;
}

function buttonLeaf(tokens: TokenTree, variant: string, state: string, part: string): TokenLeaf {
  return lookup(tokens, `component.button.${variant}.${state}.${part}`);
}

/** The full `--cf-btn-*` block. Repeated in every scope so references resolve against that scope. */
function buttonDeclarations(tokens: TokenTree): string[] {
  const lines: string[] = [];
  for (const variant of BUTTON_VARIANTS) {
    const prop = (state: string, part: string) => css(tokens, buttonLeaf(tokens, variant, state, part).$value);
    lines.push(decl(`--cf-btn-${variant}-bg`, prop("rest", "background")));
    lines.push(decl(`--cf-btn-${variant}-fg`, prop("rest", "label")));
    lines.push(decl(`--cf-btn-${variant}-bg-hover`, prop("hover", "background")));
    lines.push(decl(`--cf-btn-${variant}-fg-hover`, prop("hover", "label")));
    lines.push(decl(`--cf-btn-${variant}-bg-active`, prop("active", "background")));
    lines.push(decl(`--cf-btn-${variant}-fg-active`, prop("active", "label")));
    const border = buttonLeaf(tokens, variant, "rest", "border").$value;
    lines.push(decl(`--cf-btn-${variant}-border`, border === "none" ? "transparent" : css(tokens, border)));
  }
  const disabled = (part: string) => css(tokens, lookup(tokens, `component.button.disabled.${part}`).$value);
  lines.push(decl("--cf-btn-disabled-bg", disabled("background")));
  lines.push(decl("--cf-btn-disabled-fg", disabled("label")));
  const focus = (part: string) => lookup(tokens, `component.button.focus.${part}`).$value;
  lines.push(
    decl("--cf-btn-focus-ring", `${css(tokens, focus("width"))} solid ${css(tokens, focus("ring"))}`),
  );
  lines.push(decl("--cf-btn-focus-offset", css(tokens, focus("offset"))));
  return lines;
}

/** Dark-theme label overrides declared on the button tokens themselves. */
function darkButtonOverrides(tokens: TokenTree): string[] {
  const lines: string[] = [];
  for (const variant of BUTTON_VARIANTS) {
    for (const state of ["rest", "hover", "active"]) {
      const leaf = buttonLeaf(tokens, variant, state, "label");
      const dark = extension(leaf, "coffer.dark");
      if (dark === undefined) continue;
      const suffix = state === "rest" ? "fg" : `fg-${state}`;
      lines.push(decl(`--cf-btn-${variant}-${suffix}`, css(tokens, dark)));
    }
  }
  return lines;
}

function elevatedDeclarations(tokens: TokenTree, theme: Theme): string[] {
  return ELEVATED_ORDER.map((dotted) => {
    const leaf = lookup(tokens, `color.${dotted}`);
    const scope = extension(leaf, "coffer.elevated");
    if (!isRecord(scope) || scope[theme] === undefined) {
      throw new Error(`color.${dotted} has no coffer.elevated.${theme} value`);
    }
    return decl(varName(["color", ...dotted.split(".")]), css(tokens, scope[theme]));
  });
}

function inverseFocus(tokens: TokenTree): string {
  const leaf = lookup(tokens, "color.border.focus");
  const scope = extension(leaf, "coffer.inverse");
  if (!isRecord(scope) || scope.light === undefined) {
    throw new Error("color.border.focus has no coffer.inverse value");
  }
  return decl("--cf-color-border-focus", css(tokens, scope.light));
}

function breakpointPx(tokens: TokenTree, name: string): string {
  const value = lookup(tokens, `breakpoint.${name}`).$value;
  if (typeof value !== "string") throw new Error(`breakpoint.${name} must be a string`);
  return value;
}

function atBreakpointRule(tokens: TokenTree): string[] {
  const sizes = ["font.size.base", "font.line-height.base"].map((dotted) => {
    const leaf = lookup(tokens, dotted);
    const at = extension(leaf, "coffer.atBreakpoint");
    const value = isRecord(at) ? at.lg : undefined;
    if (typeof value !== "string") throw new Error(`${dotted} has no coffer.atBreakpoint.lg value`);
    const step = dotted.startsWith("font.size") ? "--cf-font-size-base" : "--cf-line-height-base";
    return `${step}: ${value};`;
  });
  return [
    `@container cf-app (min-width: ${breakpointPx(tokens, "lg")}) {`,
    `  .cf-app { ${sizes.join(" ")} }`,
    "}",
  ];
}

function tokensCss(tokens: TokenTree): string {
  const block = (selector: string, lines: string[]) => [`${selector} {`, ...lines, "}"].join("\n");
  const buttons = buttonDeclarations(tokens);
  const darkButtons = darkButtonOverrides(tokens);
  const durations = children(lookup2(tokens, "motion.duration")).map(([name]) => name);
  const reducedMotion = [
    "@media (prefers-reduced-motion: reduce) {",
    `  :root { ${durations.map((name) => `--cf-motion-duration-${name}: 0ms;`).join(" ")} }`,
    "}",
  ].join("\n");
  const breakpoints = children(tokens.breakpoint)
    .map(([name]) => `${name} ${breakpointPx(tokens, name)}`)
    .join(", ");

  const parts = [
    tokensHead.trimEnd(),
    block(":root", rootDeclarations(tokens)),
    layoutStatic.trimEnd(),
    atBreakpointRule(tokens).join("\n"),
    block('[data-theme="dark"]', darkDeclarations(tokens)),
    btnComment.trimEnd(),
    block(":root, [data-theme=\"dark\"]", buttons),
    block('[data-theme="dark"]', darkButtons),
    elevatedComment.trimEnd(),
    block('[data-surface="elevated"]', [
      ...elevatedDeclarations(tokens, "light"),
      ...buttons,
      decl("--cf-btn-secondary-bg", "var(--cf-color-bg-elevated)") +
        " /* rest fill = the layer it sits on */",
    ]),
    block('[data-theme="dark"] [data-surface="elevated"], [data-theme="dark"][data-surface="elevated"]', [
      ...elevatedDeclarations(tokens, "dark"),
      ...buttons,
      decl("--cf-btn-secondary-bg", "var(--cf-color-bg-elevated)"),
      ...darkButtons,
    ]),
    inverseComment.trimEnd(),
    block('[data-surface="inverse"]', [inverseFocus(tokens), ...buttons]),
    reducedMotion,
    `/* Container breakpoints (use with @container cf-app): ${breakpoints} */`,
  ];
  return `${parts.join("\n")}\n`;
}

function lookup2(tokens: TokenTree, dotted: string): unknown {
  let node: unknown = tokens;
  for (const part of dotted.split(".")) node = isRecord(node) ? node[part] : undefined;
  if (node === undefined) throw new Error(`Unknown token group: ${dotted}`);
  return node;
}

// -------------------------------------------------------------- tailwind.css

function remFromPx(px: string): string {
  const value = Number.parseFloat(px) / 16;
  return `${value}rem`;
}

function tailwindTheme(tokens: TokenTree): string {
  const lines: string[] = [];
  for (const [alias, path] of COLOR_ALIASES) {
    lookup(tokens, `color.${path}`);
    lines.push(decl(`--color-${alias}`, `var(--cf-color-${path.replaceAll(".", "-")})`));
  }
  for (const [name] of children(lookup2(tokens, "font.family"))) {
    lines.push(decl(`--font-${name}`, `var(--cf-font-${name})`));
  }
  for (const [step] of children(tokens.typography)) {
    lines.push(decl(`--text-${step}`, `var(--cf-font-size-${step})`));
    lines.push(decl(`--text-${step}--line-height`, `var(--cf-line-height-${step})`));
  }
  for (const [name] of children(tokens.radius)) {
    lines.push(decl(`--radius-${name}`, `var(--cf-radius-${name})`));
  }
  for (const [name] of children(tokens.shadow)) {
    lines.push(decl(`--shadow-${name}`, `var(--cf-shadow-${name})`));
  }
  for (const [name] of children(lookup2(tokens, "motion.easing"))) {
    lines.push(decl(`--ease-${name}`, `var(--cf-motion-easing-${name})`));
  }
  lines.push(decl("--spacing", String(lookup(tokens, "space.1").$value)));
  for (const name of ["md", "lg", "xl", "2xl"]) {
    const px = breakpointPx(tokens, name);
    lines.push(`${decl(`--container-${name}`, remFromPx(px))} /* ${px}: use @${name}: container variants */`);
  }
  lines.push(decl("--breakpoint-sm", breakpointPx(tokens, "sm")));
  return ["@theme inline {", ...lines, "}"].join("\n");
}

function buttonUtility(tokens: TokenTree, variant: string): string {
  const border = buttonLeaf(tokens, variant, "rest", "border").$value;
  const borderValue = border === "none" ? "transparent" : `var(--cf-btn-${variant}-border)`;
  const v = `--cf-btn-${variant}`;
  return [
    `@utility btn-${variant} {`,
    `  background-color: var(${v}-bg);`,
    `  color: var(${v}-fg);`,
    `  border: 1px solid ${borderValue};`,
    "  @media (hover: hover) {",
    `    &:hover:not(:disabled, [aria-disabled="true"]) { background-color: var(${v}-bg-hover); color: var(${v}-fg-hover); }`,
    "  }",
    `  &:active:not(:disabled, [aria-disabled="true"]) { background-color: var(${v}-bg-active); color: var(${v}-fg-active); }`,
    "  &:focus-visible { outline: var(--cf-btn-focus-ring); outline-offset: var(--cf-btn-focus-offset); }",
    '  &:disabled, &[aria-disabled="true"] { background-color: var(--cf-btn-disabled-bg); color: var(--cf-btn-disabled-fg); border-color: transparent; cursor: not-allowed; }',
    "}",
  ].join("\n");
}

function tailwindCss(tokens: TokenTree): string {
  const parts = [
    tailwindHead.trimEnd(),
    "",
    tailwindTheme(tokens),
    "",
    shadcn.trimEnd(),
    "",
    utilities.trimEnd(),
    "",
    BUTTON_VARIANTS.map((variant) => buttonUtility(tokens, variant)).join("\n\n"),
  ];
  return `${parts.join("\n")}\n`;
}

// -------------------------------------------------------------------- public

/** Generate `tokens.css` and `tailwind.css` from a parsed `tokens.json`. Deterministic. */
export function generate(tokens: TokenTree): GeneratedCss {
  return { tokensCss: tokensCss(tokens), tailwindCss: tailwindCss(tokens) };
}
