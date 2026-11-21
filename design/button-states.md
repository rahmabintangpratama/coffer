# button-states.md

Computed from `tokens.json` (WCAG relative luminance, same code as `accessibility.md`). Design guidance and a source-level check, not an audit of a running app. Results are shown for three layers: surface, elevated and inverse.

## State rules

1. Every state change (rest, hover, active) is at least 1.15:1 between fills. Never use opacity alone.
2. Focus is always a separate 2px `border.focus` ring with a 2px offset. It is never a fill change. On the inverse layer the ring is `inverse.accent`.
3. Disabled uses `text.disabled` on `bg.hover`, with no hover and no pressed state.
4. Hover styles apply only under `@media (hover: hover)`. Touch devices get the pressed state only.
5. Chips, cards and selected rows use a state layer: paint `color.state.hover-overlay` or `color.state.pressed-overlay` over the fill.
6. Selected rows: `bg.selected` + filled checkbox + 2px `accent.default` edge indicator. Selection never relies on color alone.
7. Declare the `--cf-btn-*` block under `:root, [data-theme="dark"]`, and again inside `[data-surface="elevated"]` and `[data-surface="inverse"]` (light and dark), because custom properties resolved at `:root` do not pick up the scope's overrides.
8. Never place a dialog on `gray.800` in dark. Elevated layers use `bg.elevated` (light `gray.0`, dark `gray.850`).

## Elevated scope

Set `data-surface="elevated"` on Dialog, Sheet, Popover, ContextMenu, NewMenu, FolderMenu, CommandPalette, the DetailsPanel overlay and the ConnectionSwitcher popover. It overrides these variables (light | dark):

| Variable | Light | Dark |
|---|---|---|
| bg.hover | gray.150 | #3E3C39 |
| bg.active | gray.300 | #4A4844 |
| border.strong | gray.450 | gray.450 |
| accent.subtle | #D9E8EE | #34494E |
| accent.subtle-hover | #C5DAE2 | #47595E |
| accent.subtle-active | #B1CCD6 | #56676A |
| accent.text | teal.700 | teal.200 |
| danger.subtle | #F8E0DC | #5E3D38 |
| danger.subtle-hover | #F1CEC8 | #6D4F4A |
| danger.subtle-active | #E8BCB4 | #785D58 |
| danger.text | red.700 | red.200 |
| danger.border | #C4574D | #C2554B |
| accent.border | teal.500 | teal.400 |
| state.hover-overlay | rgba(23, 22, 20, 0.08) | rgba(239, 237, 233, 0.10) |
| state.pressed-overlay | rgba(23, 22, 20, 0.14) | rgba(239, 237, 233, 0.16) |

Primary and danger filled buttons keep their colors on this layer.

## Overlay button rules

- Dialog footer: one filled main action (primary, or danger when destructive) and one secondary (bordered) Cancel. Never ghost or tonal as the main action.
- Destructive confirms use filled danger and are disabled until the typed count is complete: `text.disabled` on `bg.hover`, no hover.
- Mobile bottom sheets: stacked, full width, main action on top, 48 px.
- Menu items use `bg.hover` and `bg.active`. Destructive items use `danger.text` with a `danger.subtle` hover.
- Toast Undo: `inverse.accent` text with an `inverse.hover` fill on hover.
- Focus: 2px `border.focus` ring, 2px offset. Hover only under `@media (hover: hover)`.

## Button tokens (`component.button.*` / `--cf-btn-*`, surface layer)

| Variant | State | Background | Label | Border |
|---|---|---|---|---|
| primary | rest | `accent.default` | `text.on-accent` | none |
| primary | hover | `accent.hover` | `text.on-accent` | none |
| primary | active | `accent.active` | `text.on-accent` | none |
| secondary | rest | `bg.surface` | `text.default` | `border.strong` |
| secondary | hover | `bg.hover` | `text.default` | `border.strong` |
| secondary | active | `bg.active` | `text.default` | `border.strong` |
| tonal | rest | `accent.subtle` | `accent.text` | none |
| tonal | hover | `accent.subtle-hover` | `accent.text` | none |
| tonal | active | `accent.subtle-active` | `accent.text` (dark: `text.default`) | none |
| ghost | rest | `transparent` | `text.default` | none |
| ghost | hover | `bg.hover` | `text.default` | none |
| ghost | active | `bg.active` | `text.default` | none |
| danger | rest | `danger.default` | `text.on-danger` | none |
| danger | hover | `danger.hover` | `text.on-danger` | none |
| danger | active | `danger.active` | `text.on-danger` | none |
| danger-tonal | rest | `danger.subtle` | `danger.text` | `danger.border` |
| danger-tonal | hover | `danger.subtle-hover` | `danger.text` (dark: `text.default`) | `danger.border` |
| danger-tonal | active | `danger.subtle-active` | `danger.text` (dark: `text.default`) | `danger.border` |
| inverse | rest | `transparent` | `inverse.accent` | none |
| inverse | hover | `inverse.hover` | `inverse.accent` | none |
| inverse | active | `inverse.border` | `inverse.accent` | none |

