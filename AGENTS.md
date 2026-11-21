# Coffer: agent instructions

Coffer is a browser-only, mobile-first file manager for S3-compatible object storage. It is a static site on Cloudflare Pages. The browser signs S3 requests with keys the user enters and talks directly to the provider.

**Hard constraints (never change without an ADR):**
- No backend, no database, no accounts, no server-side search, no sync client.
- Keys never leave the browser except as SigV4-signed requests to the user's own provider endpoint.
- Static hosting on Cloudflare Pages, no Functions, no secrets in config.

Status: docs and agent context exist; the app is not scaffolded yet. See [docs/product-brief.md](docs/product-brief.md).

## Where things are

| Path | What it holds |
|---|---|
| `design/` | Approved UX, tokens, copy, types, provider presets, security design. **Read-only source of truth.** |
| `docs/` | Product brief, product spec (FR/NFR), technical spec, ADRs, open questions. |
| `src/` | Application code. Layers and rules in `src/AGENTS.md`. |
| `src/app/` | Router, providers, app shell. |
| `src/components/` | shadcn/Radix base components, token-styled. |
| `src/features/` | One folder per feature area. |
| `src/lib/s3/` | S3 client factory, operations, errors, presigning. |
| `src/lib/storage/` | Vault, operation journal, upload state, IndexedDB. |
| `src/lib/providers/` | Provider preset loading, templating, paste detection. |
| `src/lib/i18n/` | Copy loader and ICU formatting. |
| `src/styles/` | Generated token CSS and Tailwind mapping. |
| `scripts/` | Build tooling, including the token generator (`scripts/tokens/`). |
| `public/` | `_headers` (CSP), self-hosted fonts and a few static assets. |
| `tests/` | Integration, e2e and shared fixtures. |

**Read order for docs:** [product-brief](docs/product-brief.md), then [product-spec](docs/product-spec.md), then [technical-spec](docs/technical-spec.md), then [implementation-plan](docs/implementation-plan.md) (milestones, exit checks), then [open-questions](docs/open-questions.md). ADRs are in [docs/adr/](docs/adr/). Start from [design/HANDOFF.md](design/HANDOFF.md) for design.

Each directory with an `AGENTS.md` has a `CLAUDE.md` that imports it. Nested files add only directory-specific rules; do not repeat this file in them.

## Commands

Package manager: **pnpm** 12 with Node 22 (`.nvmrc`; enable pnpm with `corepack enable`). Commands marked **TBD** do not exist yet; update this table in the same change that adds each script.

| Task | Command |
|---|---|
| Install | `pnpm install --frozen-lockfile` |
| Dev server | `pnpm dev` |
| Build | `pnpm build` |
| Typecheck | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Unit and component tests | `pnpm test` |
| Integration tests (needs MinIO) | `pnpm test:integration` (TBD) |
| End-to-end tests | `pnpm test:e2e` (TBD) |
| Start local MinIO | `docker compose -f tests/integration/docker-compose.yml up -d` (TBD) |
| Generate token CSS from `design/tokens.json` | `pnpm tokens:build` |
| Check generated CSS matches committed files | `pnpm tokens:check` |
| Check copy keys used in code exist | `pnpm copy:check` (TBD) |

## Conventions

- TypeScript `strict`. No `any` without a comment saying why. No non-null assertions on external data.
- Names match `design/`: component names from `components.md`, token names from `tokens.json`, copy keys from `copy.en.json`, type names from `src/lib/types.ts` (the canonical contract; its origin is `design/types.ts`).
- **No hard-coded UI strings.** Use `copy.en.json` keys. Missing keys go in `src/lib/i18n/copy.additions.en.json` and are listed in [docs/open-questions.md](docs/open-questions.md) (C-15); CI fails on a missing key.
- **No hard-coded colors or sizes.** Use tokens (Tailwind utilities from `design/tailwind.css` or `var(--cf-*)`).
- Mobile first. Layout uses container queries on `.cf-root`, never viewport media queries.
- One component, one job. Prefer the platform (Web Crypto, `fetch`, `Intl`) over a new dependency.
- Errors are typed (`AppError`), never raw SDK errors. Comments explain why, not what.
- Reference requirements by ID (`FR-36`, `AC-36.1`, `ADR-004`) in tests and PR descriptions.

## Security rules (non-negotiable)

- Never log, display, store unencrypted or put in a URL: access keys, secret keys, session tokens, passphrases, derived keys or presigned URLs.
- Never render bucket data (names, contents, metadata) as HTML. HTML is shown as source, SVG as `<img>`, Markdown sanitized.
- No third-party scripts, fonts, analytics, CDNs or error-reporting SDKs. Self-host fonts.
- Keep the CSP in `public/_headers` valid; do not add inline scripts, `unsafe-eval` or new origins to loosen it.
- Treat all file names and file contents as untrusted input.
- Tests and fixtures never use real cloud credentials.
- New storage locations must be added to "Forget this device" and its inventory test in the same change.

## Workflow

1. Read the relevant spec section ([product-spec](docs/product-spec.md) FR and AC, [technical-spec](docs/technical-spec.md)) and the linked `design/` screens before coding.
2. Make small changes, each with tests that cite the AC IDs they cover.
3. Update docs when behavior changes: spec, ADR (if a decision changes) and this file's commands.
4. **Never edit `design/`.** If the design is wrong, missing or conflicting, add an entry to [docs/open-questions.md](docs/open-questions.md) and follow the recommended default until it is answered.
5. Do not guess provider behavior; add it to the compatibility matrix as a manual check.

## Git

- Use Conventional Commits: `type(scope): subject` with `feat`, `fix`, `docs`, `chore`, `test`, `refactor`, `perf`, `build` or `ci`; imperative subject under 72 characters; the body explains why.
- **Do not add a `Co-Authored-By` trailer or any other attribution** (tool or author credit lines) to commits.
- **Every commit must be signed** (SSH signing is configured for the maintainer). Never disable signing: no `-c commit.gpgsign=false`, no `--no-gpg-sign`. If signing fails, stop and tell the maintainer.
- Commit to `main` for now. Remote `origin`: `git@github.com:rahmabintangpratama/coffer.git`. Never force-push or rewrite pushed history.
- Commit and push only when asked. Keep each commit to one logical change.
- Review `.gitignore` before committing. It must keep covering `node_modules/`, `dist/`, `coverage/`, `playwright-report/`, `test-results/`, `.vite/`, `*.log`, `.DS_Store`, `.env` and `.env.*` (except `.env.example`), `*.local`, `.claude/settings.local.json`, `.idea/` and `.vscode/` (except shared settings).
- Never commit secrets, real credentials or local settings files.

## Definition of done

- `pnpm typecheck`, lint and all test layers pass.
- Accessibility checks pass (axe, keyboard path, focus, 44 px targets on mobile).
- All states are covered: empty, loading, partial, error, success.
- Every string uses an existing copy key; every style uses tokens.
- Layout verified at 375, 768 and 1440 and in light and dark.
- Docs updated; open questions recorded for anything undecided.

## Before any release

- Run the antislop rules for UI and copy work (`antislop`, `antislop-ui`, `antislop-copywriting`, `antislop-human`).
- Run the Cloudflare `security-audit` skill on the codebase (full audit mode) and resolve or record every finding.
- Run the real-browser contrast pass and the provider compatibility matrix ([technical-spec](docs/technical-spec.md) sections 15.5 and 15.7).
