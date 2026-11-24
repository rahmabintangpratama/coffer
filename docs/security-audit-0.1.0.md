# Security audit for Coffer 0.1.0

- **Purpose:** the result of the pre-release security audit: what was reviewed, what was found, what was fixed, and what is left for the owner, with severity and rationale.
- **Status:** Draft (source review complete; the items marked "needs validation" wait for owner checks in [manual-test-plan.md](manual-test-plan.md)).
- **Last updated:** 2026-11-24
- **Source files in `design/`:** [SECURITY-DESIGN.md](../design/SECURITY-DESIGN.md) (read only)
- **Related:** [release-checklist.md](release-checklist.md), [technical-spec.md](technical-spec.md) section 11, [ADR-005](adr/ADR-005-encrypted-local-vault.md), [open-questions.md](open-questions.md)

## 1. How the audit was run

- **Method:** the Cloudflare `security-audit` skill, `quick` profile, full audit mode: four independent read-only reviewers, one per surface, then the lead checked every candidate against the source before accepting, rejecting or recording it.
- **Surfaces:**
  1. vault, storage, tab sync and Forget (`src/lib/storage`, `src/app/session.ts`, onboarding, vault UI);
  2. S3 client, endpoint validation, providers, presigning, CSP and headers (`src/lib/s3`, `src/lib/providers`, `public/_headers`, `index.html`);
  3. rendering of untrusted bucket data, file operations, trash and restore (`src/features/preview`, `files`, `trash`, `operations`);
  4. build, CI, dependencies and scripts (`.github`, `package.json`, `scripts`, `vite.config.ts`, git history).
- **Scope exclusions:** `design/`, third-party library internals (no CVE review beyond `pnpm audit`, which CI runs), and anything that depends on the deployed host or on a real provider.
- **Source revision:** commit `5cd6702` plus the uncommitted M10 phase A changes.
- **Sandbox: not available in this run.** Claude Code's sandbox was not active in the session (a write outside the project and an outbound request both succeeded), and the skill's rules forbid running target code without it. So **no target code was executed for the audit**: every result below comes from reading the source. Findings the source could settle were confirmed by reading and then fixed with a regression test (these tests ran after the fix, in the normal unit-test environment, against fake IndexedDB). Everything that needs a running provider, browser or deployment is recorded as **needs validation**, not as confirmed. No live endpoint was contacted. The local S3 fixture was not needed.
- **Coverage statement:** one pass over four surfaces. It is not exhaustive. Not read in depth: `src/lib/s3/upload.ts` and the transfer queue policy, `journal-store.ts`, the connection switcher, and the remaining onboarding screens. The skill's JSON record files and validators were not produced, so this document is the record; `run_status` is `incomplete` for that reason.

## 2. Summary

| ID | Title | Result | Severity |
|---|---|---|---|
| S-1 | Stored endpoint was outside the vault's authentication | Fixed | Medium |
| S-2 | Restoring a folder row overwrote existing keys without asking | Fixed | Medium |
| S-3 | A lock during an unlock or first save could keep the key | Fixed | Low |
| S-4 | Signed requests follow redirects | Needs validation | none yet |
| S-5 | Listing keys are decoded without checking the response says they were encoded | Needs validation | none yet |
| S-6 | Forget this device can report success while another tab holds the database | Recorded | Low |
| S-7 | Removing one connection leaves its transfers and local records until Forget | Fixed ([C-55](open-questions.md)) | Low |
| S-8 | Memory-only connections never auto-lock | Accepted by design | n/a |
| S-9 | Download anchor navigates to the presigned URL if the provider ignores `attachment` | Needs validation | none yet |
| S-10 | Bidirectional-text characters in object names are not isolated everywhere | Fixed | Low |
| S-11 | A rendered HTML preview can leak DNS and preconnect hints | Needs validation | none yet |
| S-12 | Object keys with `.` or `..` segments cannot be previewed or moved | Recorded | Informational |
| B-1 | Test-only build switches would ship if set in the Pages dashboard | Mitigated by a check in the deploy steps | Informational |
| B-2 | Pages builds branches with default lifecycle behaviour | Recorded | Informational |
| H-1 | `connect-src https:` and `img-src https:` allow any HTTPS destination | Accepted trade-off (documented) | n/a |

No critical or high finding. No confirmed finding is left unresolved.

## 3. Fixed findings

### S-1: stored endpoint outside the vault's authentication (medium)