CSS names: `--cf-btn-{variant}-bg`, `-bg-hover`, `-bg-active`, `-fg`, `-fg-hover`, `-fg-active`, `-border`; plus `--cf-btn-disabled-bg`, `--cf-btn-disabled-fg`, `--cf-btn-focus-ring`, `--cf-btn-focus-offset`.

## Deviations to know about

- In dark, tonal active and danger-tonal hover and active labels use `text.default` instead of `accent.text` or `danger.text`, because the specified fills leave those labels under 4.5:1.
- Elevated light values changed slightly so every target passes: `accent.subtle` `#D9E8EE` (asked `#D6E6EC`), `accent.subtle-hover` `#C5DAE2` (asked `#C4D9E1`), `danger.subtle` `#F8E0DC` (asked `#F8E1DD`).
- The toast focus ring uses `inverse.accent`, since `border.focus` does not reach 3:1 on `inverse.bg` in both themes.
- Menu item focus is an inset 2px ring so it is not clipped by the menu edge.

## Surface (`bg.surface`)

### Acceptance

| Target | Theme | Worst case | Needs | Result | Where |
|---|---|---|---|---|---|
| Label on its own fill | light | 4.70 | 4.5 | PASS | tonal active |
| Secondary and danger-tonal border vs layer | light | 3.25 | 3.0 | PASS | secondary rest |
| Tonal fill vs layer | light | 1.14 | 1.25 | FAIL | danger-tonal |
| Every rest/hover/active step | light | 1.15 | 1.15 | PASS | tonal active |
| Hover fill vs layer | light | 1.26 | 1.15 | PASS | secondary |
| Disabled label vs disabled fill | light | 3.86 | 3.0 | PASS | disabled |
| Disabled fill vs layer | light | 1.26 | 1.15 | PASS | disabled |
| Focus ring vs layer | light | 6.00 | 3.0 | PASS | border.focus |
| Label on its own fill | dark | 4.80 | 4.5 | PASS | danger-tonal rest |
| Secondary and danger-tonal border vs layer | dark | 3.32 | 3.0 | PASS | secondary rest |
| Tonal fill vs layer | dark | 1.40 | 1.25 | PASS | tonal |
| Every rest/hover/active step | dark | 1.18 | 1.15 | PASS | danger active |
| Hover fill vs layer | dark | 1.26 | 1.15 | PASS | secondary |
| Disabled label vs disabled fill | dark | 3.93 | 3.0 | PASS | disabled |
| Disabled fill vs layer | dark | 1.26 | 1.15 | PASS | disabled |
| Focus ring vs layer | dark | 7.32 | 3.0 | PASS | border.focus |

### Every variant and state

Columns: label on its own fill (needs 4.5), step from the previous state (needs 1.15), border vs layer (needs 3.0), fill vs layer. "-" means not applicable.

