# Serve Coffer with Caddy

- **Purpose:** host Coffer on your own Caddy.
- **Last updated:** 2026-11-28
- **Source files:** `deploy/caddy/Caddyfile`
- **Related:** [all targets](README.md), [ADR-010](../adr/ADR-010-deploy-portability.md)

1. Build: `pnpm install --frozen-lockfile && pnpm build`.
2. Copy the files of `dist/` to a folder, for example `/srv`.
3. Run Caddy with `deploy/caddy/Caddyfile`. Set `COFFER_ROOT` to the folder and `COFFER_SITE` to your domain: with a domain Caddy obtains the certificate itself. Without it Caddy serves plain `http` on port 8080, which suits only `localhost` or a TLS proxy in front.

```sh
COFFER_SITE=files.example.com COFFER_ROOT=/srv caddy run --config deploy/caddy/Caddyfile
```

For a path, run `pnpm deploy:build --base /coffer/ --out out/`, use `out/deploy/caddy/Caddyfile`, and copy the files into `coffer/` under the root.

## After the first deploy

- **CORS.** The new address is a new origin. Add it to the CORS rule of **every bucket** you connect to. Coffer's connection helper shows the rule with the current address; copy it from the screen.
- **Saved connections belong to the origin.** A browser keeps them for one address only. At a new address, add the connection and save it again.
- **Check the live headers:** `pnpm headers:check --url https://<your-domain>/` must print `OK` and exit 0.
