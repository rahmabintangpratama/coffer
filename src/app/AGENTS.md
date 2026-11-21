# src/app/

App shell: providers, router, layout shells. Layer rules are in [../AGENTS.md](../AGENTS.md).

- `Shell.tsx` owns the three shells (bottom nav and drawer below 768 px, rail from 768, sidebar from 1024), chosen by the width of `.cf-root` ([ADR-003](../../docs/adr/ADR-003-container-queries.md)). `.cf-app` stays directly inside `.cf-root`.
- Routing is TanStack Router with hash history (`router.tsx`). Keep route paths as string literals so `Link` is checked at compile time. Nothing about files goes in a real URL path.
- Navigation destinations live in `nav-items.ts`; their labels are typed `CopyKey`, so a missing key fails typecheck.
- Theme: `theme.ts` resolves the setting (system, light, dark) to `data-theme` on `<html>` and follows `prefers-color-scheme` live; `public/theme-init.js` does the first paint. Keep the two in step (same key, same rules).
- Modal layers return focus to their opener explicitly (`returnFocusRef`), because Safari does not focus buttons on click.
- After a navigation to a different screen, focus moves to `<main>`; each screen sets one document title.
- Do not draw a control before the feature behind it exists (no dead buttons): the search pill, New and the connection avatar arrive with M3, M4 and M8.
- Own the auto-lock timer and the lock and unlock transitions (M8); they call `lib/storage/vault`, nothing else holds keys.
- No feature logic here. Route components are thin and delegate to `features/*`; the placeholder screens go away as features land.
