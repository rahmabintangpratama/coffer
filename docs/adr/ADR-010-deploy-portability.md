# ADR-010: Any static host, one source for the headers

- **Status:** Accepted; amends the hosting constraint of [ADR-001](ADR-001-no-backend.md) ("Cloudflare Pages")
- **Date:** 2026-11-28
- **Related:** [technical-spec.md](../technical-spec.md#112-response-headers) sections 11.2 and 16; [deploy guides](../deploy/README.md); C-22, C-30, C-32, C-60 in [open-questions.md](../open-questions.md)

## Context

Coffer is a folder of static files, but its security rests on response headers, and the repository described them for one host only (`public/_headers`, read by Cloudflare Pages). A person who wants to host it elsewhere had to translate that file by hand, which is where a policy gets weakened by accident. Some hosts cannot set headers at all, and some serve a site below a path.

## Decision

- **Coffer deploys to any static host. Cloudflare Pages stays the reference target.** No backend, Functions or secrets, on any host.
- `deploy/headers.json` is the only source of the response headers: the Content-Security-Policy by directive, the other security headers and the cache rules. `pnpm deploy:build` renders `public/_headers` (Cloudflare Pages, Netlify), `deploy/nginx/coffer.conf`, `deploy/caddy/Caddyfile` and `vercel.json`. `pnpm deploy:check` fails in CI when a committed file differs.
- `pnpm headers:check` keeps its own expected values, taken from the technical spec. A change that loosens `deploy/headers.json` still fails there, so weakening a header takes two deliberate edits.
- `COFFER_BASE` sets the path the site is served under (default `/`). Routes stay in the URL fragment, so no host needs rewrite rules. The build writes `dist/_headers` with the base in its paths; the other configurations for a base are rendered on request (`pnpm deploy:build --base /coffer/ --out <dir>`).
- **GitHub Pages is a degraded tier**, built only with `COFFER_TARGET=github-pages`: the policy and the referrer policy go into the page as `meta` elements. Everything a header alone can do is lost there and is listed in [the guide](../deploy/github-pages.md). Its workflow is off until the owner turns it on.
- Hosts are ranked in tiers in the [deploy guides](../deploy/README.md): a host is full only when `pnpm headers:check --url` passes against it.

## Consequences

- A header is changed in one file, then regenerated.
- nginx and Caddy are exercised in CI with the generated files. Netlify, Vercel and GitHub Pages are written from their documentation and have not been deployed by this project; the check against the live address is how a person confirms them.
- A saved connection belongs to an origin. Moving to another address means saving it again, and every bucket's CORS rule must list the new origin.
- An origin shared with other sites (a subpath next to other apps, such as a GitHub Pages project site) shares its browser storage with them. Coffer's guides ask for an origin of its own.

## Alternatives rejected

- Hand-written configuration per host: four copies of the policy drift.
- Making the checker read `deploy/headers.json`: it would accept whatever the source says.
- A `meta` policy in every build: it adds nothing where headers work, and it cannot carry `frame-ancestors`.
- A service worker that adds headers: it does not cover the first load and adds a storage location to forget.