| Variant | State | Light label | Light step | Light border | Light fill/layer | Dark label | Dark step | Dark border | Dark fill/layer |
|---|---|---|---|---|---|---|---|---|---|
| primary | rest | 6.00 | - | - | 6.00 | 7.00 | - | - | 7.32 |
| primary | hover | 7.67 | 1.28 | - | 7.67 | 9.52 | 1.36 | - | 9.95 |
| primary | active | 9.97 | 1.30 | - | 9.97 | 12.14 | 1.28 | - | 12.70 |
| secondary | rest | 18.08 | - | 3.25 | 1.00 | 13.77 | - | 3.32 | 1.00 |
| secondary | hover | 14.39 | 1.26 | 3.25 | 1.26 | 10.94 | 1.26 | 3.32 | 1.26 |
| secondary | active | 10.64 | 1.35 | 3.25 | 1.70 | 7.92 | 1.38 | 3.32 | 1.74 |
| tonal | rest | 6.46 | - | - | 1.19 | 7.10 | - | - | 1.40 |
| tonal | hover | 5.42 | 1.19 | - | 1.42 | 5.42 | 1.31 | - | 1.84 |
| tonal | active | 4.70 | 1.15 | - | 1.63 | 5.97 | 1.26 | - | 2.30 |
| ghost | rest | 18.08 | - | - | 1.00 | 13.77 | - | - | 1.00 |
| ghost | hover | 14.39 | 1.26 | - | 1.26 | 10.94 | 1.26 | - | 1.26 |
| ghost | active | 10.64 | 1.35 | - | 1.70 | 7.92 | 1.38 | - | 1.74 |
| danger | rest | 6.62 | - | - | 6.62 | 7.90 | - | - | 6.74 |
| danger | hover | 8.50 | 1.28 | - | 8.50 | 11.11 | 1.41 | - | 9.48 |
| danger | active | 10.01 | 1.18 | - | 10.01 | 13.09 | 1.18 | - | 11.18 |
| danger-tonal | rest | 7.46 | - | 4.36 | 1.14 | 4.80 | - | 3.60 | 1.40 |
| danger-tonal | hover | 6.22 | 1.20 | 4.36 | 1.37 | 8.16 | 1.20 | 3.60 | 1.69 |
| danger-tonal | active | 5.26 | 1.18 | 4.36 | 1.62 | 6.80 | 1.20 | 3.60 | 2.02 |

## Elevated (`bg.elevated`: dialogs, sheets, popovers, menus, palette, details overlay, connection switcher)

### Acceptance

| Target | Theme | Worst case | Needs | Result | Where |
|---|---|---|---|---|---|
| Label on its own fill | light | 4.56 | 4.5 | PASS | tonal active |
| Secondary and danger-tonal border vs layer | light | 3.25 | 3.0 | PASS | secondary rest |
| Tonal fill vs layer | light | 1.26 | 1.25 | PASS | tonal |
| Every rest/hover/active step | light | 1.15 | 1.15 | PASS | tonal hover |
| Hover fill vs layer | light | 1.26 | 1.15 | PASS | secondary |
| Disabled label vs disabled fill | light | 3.86 | 3.0 | PASS | disabled |
| Disabled fill vs layer | light | 1.26 | 1.15 | PASS | disabled |
| Focus ring vs layer | light | 6.00 | 3.0 | PASS | border.focus |
| Label on its own fill | dark | 4.54 | 4.5 | PASS | tonal hover |
| Secondary and danger-tonal border vs layer | dark | 3.29 | 3.0 | PASS | danger-tonal rest |
| Tonal fill vs layer | dark | 1.54 | 1.25 | PASS | danger-tonal |
| Every rest/hover/active step | dark | 1.18 | 1.15 | PASS | danger active |
| Hover fill vs layer | dark | 1.34 | 1.15 | PASS | secondary |
| Disabled label vs disabled fill | dark | 3.38 | 3.0 | PASS | disabled |
| Disabled fill vs layer | dark | 1.34 | 1.15 | PASS | disabled |
| Focus ring vs layer | dark | 6.68 | 3.0 | PASS | border.focus |

### Every variant and state

Columns: label on its own fill (needs 4.5), step from the previous state (needs 1.15), border vs layer (needs 3.0), fill vs layer. "-" means not applicable.

