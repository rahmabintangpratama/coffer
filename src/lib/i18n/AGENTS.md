# src/lib/i18n/

Copy loader and ICU formatting. No React imports in the core; a thin hook may live in `src/app`. Rules from [../../AGENTS.md](../../AGENTS.md) apply.

- Source of strings: `design/copy.en.json` (import it; never copy it). Additions live in `copy.additions.en.json` here, merged over the design file; an addition may override a design key (for example `files.emptyBucket.body`). Each addition and override is listed under C-15 in [../../../docs/open-questions.md](../../../docs/open-questions.md) until Design adopts it.
- Keys are dotted paths. Keys that name a section and carry text end in `Label`.
- Format with `intl-messageformat` (plural, select). Compile lazily and cache per key and locale.
- Type the key union from the merged JSON so a missing key fails typecheck. CI (`pnpm copy:check`, TBD) fails when code references a key that does not exist in the merged copy.
- Never build sentences by concatenation; pass values as arguments.
- Provider-specific text (`helpSteps`, labels, badges) comes from `providers.json`, not from here.
- Error messages are chosen by `AppError` code, never by raw error text.
