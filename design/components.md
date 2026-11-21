# components.md

Every component below appears in the design as `data-component="Name"`. Names are the React component names. Layout is driven by container width, not viewport width: set `container-type: inline-size` on the app root and use `@container` rules with the breakpoints in `tokens.json` (`breakpoint.md` 768, `lg` 1024, `xl` 1280, `2xl` 1440). Mobile is the base.

Shared rules: touch targets are at least 44 px (`size.touch.min`) on mobile; controls are 40 px (`size.control.md`); floating layers use `shadow.overlay` or `shadow.dialog`; everything else has hairline borders only; motion is 120–200 ms (`motion.duration.*`) and drops to 0 with `prefers-reduced-motion`.

## AppBar

Top bar with search pill, menu button (mobile), info toggle and settings (768+), connection avatar (mobile).

| Width | Behavior |
|---|---|
| 375 | Menu · pill search · avatar. 64 px. |
| 768 | Pill search left, info toggle right. No menu button; navigation is the rail. |
| 1440 | Same, plus Settings icon and the `/` hint inside the pill. 64 px. |

Accessibility: role=search on the pill; avatar button has an accessible name with the connection.

## Banner

Inline notice: partial listing, interrupted operation, demo.

| Width | Behavior |
|---|---|
| 375 | Stacked actions. |
| 768 | Actions on the right. |
| 1440 | Same. |

Accessibility: role=status, or role=alert for errors.

## BottomNav

Bottom navigation below 768 px: Home, Starred, Files, More.

| Width | Behavior |
|---|---|
| 375 | 64 px plus safe-area inset. Replaced by selection actions while selecting. |
| 768 | Hidden. |
| 1440 | Hidden. |

Accessibility: Each tab is a link with a visible label. aria-current=page.

## Breadcrumb

Path with a menu on the current folder.

| Width | Behavior |
|---|---|
| 375 | Root › … › current ▾. Middle folders fold away. |
| 768 | Full path while it fits. |
| 1440 | Full path while it fits. |

Accessibility: nav aria-label “Folder path”. Current folder button has aria-haspopup=menu.

## Button

The one button component. Variants: primary, secondary, tonal, ghost, danger, danger-tonal (plus a text-style `link`). Sizes: sm 32, md 40, lg 48 px tall; `icon` makes it square; `block` fills the width. Use `btn-{variant}` plus `btn-sm|btn-lg`, or the Tailwind utilities `btn-primary` … `btn-danger-tonal`. Props: `variant`, `size`, `icon`, `trailingIcon`, `iconOnly` (then `aria-label` is required), `loading`, `disabled`, `block`, `type`. States: rest, hover (only under `@media (hover: hover)`), active, focus-visible (separate 2px `border.focus` ring, 2px offset), disabled (`text.disabled` on `bg.hover`, no hover, `aria-disabled` when it must stay focusable). Colors come from `--cf-btn-*` (see button-states.md); every state step is at least 1.15:1 and never uses opacity alone.

| Width | Behavior |
|---|---|
| 375 | Full-width and 48 px tall in sheets and stacked footers; icon buttons are 44 px. |
| 768 | 40 px, auto width; 32 px in toolbars. |
| 1440 | Same as 768. |

Accessibility: Native `<button>`. Disabled uses `disabled` or `aria-disabled`; `loading` sets `aria-busy` and keeps the label. Icon-only buttons need an accessible name. Danger actions are named by their effect, never “OK”. Layer: On overlays the button tokens are re-declared inside `[data-surface="elevated"]` (`--cf-btn-*`), so tonal, danger-tonal, secondary and ghost states keep their contrast on `bg.elevated`. Primary and danger filled keep their colors. Hover only under `@media (hover: hover)`. Focus is a 2px `border.focus` ring with a 2px offset.

## CoachTip

One of three dismissible tips anchored to real UI. Never a modal tour.

| Width | Behavior |
|---|---|
| 375 | Anchored above or below its target. |
| 768 | Same. |
| 1440 | Same. |

