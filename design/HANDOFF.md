# HANDOFF.md

Coffer is a browser-only file manager for S3-compatible object storage. It runs as a static site on Cloudflare Pages. There is no backend: the browser talks straight to the provider.

Dialogs, sheets, popovers, menus and the command palette sit on `bg.elevated` and set `data-surface="elevated"`; the scope re-declares hover, active, tonal and `--cf-btn-*` tokens for that layer (see button-states.md and tokens.css).

This package describes the v2 design: mobile-first, familiar to Google Drive users, and with a shorter path to a first connection. Read this file first.

## Files

| File | Purpose |
|---|---|
| tokens.json | Design tokens in W3C DTCG format, with mobile-first breakpoints and the 15 → 14 px base size change at 1024 |
| tokens.css | The same tokens as CSS variables, light and `[data-theme="dark"]` |
| tailwind.css | Tailwind v4 `@theme inline` mapping and shadcn-style variables |
| button-states.md | Computed contrast for every button variant and state on surface, elevated and inverse layers in both themes, the `data-surface="elevated"` scope, overlay button rules, rows, chips |
| components.md | 37 components with behavior at 375, 768 and 1440 |
| screens.md | Layout per width, board list, per-screen notes |
| ux-patterns.md | Drive → Coffer mapping, selection model, gestures, shortcuts, undo rules |
| copy.en.json | 396 UI strings (ICU plural syntax), keyed as used in the design |
| types.ts | Shared TypeScript types |
| providers.json | 21 provider presets with paste-detection hints |
| accessibility.md | Contrast, touch, keyboard, screen reader and motion rules |
| SECURITY-DESIGN.md | Trust boundaries, threats and UI mitigations, header proposal, local data inventory |

## Stack

React + TypeScript, Tailwind v4 with shadcn/ui (Radix), TanStack Virtual for lists, lucide icons (the design's icons are lucide-compatible, stroke 2 on a 24 px grid), AWS SDK v3 for S3, IndexedDB for upload state and the operation journal, Web Crypto (AES-GCM, PBKDF2) for the passphrase, IBM Plex Sans and Mono self-hosted.

## Layout rules

- Build mobile first. The base styles are the 375 layout.
- Switch layout with container queries on the app root (`container-type: inline-size`) at 768 and 1024. Below 768: bottom nav and FAB. 768–1023: navigation rail. 1024 and up: sidebar.
- Overlays are bottom sheets below 768 and dialogs or popovers from 768.
- Use `dvh` and `env(safe-area-inset-*)`; keep targets at 44 px; no horizontal scroll at 360.
- Sticky headers compact on scroll; use view transitions for navigation between folders when supported.

## S3 facts the UI depends on

- Folders are key prefixes. A folder is “empty” when its prefix returns nothing.
- Rename and move are copy then delete. Folder moves are many operations and go through the journal.
- Listings are 1,000 keys per request. The UI shows the first 2,000 items and offers “Load all to sort by size”.
- Presigned URLs last at most 7 days and can't be revoked early.
- CORS is the most common failure. The CORS helper writes the origin from `window.location.origin`; the design uses `https://coffer.pages.dev` as a stand-in.
- Browsers block plain `http` endpoints on https pages, except localhost.
- Trash is the `.trash/` prefix. Starred and Recent are local only.

## Names

Component names (`data-component` in the design), token names, copy keys and type names are shared across these files. Copy keys are dotted paths in `copy.en.json`. Keys that name a section and also carry text end in `Label` (for example `det.typeLabel`).

## Caveats

- The canvas was not checked in a browser or a screenshot. Contrast pairs are computed; layout is described from the markup and CSS.
- Secondary states are drawn at all three widths on `T..` sheets (and some `O..`); see screens.md.
- The antislop and security-audit skills were not available. The brief's anti-slop and security-by-design rules were followed directly. No code audit was run.
- The canvas loads IBM Plex from Google Fonts. Production must self-host.
- `logo-mark.svg` (2 KiB) was added to the sample data for the safe SVG preview.
