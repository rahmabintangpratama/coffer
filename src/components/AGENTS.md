# src/components/

Shared UI: shadcn/Radix base components restyled with tokens. Rules from [../AGENTS.md](../AGENTS.md) and [../../AGENTS.md](../../AGENTS.md) apply.

- Component names match `design/components.md` (`Button`, `Dialog`, `FileRow`, `Toast`, ...). Primitives the design does not draw (`Sheet`, `Popover`, `Input`, `Checkbox`, `Progress`, `Tooltip`, `Skeleton`, `Tabs`) follow [technical-spec](../../docs/technical-spec.md) section 12.
- Style with tokens only. No hex, rgb, px color or size literals; no arbitrary Tailwind values for color.
- Components do not import `features/`, `lib/s3` or `lib/storage`. They take props and render; visible text (including labels such as the close button's) comes in as props from `src/app` or a feature.
- Modal layers (`Dialog`, `Sheet`, the drawer) use the native `<dialog>` through `ModalSurface`. Do not add Radix Dialog: its scroll lock injects a `<style>` element, which the CSP (`style-src 'self'`) blocks. Check any other Radix primitive in a browser for CSP violations before using it (D-24).
- Radix under the CSP (D-25): menus and popovers are **non-modal** (`modal={false}`, hard-coded in the wrappers; lint enforces it and bans importing those packages outside this folder). Never use Radix `Dialog`, `AlertDialog`, `Select` or `ScrollArea` (they inject a `<style>`): use the native `<dialog>`, a native `<select>`, a popover plus listbox for combobox fields, and native scrolling. Mount portals inside `.cf-root` (`container` prop). Check any new Radix primitive in the CSP e2e test.
- Set `data-surface="elevated"` on the root of Dialog, Sheet, Popover, ContextMenu, NewMenu, FolderMenu, CommandPalette, the DetailsPanel overlay and the ConnectionSwitcher popover; use `bg-elevated`. Toast uses `data-surface="inverse"`.
- Button: variants `primary`, `secondary`, `tonal`, `ghost`, `danger`, `danger-tonal`, `link`; sizes `sm` 32, `md` 40, `lg` 48; `iconOnly` requires `aria-label`; `loading` sets `aria-busy` and keeps the label. Use `btn-*` utilities from `design/tailwind.css`.
- State rules ([design/button-states.md](../../design/button-states.md)): hover only under `@media (hover: hover)`; focus is a 2 px `border.focus` ring with 2 px offset, never a fill change; disabled is `text.disabled` on `bg.hover`; never opacity alone.
- Dialog footer: one filled main action plus one bordered Cancel. Destructive confirms use filled danger, disabled until the typed count matches.
- Accessibility: native elements first, Radix for focus trap and roles, visible labels, 44 px targets on mobile, `aria-live` for status, no color-only meaning.
- Every new component ships with states covered, a keyboard test and an axe check.
