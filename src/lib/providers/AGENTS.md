# src/lib/providers/

Loads and validates `design/providers.json` and turns presets into connection settings. No UI imports. Layer rules are in [../../AGENTS.md](../../AGENTS.md); behavior is in [technical-spec](../../../docs/technical-spec.md) section 4.

## Loading and validation

- Import `providers.json` at build time; type it as `ProvidersFile` from `types.ts`.
- A build-time check fails on: unknown placeholders in templates, unknown `showWhen`, `roleWhen` or `region.field` ids, regexes that do not compile, `endpointPattern` groups that are not field ids, a missing access key or secret role, duplicate `popularOrder`, unknown `group`.
- Never copy preset data into code. Provider behavior comes from data.

## Templating

- Replace `{id}` from field values; `endpointTemplateByField` overrides by field value (R2 `jurisdiction`).
- Validate each value as a host label; the endpoint must parse as a URL, be `https` (or `http` only for `localhost` and `127.0.0.1`), with no credentials, query or fragment.
- Resolve region by `RegionSpec.rule`; resolve addressing as in the spec (`auto` rules).

## Paste detection

- Order: env lines, rclone block, bare endpoint. Normalize line endings, `export`, quotes.
- Return `{ fields, detected }`. Never log, store or send the pasted text.

## Host warning

- Test the resolved host against `expectedHostPattern`; warn, do not block.

## Adding a provider (checklist)

1. Add the preset to the design package request in [../../../docs/open-questions.md](../../../docs/open-questions.md); `design/` is read-only.
2. Once it is in `providers.json`: confirm required fields, region rule, addressing and `checksumMode`.
3. Add `expectedHostPattern` and `pasteHints` with tests (env, rclone, endpoint).
4. Add `helpSteps` and `scopedKeyAdvice`; check the CORS steps.
5. Add a row to the provider compatibility matrix and run it manually.
6. Add a unit test for the endpoint, region and addressing result.
