# ADR-003: Container queries for layout

- **Status:** Accepted (Draft docs)
- **Date:** 2026-11-21
- **Related:** NFR-6 in [product-spec.md](../product-spec.md); [technical-spec.md](../technical-spec.md#12-styling-system); `design/HANDOFF.md`, `design/tokens.css`

## Context

The design switches layout at 768 and 1024 px (bottom nav and FAB, rail, sidebar; sheets versus dialogs). The same app may render in a narrower container than the viewport (embedded previews, split panes, tests). The design package states that layout follows the app root's width.

## Decision

Set `container: cf-app / inline-size` on `.cf-root` with `.cf-app` directly inside it. Use container-query variants (`@md:`, `@lg:`, `@xl:`, `@2xl:`) for layout, mobile first. Do not use viewport media queries for layout; viewport queries are allowed only for `prefers-reduced-motion`, `prefers-color-scheme` and `(hover: hover)`. Radix portals mount inside `.cf-root`.

## Consequences

- Layout is testable by resizing a container, not only the window.
- Requires browsers with container query support (Safari 16.4+ per NFR-7).
- Portals rendered to `document.body` would lose the container context, so the portal root is explicit.
- The base font size change at 1024 (15 to 14 px) comes from a container rule in `tokens.css`.

## Alternatives considered

- **Viewport media queries:** simpler, but they break when the app is not full width; rejected by the design.
