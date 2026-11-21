# src/lib/storage/

Vault, operation journal, upload state and IndexedDB. No React imports; must not import `lib/s3`. Layer rules are in [../../AGENTS.md](../../AGENTS.md); behavior is in [technical-spec](../../../docs/technical-spec.md) sections 7 to 9 and [ADR-005](../../../docs/adr/ADR-005-encrypted-local-vault.md).

## Vault

- PBKDF2-HMAC-SHA-256, **at least 600,000 iterations**, 16-byte random salt, non-extractable AES-GCM-256 key, fresh 12-byte IV per record, AAD `coffer-v1|<profile id>`.
- Normalize the passphrase (NFKC). Never store the passphrase or the raw derived key.
- One salt for all profiles; cache the `CryptoKey` in memory while unlocked.
- Decrypted credentials live in a closure-scoped map here and nowhere else.
- `lock()` clears the map and key, then emits a lock event. Reveal re-derives from a freshly typed passphrase.
- Passphrase: at least 12 characters (block saving below it); advisory hint at 16 or more; no estimator library.
- Running transfers keep a private credential lease and a dedicated client until they end; queued ones acquire a lease only at start, which throws `LockedError` while locked. Release leases on finish, failure, cancel and Forget.
- Never persist a `credentials: { storage: "memory" }` profile.

## Journal and uploads

- Write the journal entry **before** the first request. Order per object: copy, verify, delete. Persist progress as in technical-spec section 8.
- A trash entry stores its batch prefix (`.coffer-trash/{UTC timestamp}-{6 random chars}/`) when created; a resume reuses it. Never regenerate it.
- Resume re-lists from `cursor`; never trust in-memory state.
- Upload state stores `uploadId`, `partSize`, `partsDone`; never file bytes.
- Implement the `UploadStateStore` interface that `lib/s3` defines by shape; never import `lib/s3`.
- MVP has no resume: on load (after unlock) `src/app` aborts every stored multipart upload through `lib/s3` (`abortUpload`) and marks the task `interrupted`, dropping records whose connection is gone. This module only stores and returns records. Resume is v1.

## IndexedDB

- Database `coffer`, opened through `idb`. Stores: `connections`, `journal`, `uploads`, `starred`, `recent`, `meta`.
- Schema changes are additive `upgrade` steps with a test that opens each older version and migrates it. Never drop data silently.
- Settings live in `localStorage` keys `coffer:settings` and `coffer:theme` ([ADR-007](../../../docs/adr/ADR-007-local-data-placement.md)).

## Forget this device

- Removes: running transfers and their leases, pending timers and clients, database `coffer` (close handles first), every `localStorage` key prefixed `coffer:`, `sessionStorage`, Cache Storage and service workers if present, in-memory vault and query cache.
- Keep a single inventory list of storage locations; a test fails when a location exists that Forget does not clear.
