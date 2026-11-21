# src/lib/s3/

The only module that imports the AWS SDK. No UI imports (no React, no `components`, no `features`). Layer rules are in [../../AGENTS.md](../../AGENTS.md); behavior is in [technical-spec](../../../docs/technical-spec.md) sections 4 to 7.

## Client factory

- One `S3Client` per connection, built by `createClient(profile, vault)`.
- Always set `requestChecksumCalculation: "WHEN_REQUIRED"` and `responseChecksumValidation: "WHEN_REQUIRED"`.
- `forcePathStyle` from the addressing resolver (`path`, `virtual`, `auto` rules in the spec). Region from the preset's `RegionSpec`.
- Credentials are a function that reads the vault and throws `LockedError` when locked. Destroy the client on lock.
- Add no middleware that logs requests, URLs or headers.

## Connection test

- `connection-test.ts` runs the six steps and reports each through `onStep`. Pass a client made with `maxAttempts: 1` so a CORS block fails at once. A signed call that gets no response after the no-cors probe passed is CORS; otherwise it is a network failure.
- The test file is `{prefix}.coffer-test-<16 hex>.txt`. Write denied with list and read passing is `readOnly`; delete denied is `failed` (C-20, C-21).
- `cors.ts` builds the rule from the app origin only; it refuses `*`.
- `local-network.ts` reads Chrome's `loopback-network` and `local-network` permissions. `needsLocalNetworkPermission(page host, endpoint host)` is true only when the endpoint is more private than the page; the Permissions API answers "prompt" even for a localhost page reaching localhost. A failed reach while access is not granted is `localNetworkDenied`.

## Errors

- Catch SDK errors at this boundary and rethrow `AppError { code, retryable, status?, hint? }`. Never expose `error.message`, request URLs, signatures or headers.
- Detect CORS as: `no-cors` reach probe passed and the signed call rejected with `TypeError`.
- Read `suggestedRegion` and clock offset from error bodies or SDK offset, not from guesses.

## Operations

- Every UI action maps to the calls in technical-spec section 6.2; keep that table and the code in sync.
- Listing: `Delimiter: "/"`, `MaxKeys: 1000`, `EncodingType: "url"` (decode keys yourself, retry once without it). Skip the folder placeholder key. Hide the trash prefix in Files.
- Copy: `CopyObject` up to 5 GB, multipart `UploadPartCopy` above; keep content type and metadata.
- Delete: `DeleteObjects` in batches of 1,000 with a single-delete fallback.
- Upload: own orchestrator in `upload.ts` over SDK commands; do not use `lib-storage` ([ADR-009](../../../docs/adr/ADR-009-own-multipart-orchestrator.md)). Persist the upload id through the injected `UploadStateStore` before the first part; abort on error and cancel; export `abortUpload` for the app's abort-on-load.
- Never delete a source before the copy is verified (the journal in `lib/storage` calls these in order).
- Trash key: `{root}.trash/{batch}/{original key}` with `{root}` the connection's start folder; the batch is created once per operation. Restore strips it. Never overwrite trashed items.
- Entry points refuse to run while the vault is locked unless the caller holds a credential lease.
- The connection-test file goes under `{root}` (start folder) when set, else the bucket root.

## Presigning

- `maxSeconds = min(604800, token seconds left - 60)`; refuse longer. Sign with the learned clock offset.
- Never log or persist a presigned URL.

## Tests

Unit tests with a fake handler; integration tests against the local S3 fixture in `tests/integration`.
