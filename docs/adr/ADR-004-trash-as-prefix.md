# ADR-004: Trash as the `.coffer-trash/` prefix, one batch per operation

- **Status:** Accepted (Draft docs); revised by owner decisions C-19 and D-45
- **Date:** 2026-11-21
- **Related:** FR-36, FR-70, FR-71, NFR-9 in [product-spec.md](../product-spec.md); [technical-spec.md](../technical-spec.md#8-operation-journal); C-19 and D-18, D-19 in [open-questions.md](../open-questions.md)

## Context

Delete must be recoverable (G-5) without a backend. Object versioning is not available on every provider and is not something Coffer administers. A first draft moved `K` to `.trash/K` and replaced an older trashed copy of the same key; the owner rejected overwriting trashed items.

## Decision

Trash is a key prefix in the same bucket, under the connection root (`{root}` is the start folder, or empty for the bucket root).

- **Move to trash** moves each item to `{root}.coffer-trash/{batch}/{original key}`, where `{original key}` is relative to `{root}` and `{batch}` is `{UTC timestamp}-{6 random chars}`, for example `20261121T143005Z-a3k9xz`. The timestamp is `YYYYMMDDTHHMMSSZ`; the suffix is six lowercase base-36 characters from `crypto.getRandomValues`.
- **One batch per operation.** All items trashed by one operation share one batch prefix. The batch id is generated once, before the first request, and stored in the journal entry, so a resumed operation reuses it. Trashing is copy, verify, delete through the journal.
- **Nothing is overwritten.** Two operations never share a batch, so trash collisions are impossible, including the same key trashed twice.
- **Deletion time** is read from the batch prefix, not from `LastModified`.
- **Restore** strips `{root}.coffer-trash/{batch}/` and moves the object back to `{root}{original key}`. If that key now exists, the conflict dialog (Replace, Keep both, Skip) decides.
- **Trash view** lists everything under `{root}.coffer-trash/` without a delimiter, so batches are flattened to items; each row shows the original path and the deletion time. Items are sorted by deletion time, newest first.
- **Undo** of a trash operation moves the same batch back.
- **Only our own format counts.** Coffer lists, restores and deletes only keys matching `{root}.coffer-trash/YYYYMMDDTHHMMSSZ-xxxxxx/...`. Anything else under that prefix is ignored: never listed as trash, never deleted by Empty trash or Delete forever.
- The `.coffer-trash/` prefix is hidden from Files, search and folder usage regardless of `showHiddenFiles`. Empty folders are trashed with their placeholder object. There is no automatic purge; the Trash note says items stay until emptied.

## Consequences

- Trash grows until emptied and costs storage; users can add a lifecycle rule at the provider for `.coffer-trash/`, which Coffer mentions but does not set.
- Trash is per bucket (or per start folder) and visible to anyone with access, including other tools.
- Trashing a prefix is many copy and delete operations, hence the journal.
- Keys carry up to 1,024 bytes; the trash prefix adds about 30, so near-limit keys can fail to trash with a clear message instead of being truncated.
- The name is specific to Coffer so it does not collide with a user's own `.trash/` folder, which Files shows like any other folder. An object someone else put under `.coffer-trash/` outside the batch format is invisible to Coffer and survives Empty trash.
- A prefix-scoped key can trash only inside its own start folder, which is why Trash lives under `{root}`.

## Alternatives considered

- **`.trash/{original key}` with overwrite:** rejected by the owner; loses older copies.
- **Suffixing on collision:** needs existence checks and renames; the batch prefix is simpler and race-free.
- **Bucket versioning and delete markers:** not universal, needs bucket-level settings; rejected.
- **A local-only trash list:** items would be gone from the bucket but not recoverable on another device; rejected.
- **A separate trash bucket:** needs a second bucket and permissions; rejected.
