# Deploy Coffer to Vercel

- **Purpose:** host Coffer on Vercel.
- **Last updated:** 2026-11-28
- **Source files:** `vercel.json`, `package.json`, `.nvmrc`
- **Related:** [all targets](README.md), [ADR-010](../adr/ADR-010-deploy-portability.md)

**Not deployed by this project.** The steps follow Vercel's documented behaviour; confirm them with the header check.

1. Import the Git repository. `vercel.json` sets the build command (`pnpm build`), the output directory (`dist`) and the headers.
2. In the project settings choose Node.js 22. Add no environment variables.
3. Turn off Web Analytics, Speed Insights and the toolbar on preview deployments: they add scripts, which the policy blocks.
4. `vercel.json` is generated. Change headers in `deploy/headers.json` and run `pnpm deploy:build`.

## After the first deploy

- **CORS.** The new address is a new origin. Add it to the CORS rule of **every bucket** you connect to. Coffer's connection helper shows the rule with the current address; copy it from the screen.
- **Saved connections belong to the origin.** A browser keeps them for one address only. At a new address, add the connection and save it again.
- **Check the live headers:** `pnpm headers:check --url https://<project>.vercel.app/` must print `OK` and exit 0.
