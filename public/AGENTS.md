# public/

Static files copied as-is to the site root. Rules from [../AGENTS.md](../AGENTS.md) apply.

## Allowed contents

- `_headers`: CSP and security headers plus cache rules. The spec is [technical-spec](../docs/technical-spec.md) section 11.2.
- `fonts/`: self-hosted IBM Plex Sans and Mono (`woff2`, Latin subset, OFL license file).
- `theme-init.js`: tiny blocking script that sets `data-theme` before first paint (no inline scripts are allowed).
- `manifest.webmanifest`, `favicon.svg` and `icons/`: the brand kit from `design/brand/` ([C-53](../docs/open-questions.md#owner-confirmed-decisions)). `icons/` holds `favicon-16x16.png`, `favicon-32x32.png`, `favicon-48x48.png`, `favicon.ico` (linked explicitly), `apple-touch-icon.png`, `android-chrome-192x192.png`, `android-chrome-512x512.png`, `android-chrome-maskable-512x512.png`, `coffer-maskable.svg`, `coffer-mark.svg` and `coffer-logo.svg`. Do not copy `previews/` or `source/`, and do not add the kit's `site.webmanifest`.

Nothing else. Anything new needs an entry in [../docs/open-questions.md](../docs/open-questions.md) (list approved in C-22).

## Rules

- Do not weaken `_headers` to make something work. Never add `unsafe-inline`, `unsafe-eval` or a third-party origin. `connect-src https:` stays the only broad directive.
- Do not add `upgrade-insecure-requests` (it breaks localhost `http`).
- Keep the `_headers` check in CI green: it parses the built file and asserts every directive.
- No font CDN, no remote scripts, no tracking pixels.
- `theme-init.js` has no network access, no dynamic code and reads only `localStorage` key `coffer:theme`.
- Icons are cached for a year (`immutable`) and are not hashed: to change one, give the file a new name and update the links and the manifest.
- Hashed build output lives in `assets/` (generated), not here.