Accessibility: role=status. Dismiss is remembered.

## CommandPalette

⌘/Ctrl+K palette on desktop.

| Width | Behavior |
|---|---|
| 375 | Not shown. |
| 768 | Not shown. |
| 1440 | 600 px, top aligned. |

Accessibility: combobox pattern with a listbox. Layer: `data-surface="elevated"`, `bg.elevated`. Active option uses `bg.hover`.

## ConnectionSwitcher

Replaces the account avatar. Shows the active connection and lets people switch.

| Width | Behavior |
|---|---|
| 375 | Avatar in the app bar opens a sheet. |
| 768 | Avatar at the rail bottom opens a dialog. |
| 1440 | Block at the sidebar bottom opens a popover. |

Accessibility: Names include lock state. Layer: Popover and sheet use `data-surface="elevated"` and `bg.elevated`.

## ConnectionTest

Automatic progress list: Reach endpoint, Check CORS, List objects, Write a test file, Read it back, Clean up.

| Width | Behavior |
|---|---|
| 375 | Full width. |
| 768 | In the 560 px card. |
| 1440 | Same. |

Accessibility: aria-live polite. Each row has text status, not color alone.

## ContextMenu

Grouped menu: Preview/Open, Download, Rename, Make a copy, Share, Organize, Details, Move to trash.

| Width | Behavior |
|---|---|
| 375 | Bottom action sheet with a file header. |
| 768 | Popover at the pointer, with shortcut hints. |
| 1440 | Same as 768. |

Accessibility: role=menu. Opens on right-click, ⋮, Shift+F10 and the Menu key. Layer: Set `data-surface="elevated"` on the menu. Items use `bg.hover` and `bg.active` from the elevated scope. Destructive items use `danger.text` with a `danger.subtle` hover and `danger.subtle-hover` pressed. Focus is an inset 2px `border.focus` ring.

## DetailsPanel

File details: thumbnail, type, size, location, full key (mono, copyable), modified, ETag, content type.

| Width | Behavior |
|---|---|
| 375 | Bottom sheet with a drag handle. |
| 768 | Right panel overlay, 360 px. |
| 1440 | Right panel in the layout, 360 px, toggled by ⓘ. |

Accessibility: complementary landmark. Copy key confirms with a toast. Layer: Overlay below 1024 px (and the mobile sheet): `data-surface="elevated"`, `bg.elevated`. From 1024 px it is an in-layout panel on `bg.surface`.

## Dialog

Modal for rename, move, copy, share, delete, conflicts, save, paste.

| Width | Behavior |
|---|---|
| 375 | Bottom sheet with drag handle. Stacked full-width buttons when destructive. |
| 768 | Centered dialog, 480 px (640 for wide). |
| 1440 | Same. |

Accessibility: Focus trap, Esc closes, focus returns to the trigger. Primary action is the last button. Layer: Overlay layer: set `data-surface="elevated"` on the dialog and sheet root. Background `bg.elevated` with `shadow.dialog`; never `gray.800` in dark. Footer: exactly one filled main action (primary, or danger when destructive) plus one secondary (bordered) Cancel. Never ghost or tonal as the main action. Destructive confirms (Delete forever, Empty trash, Forget this device) use filled danger and are disabled (`text.disabled` on `bg.hover`, no hover) until the typed count matches. Mobile sheets stack full width, main action on top, 48 px.

## EndpointPreview

Read-only built endpoint with Edit.

| Width | Behavior |
|---|---|
| 375 | Wraps. |
| 768 | Same. |
| 1440 | Same. |

Accessibility: Output element with a label.

## FileList

Virtualized file list, folders first.

| Width | Behavior |
|---|---|
| 375 | Rows 56 px: icon, name over “date · size”, ⋮ (44 px). |
| 768 | Columns: Name, Last modified, File size, ⋮. Rows 48 px. |
| 1440 | Same columns. Optional details panel at the right. |

Accessibility: role=grid. Arrow keys move focus. Selection announced.

