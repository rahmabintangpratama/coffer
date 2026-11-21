# ADR-008: In-repo DTCG to CSS token generator

- **Status:** Accepted (Draft docs)
- **Date:** 2026-11-21
- **Related:** NFR-12 in [product-spec.md](../product-spec.md); [technical-spec.md](../technical-spec.md#12-styling-system); C-28 and D-23 in [open-questions.md](../open-questions.md)

## Context

`design/tokens.css` and `design/tailwind.css` say they are generated from `design/tokens.json`, but the generator (`tokens.py`) was not supplied. Without one, a token change cannot be turned into CSS inside this repo, and copying files by hand invites drift.

## Decision

Eng writes a small generator in `scripts/tokens/` that reads `design/tokens.json` (W3C DTCG, light value in `$value`, dark in `$extensions.coffer.dark`) and writes `src/styles/tokens.css` and `src/styles/tailwind.css`. `design/tokens.json` stays the source of truth and is never edited here.

- `pnpm tokens:build` regenerates both files; they are committed.
- `pnpm tokens:check` regenerates into a temporary directory and fails when the result differs from the committed files. It runs in CI on every PR.
- Before it replaces the design copies, the generator must pass a golden test: its output equals `design/tokens.css` and `design/tailwind.css` after whitespace normalization, including the `data-theme`, `data-surface` and `--cf-btn-*` scopes and the `.cf-root` container rule.
- The generator is deterministic (stable ordering, no timestamps) and has no dependencies beyond the Node standard library.

## Consequences

- Token changes need only a new `tokens.json` plus a regenerate; no manual CSS edits and no dependency on the unavailable script.
- The generator becomes code that must match the design's conventions; the golden test and a review by Design protect that.
- If Design later supplies its own generator, this one is replaced or retired by a new ADR.
- Any change to a color token still requires the real-browser contrast pass.

## Alternatives considered

- **Copy `design/*.css` with a sync script:** simple, but blocks token changes until Design redelivers files.
- **Style Dictionary:** capable, but a heavy dependency for a small, fixed mapping; revisit if the mapping grows.
