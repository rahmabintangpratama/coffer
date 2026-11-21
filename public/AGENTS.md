# public/

Static files copied as-is to the site root. Rules from [../AGENTS.md](../AGENTS.md) apply.

## Allowed contents

- `_headers`: CSP and security headers plus cache rules. The spec is [technical-spec](../docs/technical-spec.md) section 11.2.
- `fonts/`: self-hosted IBM Plex Sans and Mono (`woff2`, Latin subset, OFL license file).
- `theme-init.js`: tiny blocking script that sets `data-theme` before first paint (no inline scripts are allowed).
- `manifest.webmanifest`, `icons/`, `favicon.svg`.

Nothing else. Anything new needs an entry in [../docs/open-questions.md](../docs/open-questions.md) (list approved in C-22).

## Rules

- Do not weaken `_headers` to make something work. Never add `unsafe-inline`, `unsafe-eval` or a third-party origin. `connect-src https:` stays the only broad directive.
- Do not add `upgrade-insecure-requests` (it breaks localhost `http`).
- Keep the `_headers` check in CI green: it parses the built file and asserts every directive.
- No font CDN, no remote scripts, no tracking pixels.
- `theme-init.js` has no network access, no dynamic code and reads only `localStorage` key `coffer:theme`.
- Hashed build output lives in `assets/` (generated), not here.
