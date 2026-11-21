# src/components/

Shared UI: shadcn/Radix base components restyled with tokens. Rules from [../AGENTS.md](../AGENTS.md) and [../../AGENTS.md](../../AGENTS.md) apply.

- Component names match `design/components.md` (`Button`, `Dialog`, `FileRow`, `Toast`, ...). Primitives the design does not draw (`Sheet`, `Popover`, `Input`, `Checkbox`, `Progress`, `Tooltip`, `Skeleton`, `Tabs`) follow [technical-spec](../../docs/technical-spec.md) section 12.
- Style with tokens only. No hex, rgb, px color or size literals; no arbitrary Tailwind values for color.
- Components do not import `features/`, `lib/s3` or `lib/storage`. They take props and render.
- Set `data-surface="elevated"` on the root of Dialog, Sheet, Popover, ContextMenu, NewMenu, FolderMenu, CommandPalette, the DetailsPanel overlay and the ConnectionSwitcher popover; use `bg-elevated`. Toast uses `data-surface="inverse"`.
- Button: variants `primary`, `secondary`, `tonal`, `ghost`, `danger`, `danger-tonal`, `link`; sizes `sm` 32, `md` 40, `lg` 48; `iconOnly` requires `aria-label`; `loading` sets `aria-busy` and keeps the label. Use `btn-*` utilities from `design/tailwind.css`.
- State rules ([design/button-states.md](../../design/button-states.md)): hover only under `@media (hover: hover)`; focus is a 2 px `border.focus` ring with 2 px offset, never a fill change; disabled is `text.disabled` on `bg.hover`; never opacity alone.
- Dialog footer: one filled main action plus one bordered Cancel. Destructive confirms use filled danger, disabled until the typed count matches.
- Accessibility: native elements first, Radix for focus trap and roles, visible labels, 44 px targets on mobile, `aria-live` for status, no color-only meaning.
- Every new component ships with states covered, a keyboard test and an axe check.
