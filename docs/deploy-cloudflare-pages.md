# Deploy Coffer to Cloudflare Pages

- **Purpose:** the exact steps to host Coffer on Cloudflare Pages, and how to prove the live site sends the headers the spec requires.
- **Status:** Draft (the steps are written from the repo's build and from Cloudflare's documented Pages settings; the owner confirms them on first deploy, and any difference is noted in section 8).
- **Last updated:** 2026-11-22
- **Source files:** `public/_headers`, `package.json`, `.nvmrc`, `scripts/headers/check.ts`
- **Related:** [technical-spec.md](technical-spec.md) sections 11.2 and 16, [release-checklist.md](release-checklist.md), [manual-test-plan.md](manual-test-plan.md)

Coffer is a static site. There is no server code, no Functions, no database and no secret. Cloudflare Pages only serves the files in `dist/` and applies `_headers`.

## 1. What the repo gives Pages

| Item | Value |
|---|---|
| Build command | `corepack enable && pnpm install --frozen-lockfile && pnpm build` |
| Build output directory | `dist` |
| Root directory | `/` (the repo root) |
| Node version | 22 (set the environment variable `NODE_VERSION` to `22`; the repo also has `.nvmrc`) |
| Package manager | pnpm 12, pinned in `package.json` (`packageManager`). `corepack enable` makes the pinned version run. |
| Environment variables | `NODE_VERSION=22` only. No secrets. No `VITE_*` values are needed. |
| Functions | None. Do not add a `functions/` directory. |
| Headers | `public/_headers` is copied to `dist/_headers` by the build and applied by Pages. |

`pnpm build` runs `tsc --noEmit && vite build`, so a type error fails the deployment before anything is published.

## 2. Create the project

1. Push the repository to GitHub (or GitLab) if it is not there yet.
2. In the Cloudflare dashboard open **Workers & Pages**, then **Create**, then the **Pages** tab, then **Connect to Git**.
3. Choose the repository.
4. On **Set up builds and deployments**:
   - **Project name:** the name becomes the address `https://<project>.pages.dev`. Pick it carefully: the allowed origin in every bucket's CORS rule is this address.
   - **Production branch:** `main`.
   - **Framework preset:** None.
   - **Build command:** `corepack enable && pnpm install --frozen-lockfile && pnpm build`
   - **Build output directory:** `dist`
   - **Root directory (advanced):** leave empty.
5. Under **Environment variables (advanced)** add, for both Production and Preview: `NODE_VERSION` = `22`.
6. **Save and Deploy**. The first build takes a few minutes. Open the Build log if it fails; the most common cause is a missing `NODE_VERSION`.

## 3. Production and preview deployments

| Kind | When it is made | Address |
|---|---|---|
| Production | A push to `main` | `https://<project>.pages.dev` |
| Preview | A push to any other branch, and every pull request | `https://<hash>.<project>.pages.dev` and `https://<branch>.<project>.pages.dev` |

Settings, **Builds & deployments**:

- Keep **Automatic production branch deployments** on.
- Keep **Preview deployments** on for **All non-production branches**.
- Preview deployments get `X-Robots-Tag: noindex` from Pages; the spec relies on that. Check it in section 5.

**Each address is its own origin.** A bucket's CORS rule must list the address you use. Coffer's connection helper always shows the rule with the current address, so copy it from the screen. Preview addresses change per deployment; use the stable branch address (`https://<branch>.<project>.pages.dev`) for tests, and use throwaway buckets.

## 4. Do not change these settings

- Do **not** add a custom `_headers` or `_redirects` rule in the dashboard. The file in the repo is the only source of headers. A dashboard rule that adds or changes a header makes the live site differ from the reviewed file.
- Do **not** enable Cloudflare Web Analytics, the "Auto Minify" or "Rocket Loader" options, or any feature that injects a script or rewrites HTML on this site. The Content-Security-Policy allows only the site's own scripts, and an injected script is blocked and shows up as a violation. If a zone-level feature injects something, turn it off for this hostname.
- Do **not** add a service worker or any caching rule for `/index.html`: the spec wants `no-cache` there.

## 5. Verify the live headers

From a clone of the repo, with Node 22 and `pnpm install` done:

```sh
pnpm headers:check --url https://<project>.pages.dev
```

Expected: `https://<project>.pages.dev: OK (headers match the spec on every path checked)` and exit code 0.

What it checks, on `/`, `/index.html`, `/theme-init.js`, `/favicon.svg`, a font under `/fonts/` and the main script under `/assets/`:

- every response is `200`;
- the `Content-Security-Policy` has exactly the directives in the technical spec (11.2), and none of `'unsafe-inline'`, `'unsafe-eval'`, `'wasm-unsafe-eval'` or `upgrade-insecure-requests`;
- `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `Cross-Origin-Opener-Policy: same-origin`, `Permissions-Policy` and `Strict-Transport-Security: max-age=63072000; includeSubDomains`;
- `Cache-Control` is `no-cache` for `/`, `/index.html` and `/theme-init.js`, and `public, max-age=31536000, immutable` for `/assets/*`, `/fonts/*` and `/favicon.svg`.

To check a preview, pass its address the same way. The command also works against a local `pnpm preview` or `node scripts/serve/dist-server.ts` server.

If it fails, each line names the path and the header, for example `/: missing header referrer-policy.` Compare with `dist/_headers` in the build output of that deployment (Pages, **Deployments**, **View build**). A header missing on every path means `_headers` was not deployed; one missing on a single path means a path rule does not match.

Then look at it with your own eyes:

1. Open the address in a private window and open the browser's developer tools, **Network**, select the document request, **Headers**, **Response Headers**: the same headers are there.
2. **Console**: no red errors and no "Refused to ..." messages.
3. `curl -sI https://<project>.pages.dev/ | grep -i x-robots-tag` on a preview address prints `x-robots-tag: noindex`.

## 6. Roll back

Pages keeps every deployment. In the project, **Deployments**, find the last good one, open its menu, **Rollback to this deployment** (for production). The address stays the same. Run section 5 again afterwards.

## 7. Custom domain (later)

The first release uses the `pages.dev` address (C-30). A custom domain is a later decision. When you add one:

1. **Custom domains**, **Set up a custom domain**. Cloudflare creates the DNS record and the certificate.
2. Every bucket's CORS rule must now list the new origin; old rules for the `pages.dev` address keep working only as long as you keep using that address.
3. Re-read the HSTS line in `public/_headers` (`includeSubDomains`, no `preload`, C-32) before the domain is used: HSTS tells browsers to refuse plain http for the whole domain and its subdomains for two years. Do not add `preload` until the domain is final and owned.
4. Run section 5 against the new address.

## 8. Things to confirm on the first deploy

These come from documentation rather than from a run on your account. Write what you find.

| Item | What to check | Found |
|---|---|---|
| Node version | The build log's first lines show Node 22.x. | |
| pnpm | The log shows pnpm 12.x (corepack). If Pages ignores `packageManager`, add the environment variable `PNPM_VERSION=12.21.0` or use `npx pnpm@12.21.0` in the build command. | |
| Output | The deployment lists `index.html`, `_headers`, `assets/`, `fonts/`. | |
| Headers | Section 5 prints `OK`. | |
| Preview noindex | The `x-robots-tag` check in section 5 on a preview address. | |
| Environment | Settings, Variables and secrets lists `NODE_VERSION` and nothing else, for Production and Preview. `VITE_COFFER_LOAD_ALL_CAP` and `VITE_COFFER_AUTOLOCK_TEST_MS` are test switches that Vite would bake into the bundle (security audit lead B-1). | |