- **Boundary:** the IndexedDB `connections` store versus the vault's authenticated encryption. Only the keys were sealed. The AAD was `coffer-v1|<profile id>`, so `endpoint`, `region`, `bucket` and `addressingStyle` were plain and unauthenticated, and the stored endpoint was used on unlock without validation.
- **Result:** someone who can write the site's IndexedDB (a malicious browser extension, or access to the profile on disk) could change `endpoint` to their own HTTPS host. After the owner typed the passphrase, signed requests would go to that host. The secret key stays safe (SigV4 sends a signature, not the secret), but the access key ID, the object data and, for temporary credentials, the `X-Amz-Security-Token` header (a bearer token until it expires) would leak.
- **Why medium and not higher:** it needs write access to the browser profile, and it does not reveal the secret key.
- **Fix:** the AAD now binds the profile id **and** the destination (`bindingOf` in `src/lib/storage/crypto.ts`: endpoint, region, addressing style, bucket, prefix). A record whose stored destination was changed no longer opens; unlock fails as a wrong passphrase and nothing is kept.
- **Compatibility:** records saved by a build before this change do not open and must be saved again. No release shipped yet, so there is nothing to migrate (D-49).
- **Test:** `M10 audit: a saved connection whose stored endpoint was changed does not open` in `src/lib/storage/vault-saved.test.ts`.

### S-2: Restore on a folder row overwrote existing keys (medium)

- **Boundary:** the conflict dialog (Replace, Keep both, Skip) versus what Restore did. A folder row in the Trash was restored as a prefix move without checking the objects under it.
- **Result:** restoring a folder carried every object under it back and overwrote existing keys, even after the person answered Skip. Someone with write access to the bucket could also plant `.coffer-trash/<batch>/<folder>/...` objects so that a normal restore overwrote real files. The person still had to choose that row and press Restore.
- **Fix:** `planRestore` (`src/features/trash/restore.ts`) expands a selected folder row to the objects under it and checks each one like any other selection. A placeholder that has objects under it stays in the Trash once they are restored; an empty one goes back as itself; a whole batch with no clash still moves as one prefix.
- **Test:** `src/features/trash/restore.test.ts` (AC-70.3 and the audit case).

### S-3: a lock during an unlock or first save could keep the key (low)

- **Result:** key derivation takes about half a second. A lock or Forget message that arrived in that window was undone when the derivation finished: the key and the decrypted keys were set again while the screen said Locked.
- **Fix:** the vault counts locks and unlock and save stop with `LockedError` when a lock happened since they began (`lockEpoch` in `src/lib/storage/vault.ts`).
- **Test:** two tests in `vault-saved.test.ts` (`M10 audit: a lock that lands while an unlock...`, `...during a first save`).
- **Severity:** low. The window is short and the person typed the passphrase in that tab.

### S-7: Remove connection left its transfers and rows (low, fixed)