| Variant | State | Light label | Light step | Light border | Light fill/layer | Dark label | Dark step | Dark border | Dark fill/layer |
|---|---|---|---|---|---|---|---|---|---|
| primary | rest | 6.00 | - | - | 6.00 | 7.00 | - | - | 6.68 |
| primary | hover | 7.67 | 1.28 | - | 7.67 | 9.52 | 1.36 | - | 9.09 |
| primary | active | 9.97 | 1.30 | - | 9.97 | 12.14 | 1.28 | - | 11.59 |
| secondary | rest | 18.08 | - | 3.25 | 1.00 | 12.57 | - | 4.52 | 1.00 |
| secondary | hover | 14.39 | 1.26 | 3.25 | 1.26 | 9.40 | 1.34 | 4.52 | 1.34 |
| secondary | active | 10.64 | 1.35 | 3.25 | 1.70 | 7.80 | 1.20 | 4.52 | 1.61 |
| tonal | rest | 6.11 | - | - | 1.26 | 5.88 | - | - | 1.55 |
| tonal | hover | 5.30 | 1.15 | - | 1.45 | 4.54 | 1.29 | - | 2.00 |
| tonal | active | 4.56 | 1.16 | - | 1.68 | 5.07 | 1.24 | - | 2.48 |
| ghost | rest | 18.08 | - | - | 1.00 | 12.57 | - | - | 1.00 |
| ghost | hover | 14.39 | 1.26 | - | 1.26 | 9.40 | 1.34 | - | 1.34 |
| ghost | active | 10.64 | 1.35 | - | 1.70 | 7.80 | 1.20 | - | 1.61 |
| danger | rest | 6.62 | - | - | 6.62 | 7.90 | - | - | 6.15 |
| danger | hover | 8.50 | 1.28 | - | 8.50 | 11.11 | 1.41 | - | 8.66 |
| danger | active | 10.01 | 1.18 | - | 10.01 | 13.09 | 1.18 | - | 10.20 |
| danger-tonal | rest | 6.76 | - | 4.36 | 1.26 | 5.62 | - | 3.29 | 1.54 |
| danger-tonal | hover | 5.83 | 1.16 | 4.36 | 1.46 | 6.26 | 1.30 | 3.29 | 2.01 |
| danger-tonal | active | 4.97 | 1.17 | 4.36 | 1.71 | 5.12 | 1.22 | 3.29 | 2.45 |

## Inverse (toast on `inverse.bg`)

### Acceptance

| Target | Theme | Worst case | Needs | Result | Where |
|---|---|---|---|---|---|
| Label on its own fill | light | 5.72 | 4.5 | PASS | inverse active |
| Every rest/hover/active step | light | 1.23 | 1.15 | PASS | inverse hover |
| Hover fill vs layer | light | 1.23 | 1.15 | PASS | inverse |
| Focus ring vs layer | light | 11.18 | 3.0 | PASS | border.focus (inverse.accent) |
| Label on its own fill | dark | 4.52 | 4.5 | PASS | inverse active |
| Every rest/hover/active step | dark | 1.18 | 1.15 | PASS | inverse hover |
| Hover fill vs layer | dark | 1.18 | 1.15 | PASS | inverse |
| Focus ring vs layer | dark | 6.56 | 3.0 | PASS | border.focus (inverse.accent) |

### Every variant and state

Columns: label on its own fill (needs 4.5), step from the previous state (needs 1.15), border vs layer (needs 3.0), fill vs layer. "-" means not applicable.

| Variant | State | Light label | Light step | Light border | Light fill/layer | Dark label | Dark step | Dark border | Dark fill/layer |
|---|---|---|---|---|---|---|---|---|---|
| inverse | rest | 11.18 | - | - | 1.00 | 6.56 | - | - | 1.00 |
| inverse | hover | 9.09 | 1.23 | - | 1.23 | 5.56 | 1.18 | - | 1.18 |
| inverse | active | 5.72 | 1.59 | - | 1.95 | 4.52 | 1.23 | - | 1.45 |

## Menu items on `bg.elevated`

| Item state | Theme | Label on fill | Fill vs layer | Result |
|---|---|---|---|---|
| item hover | light | 14.39 | 1.26 | PASS |
| item pressed | light | 10.64 | 1.70 | PASS |
| destructive hover | light | 6.76 | 1.26 | PASS |
| destructive pressed | light | 5.83 | 1.46 | PASS |
| item hover | dark | 9.40 | 1.34 | PASS |
| item pressed | dark | 7.80 | 1.61 | PASS |
| destructive hover | dark | 5.62 | 1.54 | PASS |
| destructive pressed | dark | 6.26 | 2.01 | PASS |

## Rows

| Pair | Theme | Ratio | Needs | Result |
|---|---|---|---|---|
| row hover vs surface | light | 1.26 | 1.2 | pass |
| selected vs hover | light | 1.14 | 1.1 | pass |
| selected vs surface | light | 1.43 | 1.1 | pass |
| selected-hover vs selected | light | 1.17 | 1.1 | pass |
| row hover vs surface | dark | 1.26 | 1.2 | pass |
| selected vs hover | dark | 1.28 | 1.1 | pass |
| selected vs surface | dark | 1.61 | 1.1 | pass |
| selected-hover vs selected | dark | 1.30 | 1.1 | pass |
