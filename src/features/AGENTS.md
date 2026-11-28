# src/features/

One folder per feature area. Layer rules are in [../AGENTS.md](../AGENTS.md).

## Folders (create when building the feature)

`onboarding/` (FR-1 to FR-13), `files/` (browse, FR-20 to FR-37 so far; `actions/` was folded into it, D-35), `transfers/` (FR-40 to FR-45), `preview/` (FR-50 to FR-58), `share/` (FR-60, FR-61), `trash/` (FR-70, FR-71), `library/` (starred and recent, FR-80, FR-81), `storage/` (FR-90), `settings/` (FR-100 to FR-102), `readonly/` (FR-110, FR-111), `demo/` (FR-120, v1). Requirement IDs are defined in [../../docs/product-spec.md](../../docs/product-spec.md).

## Rules

- Before building, read the feature's FR block: acceptance criteria, states, edge cases and linked screen IDs.
- Cover **all** states from the spec (empty, loading, partial, error, success). A missing state is a bug.
- Match the board IDs listed under **Screens** at 375, 768 and 1440; compare against `design/screens.md` and `design/components.md`.
- Layout: `index.ts` exports the public surface; internals are private. Other features import only from `index.ts`. One exception: `onboarding/UnlockScreen` lazy-loads `vault/ForgetDialog` by path, because the vault index would put the Settings pages on the first screen (D-43).
- Name tests after the AC they prove (`AC-36.1 moves to .coffer-trash without confirmation`).
- Read-only connections: gate write actions with the shared capability helper, disabled with the reason `ro.reason`, never silently missing.
- Mutations that touch many objects go through the journal in `lib/storage` (FR-45).
- Render bucket data only through text nodes or the safe renderers in `preview/`.
- Copy keys come from `copy.en.json`; add missing ones to the additions file, not inline. Wrap the feature's route in `CopyBoundary` with the groups it uses (they are separate chunks, not in the first bundle).