- **Result:** `vault.remove` deleted the sealed profile only. Its running transfers kept their lease, and its journal, upload, starred and recent rows (object keys, endpoint, bucket in the clear) stayed until Forget this device.
- **Fix:** the owner decided ([OQ-37](open-questions.md#oq-37-what-remove-connection-deletes), [C-55](open-questions.md)): Remove is blocked by an unfinished move, then stops the connection's transfers, aborts its incomplete multipart uploads (best effort, counts shown) and deletes its rows in one transaction. Commit [d471a50](https://github.com/rahmabintangpratama/coffer/commit/d471a5049606b1602828a4fc52a33a89a39cdc70).
- **Test:** `tests/integration/connection-removal.test.ts`, `tests/e2e/remove-connection.spec.ts`, the Connections tests in `SecuritySettings.test.tsx`, and two lease tests in `vault-saved.test.ts`.

### S-10: bidirectional and invisible characters in names (low, fixed)

- **Result:** `FileRow` isolated names, but the preview header, breadcrumb, dialogs, toasts, transfer panel and the download file name did not. A name like `invoice<U+202E>fdp.exe` could be drawn as `invoiceexe.pdf`.
- **Fix:** every name is drawn in an isolated bidi context (`<bdi>`, or U+2068 ... U+2069 around the values `t()` fills in and in `title` and `aria-label`). Details, Rename, Make a copy and the delete confirmations show each hidden character as `⟨U+202E⟩` with a warning, and the download name has them stripped. Commit [f043426](https://github.com/rahmabintangpratama/coffer/commit/f043426d7887a42428d021af16beb39655531e3d).
- **Test:** `src/lib/names.test.ts`, `src/components/HiddenCharsNotice.test.tsx`, `tests/e2e/hidden-names.spec.ts` (RLO, LRO, RLI and zero-width names: the extension stays last in the list, and Details, Rename and Delete forever show the stored order).

## 4. Needs validation (no severity until confirmed)

| ID | Missing fact | How to check | If confirmed |
|---|---|---|---|
| S-4 | Does any provider answer a signed request with a cross-origin redirect, and does the browser then send `x-amz-security-token` to the target? The client leaves `fetch` at `redirect: "follow"` (`src/lib/s3/client.ts:30`). Secret key and signature are not exposed; `Authorization` is dropped by `fetch` on a cross-origin redirect. | Provider matrix run; local check with a dummy server that answers 307 to another loopback port. | Set `redirect: "error"`, or `"manual"` with a same-provider allowlist. Not changed now because some providers redirect legitimately between regions, and the rules say not to guess provider behaviour. |
| S-5 | Does every provider honour `EncodingType=url`? `decodeS3Key` decodes without checking `response.EncodingType`. A provider that ignores it and has `a%20b.txt` next to `a b.txt` would show the wrong names, and delete or move could hit the wrong object. | Manual test **core-15a** on each provider. | Decode only when the response says `url`, after checking that every supported provider sends the field. |
| S-9 | Does any provider ignore `ResponseContentDisposition=attachment`? The download link has no `download` attribute (`src/features/files/download.ts`). The URL lives 60 seconds. | Provider matrix, download step. | Open the link from a hidden frame or set `download`. |
| S-11 | Does a rendered HTML preview leak `dns-prefetch` or `preconnect` despite `sandbox=""` and `default-src 'none'`? Needs a click on "Render in sandbox". | Chrome and Safari with a local DNS listener. | Strip `<link>` elements from the source before render, or keep the view source-only. |

## 5. Recorded, not fixed

- **S-6 (low).** `forgetDevice` swallows a blocked database delete and shows success; a tab running an older cached build that does not close its handle keeps the sealed records until it closes. After Forget the page reloads to Welcome. Only the encrypted records remain, and the `coffer:saved` hint is cleared. Fix when it matters: report "Some data could not be removed" when the delete is still blocked after the timeout. Not blocking: an old build cannot exist before the first release.
- **S-8 (accepted).** A connection whose keys are only in memory does not auto-lock; nothing is stored, and a reload drops it. Documented in the vault header.
- **S-12 (informational).** Keys with `.` or `..` segments (made by other tools) are normalised by the URL parser, the SigV4 signature then fails, and preview, download and moves of that object are blocked. No path to another object was found, because the signature binds the key.
- **B-1 (informational).** `VITE_COFFER_LOAD_ALL_CAP` and `VITE_COFFER_AUTOLOCK_TEST_MS` are baked in at build time. They cannot be set at run time from a URL, hash or storage. They would ship only if someone set them in the Pages dashboard (the auto-lock would become milliseconds). The deploy guide now says the only variable is `NODE_VERSION` and adds a check.
- **B-2 (informational).** Preview deployments run the build for every branch. A malicious change to `package.json` would run in that build, which holds no secret (only `NODE_VERSION`). Single-owner repository: no action.
- **H-1 (accepted).** `connect-src https:` and `img-src https:` must stay broad, because the endpoint is the user's own and unknown in advance. If any script-execution bug appeared, this would be the exfiltration channel. The other directives (`script-src 'self'`, no inline script, `base-uri 'none'`, `form-action 'none'`, `frame-src 'none'`) are what close the way in.

## 6. Reviewed and found sound

- **Vault crypto.** PBKDF2-SHA-256 at 600,000 iterations, 16-byte salt, non-extractable AES-GCM-256 key, a fresh IV per record, bounded iteration count on read, no plaintext in storage, the key never posted between tabs.
- **Tab sync.** Messages carry a type and a flag, never a secret; only same-origin contexts can send.
- **Presigned links.** Signed locally, never logged (there is no `console.*` in `src`), kept only in component state or a media element; `Referrer-Policy: no-referrer`; the file name in `Content-Disposition` is encoded.
- **Endpoint handling.** Templates end in a fixed provider suffix; host fields reject `/`, `:`, `@`, `#` and `?`; plain http only for loopback; userinfo, query and fragment rejected.
- **Rendering of bucket data.** No `dangerouslySetInnerHTML`, `innerHTML`, `eval` or `document.write`. HTML is shown as source or in a sandboxed frame with `default-src 'none'`; SVG only as `<img>`; Markdown with `html: false` and a DOMPurify allowlist; the PDF worker is local.
- **Errors.** `AppError` keeps a code, status and request ID, never a message or URL.
- **Build and CI.** Actions pinned by SHA, read-only token, no `pull_request_target`, no secrets in workflows, exact dependency versions, no dependency install scripts, no source maps, an allowlist for `dist/`, no real credentials in the tree or history (one obvious fake in a paste-parser test).
- **Antislop pass.** UI copy has no em dashes, buzzwords or generic call-to-action labels; interactive controls keep a replacement focus indicator wherever the default outline is removed. The icon set (Lucide) and the selected-row stripe come from the approved design.

## 7. What the owner should do

1. Run manual test **core-15a** on every provider (settles S-5), and watch the redirect and download behaviour while doing the matrix (S-4, S-9).
2. S-7 and S-10 are decided and fixed (above); no owner decision is left from this audit.
3. Optionally rerun this audit with the sandbox enabled (`/sandbox` in Claude Code, then restart the session) if you want the skill's executed checks and JSON records.
