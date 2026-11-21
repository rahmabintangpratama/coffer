# ADR-007: Local data placement

- **Status:** Accepted (Draft docs)
- **Date:** 2026-11-21
- **Related:** FR-10, FR-80, FR-81, FR-100, NFR-1 in [product-spec.md](../product-spec.md); [technical-spec.md](../technical-spec.md#115-local-data-inventory); `design/SECURITY-DESIGN.md` section 5

## Context

The design inventory says Starred and Recent live in "localStorage or IndexedDB" and Settings in localStorage. "Forget this device" must be provably complete, and the theme must be known before first paint.

## Decision

- **IndexedDB** (database `coffer`, via `idb`): encrypted connections, operation journal, upload state, starred, recent. These are structured, keyed per connection and bucket, and can be deleted by dropping one database.
- **localStorage** (keys prefixed `coffer:`): `coffer:settings` and `coffer:theme` only. They are small, non-sensitive and must be read synchronously by `theme-init.js` before first paint.
- **Memory:** unlocked credentials and session state.
- Nothing else is stored. Any new storage location must be added to the data inventory, to "What's stored on this device" and to Forget this device in the same change; a test enumerates the inventory.

## Consequences

- Forget this device is `deleteDatabase` plus removal of the `coffer:` keys plus clearing session state.
- Starred and recent entries are keyed by `connectionId`, `bucket` and `key`; removing a connection removes its entries.
- The schema is versioned with `idb` upgrade steps; migrations are additive and tested.
- Starred and recent are not encrypted (key names only); the UI says so.

## Alternatives considered

- **Everything in localStorage:** simple, but synchronous, size-limited and awkward for structured per-connection data.
- **Everything in IndexedDB:** theme would flash on first paint without a synchronous read.
