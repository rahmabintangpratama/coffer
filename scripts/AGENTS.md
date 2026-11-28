# scripts/

Build-time tooling. Nothing here ships to the browser. Rules from [../AGENTS.md](../AGENTS.md) apply; the decision is [ADR-008](../docs/adr/ADR-008-token-generator.md).

## tokens/

- Generator from `design/tokens.json` (W3C DTCG: light in `$value`, dark in `$extensions.coffer.dark`) to `src/styles/tokens.css` and `src/styles/tailwind.css`.
- `design/tokens.json` is the only input and stays read-only.
- Output is deterministic: stable key order, no timestamps, no absolute paths.
- Use the Node standard library only; add no dependency without an ADR.
- Golden test: the output must equal `design/tokens.css` and `design/tailwind.css` after whitespace normalization. Keep that test green.
- `pnpm tokens:build` writes the files; `pnpm tokens:check` regenerates to a temp directory and fails on any difference from the committed files (CI runs it).
- A color token change needs the real-browser contrast pass ([technical-spec](../docs/technical-spec.md) section 15.7).

## docs/

- `docs/ids.test.ts` runs with `pnpm test` and fails when an OQ, D, C or DC ID is defined twice in `docs/`.

## Other scripts

Keep each script small, documented in its header, and free of network access and secrets.
