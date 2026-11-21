# src/lib/i18n/

Copy loader and ICU formatting. No React imports in the core; a thin hook may live in `src/app`. Rules from [../../AGENTS.md](../../AGENTS.md) apply.

- Source of strings: `design/copy.en.json` (import it; never copy it). Additions live in `copy.additions.en.json` here, merged over the design file; an addition may override a design key (for example `files.emptyBucket.body`). Each addition and override is listed under C-15 in [../../../docs/open-questions.md](../../../docs/open-questions.md) until Design adopts it.
- Keys are dotted paths. Keys that name a section and carry text end in `Label`.
- Format with `intl-messageformat` (plural, select). Compile lazily and cache per key and locale.
- Type the key union from the merged JSON so a missing key fails typecheck. CI (`pnpm copy:check`) fails when code references a key that does not exist in the merged copy.
- Reference keys only as string literals passed to `t("a.b.c")`; the check finds them with a pattern and cannot see dynamic keys.
- Copy loads by top-level group (`groups.ts`, `scripts/vite/copy-groups.ts`). The core groups are in the first bundle; any other group must be loaded before its keys are used: wrap a feature in `CopyBoundary` (or call `loadCopyGroups`), and call `t()` inside the feature's components, not in the expression you pass as children. A key from an unloaded group throws an error that names the group. Unit tests load every group in `tests/setup.ts`.
- Never build sentences by concatenation; pass values as arguments.
- Provider-specific text (`helpSteps`, labels, badges) comes from `providers.json`, not from here.
- Error messages are chosen by `AppError` code, never by raw error text.
