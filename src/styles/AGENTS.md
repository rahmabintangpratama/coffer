# src/styles/

`tokens.css` and `tailwind.css` here are **generated** from `design/tokens.json`. Do not hand-edit them. Rules from [../AGENTS.md](../AGENTS.md) apply.

## Contents

- `tokens.css`: CSS variables, `data-theme` and `data-surface` scopes, `.cf-root` container (generated).
- `tailwind.css`: `@theme inline` mapping and `btn-*` utilities; imports `./tokens.css` (generated).
- `fonts.css` (hand-written): `@font-face` for IBM Plex from `/fonts/`, `font-display: swap`.

## Regenerating

1. Edit nothing in `design/`. A token change arrives as a new `design/tokens.json`.
2. Run `pnpm tokens:build` (TBD) to regenerate both files with the generator in `scripts/tokens/` ([ADR-008](../../docs/adr/ADR-008-token-generator.md)); commit the result.
3. `pnpm tokens:check` (TBD) regenerates into a temp directory and fails CI if the output differs from the committed files.
4. Re-run the real-browser contrast pass if any color token changed ([technical-spec](../../docs/technical-spec.md) section 15.7).

## Rules

- Import only `tailwind.css` (and `fonts.css`) from `main.tsx`.
- Component CSS lives next to the component and uses tokens only.
- Do not redeclare `--cf-btn-*`, hover, active or tonal tokens; the `data-surface` scopes own them.
- Keep container-query layout on `.cf-root` with `.cf-app` directly inside.
