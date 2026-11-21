# src/app/

App shell: providers, router, layout shells. Layer rules are in [../AGENTS.md](../AGENTS.md).

- Compose providers in one place: query client, i18n, theme, vault, router, toast host.
- Own the three shells (bottom nav and FAB, rail, sidebar) and switch them with container queries ([ADR-003](../../docs/adr/ADR-003-container-queries.md)); layout details are in `design/screens.md`.
- Resolve `Settings.theme` to `data-theme` on `<html>` (System follows `prefers-color-scheme` live); `public/theme-init.js` does the first paint.
- Provide the portal root inside `.cf-root` for overlays.
- Own the auto-lock timer and the lock and unlock transitions; they call `lib/storage/vault`, nothing else holds keys.
- No feature logic here. Route components are thin and delegate to `features/*`.
