# ADR-009: Own multipart upload orchestrator instead of `lib-storage`

- **Status:** Accepted (Draft docs); supersedes the `lib-storage` part of [ADR-002](ADR-002-aws-sdk-v3.md)
- **Date:** 2026-11-21
- **Related:** FR-40, FR-41, FR-42, FR-44 in [product-spec.md](../product-spec.md); [technical-spec.md](../technical-spec.md#7-upload-pipeline); C-43 and C-45 in [open-questions.md](../open-questions.md)

## Context

The first plan used `@aws-sdk/lib-storage` for MVP uploads and a custom orchestrator for resume in v1. That needs a client middleware to learn the `UploadId` (the library does not expose it through a stable public API), two upload code paths, and a rewrite when resume arrives. The MVP must abort interrupted multipart uploads on reload (C-43), which needs the `UploadId` stored before the first part is sent.

## Decision

Write one small orchestrator in `src/lib/s3/upload.ts` over SDK commands and do not depend on `lib-storage`:

- Below 16 MiB: one `PutObject`.
- From 16 MiB: `CreateMultipartUpload`, persist the `uploadId` through an injected `UploadStateStore` before the first part, `UploadPart` for each `Blob.slice` through the shared request pool with an `AbortSignal`, record each part number and `ETag`, then `CompleteMultipartUpload` with sorted parts. Errors and cancels call `AbortMultipartUpload` and delete the record.
- MVP behavior stays as in C-43: no resume UI; on the next load, stored uploads are aborted and shown as interrupted.
- v1 resume (FR-42) adds `ListParts` reconciliation on the same code.
- The store interface keeps `lib/storage` free of `lib/s3` imports.

## Consequences

- No `UploadId` middleware, no private-field access, and no second upload path to rewrite for resume.
- Smaller S3 chunk (no `lib-storage`).
- Coffer owns part slicing, concurrency, retries on top of the SDK strategy, abort and ordering, so these need focused unit tests with a fake client and integration tests against MinIO.
- Progress is per finished part, not per byte; with 8 MiB parts this is smooth enough, and the UI states percentages from completed bytes.
- SDK upgrades no longer change upload behavior except through the commands themselves.

## Alternatives considered

- **`lib-storage` plus an `UploadId` middleware:** workable but fragile across SDK versions; rejected by the owner.
- **`lib-storage` with a private field read:** depends on internals; rejected.
- **`lib-storage` for small files and an orchestrator for large ones:** two paths for no gain; rejected.
