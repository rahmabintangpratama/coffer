# Deploy Coffer

- **Purpose:** choose a host, and know what each one keeps of Coffer's security headers.
- **Last updated:** 2026-11-28
- **Source files:** `deploy/headers.json`, `scripts/deploy/`, `playwright.deploy.config.ts`
- **Related:** [ADR-010](../adr/ADR-010-deploy-portability.md), [technical-spec.md](../technical-spec.md#112-response-headers), [release-checklist.md](../release-checklist.md)

Coffer is a static site: run `pnpm build` and serve `dist/`. There is no server code and no secret. Its protection depends on response headers, so pick a host that can send them. **Cloudflare Pages is the reference target.**

## Tiers

| Target | Tier | Configuration | Checked by this project |
|---|---|---|---|
| [Cloudflare Pages](cloudflare-pages.md) | Full, reference | `public/_headers` | The headers are checked against a local server in CI. The check against a live Pages address is a release step (G-1). |
| [nginx](nginx.md) | Full | `deploy/nginx/coffer.conf` | CI runs the header, CSP and app specs against this file in a pinned container, at the root and under a path. |
| [Caddy](caddy.md) | Full | `deploy/caddy/Caddyfile` | The same as nginx. |
| [Netlify](netlify.md) | Full, unverified | `public/_headers` | Not deployed. Written from Netlify's documented behaviour. |
| [Vercel](vercel.md) | Full, unverified | `vercel.json` | Not deployed. Written from Vercel's documented behaviour. |
| [GitHub Pages](github-pages.md) | **Degraded**, own origin only | `COFFER_TARGET=github-pages` | CI runs the build against a server that sends no headers. Not deployed. |

A host counts as full only after `pnpm headers:check --url <address>` passes against your deployment.

## The headers have one source

Edit `deploy/headers.json`, then run `pnpm deploy:build`. It writes the four files above. `pnpm deploy:check` fails in CI when one differs, and `pnpm headers:check` keeps its own list of required values, so loosening a header takes two edits.

## Serving under a path

Set `COFFER_BASE` when you build, for example `COFFER_BASE=/coffer/ pnpm build`. Routes stay in the URL fragment, so no rewrite rules are needed. For nginx and Caddy, render the matching configuration with `pnpm deploy:build --base /coffer/ --out out/` and put the files of `dist/` in a `coffer/` folder under the web root. A GitHub Pages project site uses a path too, which is not recommended. Hosting under a path on Cloudflare Pages, Netlify or Vercel is not covered: give Coffer an address of its own there.

**Give Coffer an origin of its own.** Browser storage, including saved connections, is shared by everything on one origin (scheme, host and port), whatever the path. Another app on the same origin can read the encrypted records and can run code that reaches them while Coffer is open. Welcome and Unlock show a warning in that case. `Forget this device` removes only Coffer's own data ([C-61](../open-questions.md#owner-confirmed-decisions)); it does not protect that data from the other apps.

## For every target

- Add the address to the CORS rule of every bucket.
- Saved connections belong to one origin: moving the site means saving them again.
- Serve it over HTTPS. Browsers allow plain `http` only for `localhost`, and the encryption Coffer uses needs a secure context.
- Turn off anything on the host that injects scripts or rewrites HTML (analytics, toolbars, minifiers). The policy blocks it and the console reports a violation.
- Do not build with `VITE_COFFER_LOAD_ALL_CAP` or `VITE_COFFER_AUTOLOCK_TEST_MS` set: they are test switches.
