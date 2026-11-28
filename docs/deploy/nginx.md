# Serve Coffer with nginx

- **Purpose:** host Coffer on your own nginx.
- **Last updated:** 2026-11-28
- **Source files:** `deploy/nginx/coffer.conf`
- **Related:** [all targets](README.md), [ADR-010](../adr/ADR-010-deploy-portability.md)

1. Build: `pnpm install --frozen-lockfile && pnpm build`.
2. Copy the files of `dist/` to `/usr/share/nginx/html` (or change `root` in your copy of the configuration).
3. Copy `deploy/nginx/coffer.conf` to `/etc/nginx/conf.d/`. It listens on port 8080.
4. Add HTTPS: either put it behind a TLS proxy, or in your copy replace the `listen` lines with `listen 443 ssl;` and add `ssl_certificate` and `ssl_certificate_key`. Keep your edits to those lines, so a newer generated file is easy to merge.
5. Do not add `add_header` inside a `location`: nginx then drops every inherited header there.
6. Reload: `nginx -t && nginx -s reload`.

For a path, run `pnpm deploy:build --base /coffer/ --out out/`, use `out/deploy/nginx/coffer.conf`, and copy the files into `coffer/` under the root.

## After the first deploy

- **CORS.** The new address is a new origin. Add it to the CORS rule of **every bucket** you connect to. Coffer's connection helper shows the rule with the current address; copy it from the screen.
- **Saved connections belong to the origin.** A browser keeps them for one address only. At a new address, add the connection and save it again.
- **Check the live headers:** `pnpm headers:check --url https://<your-domain>/` must print `OK` and exit 0.
