# ADR-002: AWS SDK v3 with `WHEN_REQUIRED` checksums

- **Status:** Accepted (Draft docs); partly superseded by [ADR-009](ADR-009-own-multipart-orchestrator.md): `@aws-sdk/lib-storage` is not used
- **Date:** 2026-11-21
- **Related:** FR-5, FR-41, NFR-10 in [product-spec.md](../product-spec.md); [technical-spec.md](../technical-spec.md#61-client-factory)

## Context

Coffer needs correct SigV4 signing, XML parsing, retries, multipart and presigning against 21 providers. Recent SDK v3 versions add default CRC checksums to requests and validate responses; several S3-compatible services reject or mishandle those headers.

## Decision

Use `@aws-sdk/client-s3`, `@aws-sdk/lib-storage` and `@aws-sdk/s3-request-presigner` (modular imports, v3). Every client sets `requestChecksumCalculation: "WHEN_REQUIRED"` and `responseChecksumValidation: "WHEN_REQUIRED"`. Use the SDK's `FetchHttpHandler`. Wrap the SDK behind `src/lib/s3` so no other module imports it and SDK errors never leave that layer.

## Consequences

- Signing and protocol details are maintained upstream.
- The bundle is heavier than a hand-rolled signer, so the S3 chunk loads only after the person connects and has a budget (≤ 200 KB gzip).
- `DeleteObjects` still requires a checksum on the wire; a single-delete fallback covers providers that reject it.
- `lib-storage` cannot resume an existing multipart upload; a thin orchestrator over SDK commands handles resume for large files (v1).
- Upgrading the SDK means re-running the provider compatibility matrix.

## Alternatives considered

- **Hand-rolled SigV4 plus `fetch`:** smallest bundle, but ownership of a security-sensitive protocol and error parsing; rejected.
- **`aws4fetch` or similar:** small, but no multipart, XML or retry layer and a different maintenance risk; rejected for MVP.
