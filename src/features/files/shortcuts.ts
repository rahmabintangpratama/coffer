import type { CopyKey } from "@/lib/i18n";

/** Shortcuts on the focused item or the selection (design ux-patterns "Keyboard", FR-26). */
export type ItemShortcut = "rename" | "move" | "star" | "details" | "trash";

const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

/** The modifier as the platform writes it: ⌘ on Apple devices, Ctrl elsewhere. */
export const MOD = mac ? "⌘" : "Ctrl+";

/** Which item shortcut a key press is, or null. Single keys only, without Ctrl, ⌘ or Alt (WCAG 2.1.4: active only with list focus). */
export function itemShortcutOf(event: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): ItemShortcut | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  switch (event.key) {
    case "F2":
    case "n":
    case "N": return "rename";
    case "m":
    case "M": return "move";
    case "s":
    case "S": return "star";
    case "i":
    case "I": return "details";
    case "Delete":
    case "Backspace": return "trash";
    default: return null;
  }
}

/** The hint a menu shows beside an action, and `aria-keyshortcuts` for it. */
export const hints = {
  open: { label: "Enter", aria: "Enter" },
  preview: { label: "Space", aria: "Space" },
  rename: { label: "F2", aria: "F2" },
  move: { label: "M", aria: "M" },
  star: { label: "S", aria: "S" },
  details: { label: "I", aria: "I" },
  trash: { label: mac ? "⌫" : "Del", aria: mac ? "Backspace" : "Delete" },
} as const;

export interface ShortcutRow {
  keys: string[];
  label: CopyKey;
}

/** The `?` sheet (S34_Shortcuts), in groups. */
export const SHORTCUT_GROUPS: { title: CopyKey; rows: ShortcutRow[] }[] = [
  {
    title: "kb.nav",
    rows: [
      { keys: ["↑", "↓", "←", "→"], label: "kb.moveFocus" },
      { keys: ["Home", "End"], label: "kb.firstLast" },
      { keys: ["Enter"], label: "kb.open" },
      { keys: ["Space"], label: "act.preview" },
      { keys: ["/", `${MOD}K`], label: "kb.search" },
    ],
  },
  {
    title: "kb.act",
    rows: [
      { keys: ["F2", "N"], label: "act.rename" },
      { keys: ["M"], label: "act.moveTo" },
      { keys: ["S"], label: "kb.star" },
      { keys: ["I"], label: "act.details" },
      { keys: [mac ? "⌫" : "Del"], label: "act.trash" },
    ],
  },
  {
    title: "kb.select",
    rows: [
      { keys: [`${MOD}A`], label: "kb.selectAll" },
      { keys: ["Shift+↑", "Shift+↓", "Shift+click"], label: "kb.range" },
      { keys: [`${MOD}click`, `${MOD}Space`], label: "kb.toggle" },
      { keys: ["Esc"], label: "kb.escape" },
    ],
  },
  { title: "kb.app", rows: [{ keys: ["?"], label: "kb.shortcuts" }] },
];
