# Deploy Coffer to GitHub Pages (degraded)

- **Purpose:** host Coffer on GitHub Pages, and know what it costs.
- **Last updated:** 2026-11-28
- **Source files:** `.github/workflows/pages.yml`, `scripts/vite/deploy.ts`
- **Related:** [all targets](README.md), [ADR-010](../adr/ADR-010-deploy-portability.md)

**Use a host that sends headers if you can.** GitHub Pages does not let a site set response headers. This build puts the policy inside the page, which covers less. It has been tested against a server that sends no headers, not deployed to GitHub Pages by this project.

## What is lost

| Protection | On GitHub Pages |
|---|---|
| `frame-ancestors 'none'` | **Lost.** A `meta` policy cannot carry it, so another site can put Coffer in a frame and try to trick clicks. |
| `Cross-Origin-Opener-Policy` | **Lost.** |
| `Permissions-Policy` | **Lost.** |
| `X-Content-Type-Options: nosniff` | Not under your control. |
| `Strict-Transport-Security` | Not under your control: you cannot set its lifetime or `includeSubDomains`. Turn on **Enforce HTTPS**. |
| Content-Security-Policy | Weaker. It applies from the `meta` element on, and the PDF worker, which gets its policy only from headers, runs without one. |
| `Referrer-Policy: no-referrer` | Kept, as a `meta` element. |
| Cache rules | **Lost.** Hashed files are not cached for a year; GitHub's own cache lifetime applies. |
| `pnpm headers:check --url` | Fails, as expected. |

A project site (`https://<account>.github.io/<repository>/`) shares its origin with every other Pages site of that account, and with them its browser storage. Read [the note on shared origins](README.md#serving-under-a-path). Use a custom domain for Coffer alone, or do not save connections there.

## Turn it on

The workflow is off by default.

1. Repository **Settings**, **Pages**, **Source**: **GitHub Actions**.
2. **Settings**, **Secrets and variables**, **Actions**, **Variables**: add `COFFER_PAGES` = `true`.
3. **Actions**, **GitHub Pages**, **Run workflow** on `main`. The base path comes from the Pages settings.

To build by hand: `COFFER_TARGET=github-pages COFFER_BASE=/<repository>/ pnpm build`.

## After the first deploy

- **CORS.** Add the origin (`https://<account>.github.io`, without the path, or your custom domain) to the CORS rule of **every bucket**.
- **Saved connections belong to the origin.** At a new address, add the connection and save it again.
- Open the browser console: there must be no policy violation.
