# ADR-005: Encrypted local vault

- **Status:** Accepted (Draft docs)
- **Date:** 2026-11-21
- **Related:** FR-8, FR-9, FR-10, FR-102, NFR-1 in [product-spec.md](../product-spec.md); [technical-spec.md](../technical-spec.md#9-credentials-and-vault); `design/SECURITY-DESIGN.md`

## Context

People do not want to re-enter keys on every visit, but keys stored in plain browser storage are readable by anything running on the origin and by anyone with the device. There is no server to hold or wrap them.

## Decision

Offer two modes. **Memory only**: keys live in a module-scoped map and disappear on reload. **Saved**: keys are encrypted with AES-GCM (256-bit, non-extractable `CryptoKey`) under a key derived from a passphrase with PBKDF2-HMAC-SHA-256 at **600,000 iterations or more**, a 16-byte random salt, a fresh 12-byte IV per record and authenticated data bound to the profile id. One passphrase protects all saved profiles and they share one salt, so unlock derives once. Auto-lock (default 15 minutes), manual lock, a reveal flow that needs the passphrase again, and "Forget this device" complete the model. The passphrase must be at least 12 characters (saving is blocked below that) with an advisory hint at 16 or more; it is never stored and cannot be recovered.

**Lock and running transfers (owner decision C-27).** Locking clears the vault's decrypted credentials and cached key and blocks every new operation. Uploads and background operations that are already running keep going with a private credential lease (a copy held by that task plus a dedicated client) and release it when they finish or fail. Queued transfers hold no lease and wait for unlock.

## Consequences

- Protects against casual access to storage and against theft of an IndexedDB dump without the passphrase.
- Does not protect against malware or extensions on the device, an XSS bug while unlocked, or a weak passphrase guessed offline. The UI and About say so.
- PBKDF2 is chosen because it is in Web Crypto everywhere; memory-hard KDFs would need a library or WASM and are a possible later upgrade (the record stores `kdf` and `v`).
- Iteration count can rise over time; records store their own count and are re-encrypted when raised.
- Unlock takes a perceptible moment on slow phones; the UI shows progress.
- Lock is not an instant wipe while transfers run: leased credentials stay in memory until those transfers end. The window is bounded by the transfers' duration, closing the tab ends it, and "Forget this device" always cancels transfers. The Locked screen shows a banner with the number of running transfers and a secondary button "Stop transfers and lock" that cancels them and releases the leases at once (C-38).

## Alternatives considered

- **No persistence:** safest, worst experience; kept as the "Not now" option.
- **Plaintext in IndexedDB:** rejected.
- **WebAuthn PRF or passkey-wrapped keys:** attractive, but inconsistent browser support; revisit later.
- **Argon2 via WASM:** stronger, adds a dependency and WASM CSP needs; revisit later.