## FileRow

One file or folder row.

| Width | Behavior |
|---|---|
| 375 | Two-line name cell. Long press selects. |
| 768 | Click selects, double-click opens. ⋮ appears on hover and focus. |
| 1440 | Same as 768. Drag to move. |

Accessibility: aria-selected reflects selection. ⋮ has a name that includes the file name.

## FileTile

File card in grid view with thumbnail and type tag.

| Width | Behavior |
|---|---|
| 375 | 2 columns. |
| 768 | auto-fill, min 176 px. |
| 1440 | auto-fill, min 200 px. |

Accessibility: Thumbnail is decorative; name is the label.

## FilterChips

Type and Modified filter chips under the search.

| Width | Behavior |
|---|---|
| 375 | Horizontal row, 32 px chips. |
| 768 | Same. |
| 1440 | Same. |

Accessibility: Each chip is a button with aria-pressed when a value is set.

## FolderMenu

Menu for the current folder: New folder, Upload files, Rename, Move…, Download as .zip, Move to trash.

| Width | Behavior |
|---|---|
| 375 | Sheet-style panel. |
| 768 | Popover. |
| 1440 | Popover. |

Accessibility: role=menu. Layer: `data-surface="elevated"`, `bg.elevated`. Item states as ContextMenu.

## FolderTile

Compact folder chip in grid view.

| Width | Behavior |
|---|---|
| 375 | 2 columns, 48 px. |
| 768 | Same grid. |
| 1440 | Same grid. |

Accessibility: Same as FileTile.

## FolderTree

Destination picker for Move.

| Width | Behavior |
|---|---|
| 375 | In a sheet. |
| 768 | In a 640 px dialog. |
| 1440 | Same. |

Accessibility: role=tree. Current location is shown and disabled.

## HelpInline

“Where do I find these?” disclosure with 3–5 steps and the scoped-key advice.

| Width | Behavior |
|---|---|
| 375 | Collapsed by default. |
| 768 | Same. |
| 1440 | Same. |

Accessibility: details/summary.

## NavDrawer

Left drawer opened by the mobile menu button: Home, Files, Starred, Trash, Storage, Settings, connection switcher.

| Width | Behavior |
|---|---|
| 375 | Up to 320 px wide (86%), scrim, radius.lg on the free edge, focus trapped, closes on Esc, scrim tap or swipe left. |
| 768 | Not used: the rail replaces it. |
| 1440 | Not used: the sidebar replaces it. |

Accessibility: role=dialog, labelled “Main navigation”. Focus returns to the menu button.

## NavRail

Navigation rail at 768–1023 px with the New button at the top.

| Width | Behavior |
|---|---|
| 375 | Not shown. |
| 768 | 80 px wide. Icon over 12 px label. |
| 1440 | Hidden from 1024. |

Accessibility: Same landmark and names as the sidebar.

## NewMenu

Menu: New folder, Upload files, Upload folder.

| Width | Behavior |
|---|---|
| 375 | Bottom sheet style panel above the FAB. |
| 768 | Popover anchored to the New button. |
| 1440 | Popover anchored to the New button. |

Accessibility: role=menu, arrow keys, Esc closes and returns focus. Layer: `data-surface="elevated"`, `bg.elevated`. Item states as ContextMenu.

## NewMenuButton

The primary New control. Opens NewMenu.

| Width | Behavior |
|---|---|
| 375 | 56 px FAB, bottom right, above the bottom nav. |
| 768 | 56 px button at the top of the rail. |
| 1440 | Pill-shaped 56 px button with label at the top of the sidebar. |

Accessibility: aria-haspopup=menu. Label “New”.

## Preview

Full-screen dark viewer: back, name, Download, Share link, ⓘ, ⋮.

| Width | Behavior |
|---|---|
| 375 | Swipe for previous and next. Pinch to zoom. |
| 768 | Arrows on screen. Esc closes. |
| 1440 | Arrows, ← →, Esc. |

