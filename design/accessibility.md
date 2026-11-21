# accessibility.md

Target: WCAG 2.2 AA. This is design guidance and a source-level check, not an audit of a running app.

## Contrast

`tokens.py` computes 72 foreground/background pairs across light and dark. 72 of 72 meet their threshold (4.5:1 for text, 3:1 for control borders and focus rings). The pairs are listed on the Color board. Re-run the same check on any change to `tokens.json`.

### Non-text pairs (surfaces and states)

20 of 20 non-text pairs meet their target. Fills that sit next to each other are only a hint (targets 1.05 to 1.10; hover vs subtle only has to differ); borders and control edges carry the 1.5:1 and 3:1 targets.

| Pair | Mode | Ratio | Target | Result | What it separates |
|---|---|---|---|---|---|
| bg.app / bg.surface | light | 1.17:1 | 1.1:1 | pass | app background vs content surface |
| bg.app / bg.surface | dark | 1.17:1 | 1.1:1 | pass | app background vs content surface |
| bg.surface / bg.hover | light | 1.26:1 | 1.05:1 | pass | surface vs hovered row |
| bg.surface / bg.hover | dark | 1.26:1 | 1.05:1 | pass | surface vs hovered row |
| bg.hover / bg.selected | light | 1.14:1 | 1.1:1 | pass | hovered row vs selected row |
| bg.hover / bg.selected | dark | 1.28:1 | 1.1:1 | pass | hovered row vs selected row |
| bg.surface / bg.selected | light | 1.43:1 | 1.1:1 | pass | surface vs selected row |
| bg.surface / bg.selected | dark | 1.61:1 | 1.1:1 | pass | surface vs selected row |
| bg.surface / bg.subtle | light | 1.09:1 | 1.05:1 | pass | surface vs chip and input fill |
| bg.surface / bg.subtle | dark | 1.10:1 | 1.05:1 | pass | surface vs chip and input fill |
| bg.hover / bg.subtle | light | 1.15:1 | 1.0:1 | pass | hover vs subtle fill (must not be identical) |
| bg.hover / bg.subtle | dark | 1.15:1 | 1.0:1 | pass | hover vs subtle fill (must not be identical) |
| border.default / bg.surface | light | 1.70:1 | 1.5:1 | pass | hairline border vs surface |
| border.default / bg.surface | dark | 1.74:1 | 1.5:1 | pass | hairline border vs surface |
| border.default / bg.app | light | 1.45:1 | 1.2:1 | pass | hairline border vs app background |
| border.default / bg.app | dark | 2.04:1 | 1.2:1 | pass | hairline border vs app background |
| border.strong / bg.surface | light | 3.25:1 | 3.0:1 | pass | control border vs surface |
| border.strong / bg.surface | dark | 3.32:1 | 3.0:1 | pass | control border vs surface |
| accent.default / bg.selected | light | 4.20:1 | 3.0:1 | pass | selection edge indicator vs selected row |
| accent.default / bg.selected | dark | 4.53:1 | 3.0:1 | pass | selection edge indicator vs selected row |

Buttons, row states, chips, menus and the toast are checked separately in `button-states.md` for three layers (surface, elevated, inverse) in both themes. Headline numbers there for the elevated layer: 3.38:1 lowest label on its own fill, 3.25:1 lowest border, 1.26:1 lowest tonal fill, 1.15:1 lowest state step. Row hover vs surface 1.26:1 light and 1.26:1 dark.

Color never carries meaning alone: statuses have an icon and text; file types have a shape and a tag (PDF, JPG, MP4…). Selected rows never rely on color alone: filled checkbox + 2px accent indicator on the leading edge.

## Touch and layout

- Targets are at least 44×44 px on mobile (`size.touch.min`). Icon buttons are 44 px; rows are 56 px.
- No horizontal scroll at 360 px. Layout uses container queries, `dvh` for full-height views and `env(safe-area-inset-*)` for the bottom nav, FAB and sheets.
- Body text is 15 px on mobile and 14 px from 1024 px. Text can be zoomed to 200% without loss.

## Keyboard

Every action has a keyboard path (see ux-patterns.md). Tab order follows the visual order: navigation, search, filters, list, panels. The list is a single tab stop with arrow-key movement. Dialogs trap focus, close with Esc and return focus to their trigger. Menus use arrow keys, Home/End and type-ahead.

## Screen readers

- Landmarks: navigation, search, main, complementary (details).
- Rows expose name, type, size and modified date; selection through aria-selected; ⋮ buttons name the file.
- Progress and test steps use `aria-live="polite"` with text statuses. Upload progress uses `role="progressbar"` with values.
- Toasts use `role="status"`; errors use `role="alert"`.
- Preview announces “Preview of {name}”, position “2 of 10”, and the safe-rendering notice for HTML and SVG.

## Motion

120–200 ms transitions. `prefers-reduced-motion` sets all durations to 0 and stops spinners and skeleton pulses. Sheets and dialogs still appear and disappear, without sliding.

## Forms

Every input has a visible label (never placeholder-only). Errors say what, why and what to do next, sit under the field and are linked with `aria-describedby`. Optional fields say “optional”. Secrets are masked and can be revealed only after the passphrase is entered.
