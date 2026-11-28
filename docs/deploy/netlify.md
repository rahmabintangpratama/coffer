# Deploy Coffer to Netlify

- **Purpose:** host Coffer on Netlify.
- **Last updated:** 2026-11-28
- **Source files:** `public/_headers`, `package.json`, `.nvmrc`
- **Related:** [all targets](README.md), [ADR-010](../adr/ADR-010-deploy-portability.md)

**Not deployed by this project.** The steps follow Netlify's documented behaviour; confirm them with the header check.

1. Add the site from your Git repository.
2. Build command: `corepack enable && pnpm install --frozen-lockfile && pnpm build`. Publish directory: `dist`.
3. Environment variable: `NODE_VERSION` = `22`. Nothing else, and no secrets.
4. Netlify reads `dist/_headers`, which the build writes. Add no header rules in `netlify.toml` or in the dashboard.
5. Turn off post processing (asset optimization, snippet injection) and any analytics that adds a script.

## After the first deploy

- **CORS.** The new address is a new origin. Add it to the CORS rule of **every bucket** you connect to. Coffer's connection helper shows the rule with the current address; copy it from the screen.
- **Saved connections belong to the origin.** A browser keeps them for one address only. At a new address, add the connection and save it again.
- **Check the live headers:** `pnpm headers:check --url https://<site>.netlify.app/` must print `OK` and exit 0.