Accessibility: role=dialog. Next and previous announced as “2 of 10”.

## ProviderRow

Row in the provider list with glyph, name and warning badge.

| Width | Behavior |
|---|---|
| 375 | Single column, 64 px for popular, 56 px for the rest. |
| 768 | Two columns for popular. |
| 1440 | Same as 768. |

Accessibility: Button. Badge text is part of the accessible name.

## ReadOnlyBadge

“Read-only” chip in the app bar of a read-only connection.

| Width | Behavior |
|---|---|
| 375 | Right of the search pill; icon + text. |
| 768 | Same. |
| 1440 | Same. |

Accessibility: Has a title with the reason “This key is read-only”. Not color alone.

## ReadOnlyBanner

Info banner shown at the top of a read-only connection: reason and `Use another key`.

| Width | Behavior |
|---|---|
| 375 | Full width, stacked action. |
| 768 | Action on the right. |
| 1440 | Same. |

Accessibility: role=status.

## ReadOnlyOffer

Warning panel on the connection test when the write step is denied but list and read pass: `Connect read-only` or `Edit keys`.

| Width | Behavior |
|---|---|
| 375 | Full width; buttons stacked in the footer. |
| 768 | Same, inside the 560 px card. |
| 1440 | Same. |

Accessibility: Step list stays visible; failed step is named in text.

## SearchPill

Pill search field. Placeholder `Search in {bucket}`.

| Width | Behavior |
|---|---|
| 375 | Full width, 48 px tall, 16 px text. |
| 768 | Max 720 px. |
| 1440 | Max 720 px, 44 px tall, 14 px text. |

Accessibility: Label matches placeholder. `/` focuses it. Esc clears then blurs.

## SelectionBar

Toolbar that replaces the app bar while items are selected: ✕, count, Share link, Download, Move, Move to trash, ⋮.

| Width | Behavior |
|---|---|
| 375 | ✕, count, Move to trash, ⋮ at the top. The other actions are in the bottom action bar. |
| 768 | Pill bar with all actions. |
| 1440 | Pill bar with all actions. |

Accessibility: role=toolbar. ✕ clears. Count is live.

## SessionTokenNotice

Warning in the Share dialog when the connection uses a session token: the link stops working when the token expires. Longer expiry choices are disabled.

| Width | Behavior |
|---|---|
| 375 | In the sheet above the expiry choices. |
| 768 | In the dialog. |
| 1440 | Same. |

Accessibility: Disabled choices use aria-disabled and are not hidden, so the cap is explained.

## Sidebar

Primary navigation from 1024 px: + New, Home, Files, Starred, Trash, Storage, Settings, connection switcher.

| Width | Behavior |
|---|---|
| 375 | Not shown. |
| 768 | Not shown (rail instead). |
| 1440 | 256 px, collapsible. Active item uses accent.subtle. |

Accessibility: nav landmark. aria-current=page on the active item.

## Toast

Short status with optional Undo.

| Width | Behavior |
|---|---|
| 375 | Above the bottom nav. |
| 768 | Bottom left, 360 px. |
| 1440 | Same. |

Accessibility: role=status. Stays 8 s, longer when it has an action, and pauses on focus. Layer: Inverse layer: `data-surface="inverse"` on `inverse.bg`. Undo is `btn-inverse`: `inverse.accent` text, `inverse.hover` fill on hover, `inverse.border` on press. Focus ring is `inverse.accent`.

## TransferPanel

Collapsible panel for uploads and background moves.

| Width | Behavior |
|---|---|
| 375 | Full width above the bottom nav. |
| 768 | 360 px, bottom right. |
| 1440 | Same. |

Accessibility: Progress uses role=progressbar with text values. Failures offer Try again.

## ViewToggle

List and grid layout switch.

| Width | Behavior |
|---|---|
| 375 | Right of the sort button. |
| 768 | Right of the toolbar. |
| 1440 | Right of the toolbar. |

Accessibility: role=group, each button aria-pressed and labelled.
