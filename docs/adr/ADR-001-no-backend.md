# ADR-001: No backend, no database

- **Status:** Accepted (Draft docs)
- **Date:** 2026-11-21
- **Related:** G-3, G-8, NFR-1, NFR-8 in [product-spec.md](../product-spec.md); [technical-spec.md](../technical-spec.md#1-architecture-overview)

## Context

Coffer manages files in the user's own S3-compatible bucket. A server in the middle (a signing proxy, a session store, a search index) would see credentials or file names, need operating and securing, and turn a static site into a service.

## Decision

Coffer is a static site on Cloudflare Pages. The browser signs requests with keys the person enters and talks directly to the provider. There are no Functions, no database and no accounts. All state lives in the browser (IndexedDB, localStorage, memory) or in the bucket (including the `.trash/` prefix).

## Consequences

- Keys never reach Coffer's host; the trust boundary is the browser and the provider.
- The provider must allow the browser: CORS is required and is the largest setup risk (see FR-6).
- No server-side search, sharing registry or link revocation; links are presigned and cannot be revoked early.
- No cross-device sync of starred items, recent files or saved connections.
- Hosting and operations stay near zero.

## Alternatives considered

- **Signing proxy (serverless function):** removes CORS pain but holds or sees credentials; rejected.
- **Self-hosted server:** more features, much more to run and secure; rejected as a different product.
