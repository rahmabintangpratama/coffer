# Coffer MVP implementation plan

- **Purpose:** Split the MVP into milestones of one to three days. Each milestone lists its requirements, deliverables, tests and an exit check that can be demoed.
- **Status:** Approved. M0 to M9 are complete (2026-11-22). M10 phase A (everything that needs no accounts or devices) is complete (2026-11-22); phase B (provider matrix, real devices, screen readers, deploy, sign-off) is the owner's, in [manual-test-plan.md](manual-test-plan.md) and [release-checklist.md](release-checklist.md).
- **Last updated:** 2026-11-21
- **Source files in `design/`:** [`HANDOFF.md`](../design/HANDOFF.md), [`screens.md`](../design/screens.md), [`components.md`](../design/components.md), [`tokens.json`](../design/tokens.json)
- **Related:** [product-spec.md](product-spec.md) (FR, AC, release plan), [technical-spec.md](technical-spec.md), [open-questions.md](open-questions.md)

## How to read this plan

- Milestones run in order. Each builds on the previous ones and ends in a working, demoable state with CI green.
- "Day" means one focused engineer-day. Estimates assume the repository and decisions in `docs/` as they are today. A buffer is listed at the end and is not part of any milestone.
- Where one milestone in the requested order would exceed three days, it is split (M2a/M2b, M5a/M5b, M6a/M6b) without changing the order.
- FR and AC IDs come from the product spec. A milestone is done only when every AC it lists has a test named after it.
- **AGENTS.md commands:** every command in the root `AGENTS.md` is marked TBD today. Each milestone below lists the commands that land in it, and the same change removes their `TBD` marks. No command is documented before it exists.
- **Scope recorded as C-44:** Markdown preview (FR-55) and HTML as source with sandbox (FR-56) are in MVP. The demo workspace (FR-120) stays v1, and `Explore with sample files` is hidden in MVP.

## Overview

| Milestone | Days | Requirements | Exit check in one line |
|---|---|---|---|
| M0 Scaffold, CI, tokens, headers, S3 fixture | 3 | NFR-2, NFR-11, NFR-12 (plumbing) | Clean clone passes typecheck, lint, tests, token check, build, header check, S3 fixture smoke test |
| M1 App shell, routing, theme, copy loader | 2 | FR-22, FR-100 (theme), NFR-6, NFR-11 | Container resize switches nav; theme switches without flash |
| M2a Provider engine and connection test | 2 | FR-3, FR-4, FR-5, FR-12, FR-110 (detection) | Connection test returns ok, readOnly and cors outcomes against the local S3 fixture |
| M2b Onboarding screens | 3 | FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-12, FR-110 (offer) | Connect to the local S3 fixture in the browser; fix a CORS failure from the helper |
| M3 Browse and virtualization | 3 | FR-20, FR-21, FR-22, FR-23, FR-24, FR-27, FR-30, FR-31, FR-37, FR-130 | Browse a 10,000-object bucket at three widths; download a file |
| M4 Upload and transfer panel | 3 | FR-35, FR-40, FR-41, FR-43, FR-44 | Upload 500 MB with progress; reload leaves no incomplete upload |
| M5a Preview core types | 2 | FR-50, FR-51, FR-52, FR-54, FR-57, FR-58 | Preview image, video, audio, code and SVG with prev/next |
| M5b Preview PDF, Markdown, HTML | 2 | FR-53, FR-55, FR-56 | Hostile fixtures stay inert; PDF renders from a lazy chunk |
| M6a Journal, copy, rename, move | 3 | FR-32, FR-33, FR-34, FR-45 | Kill the tab mid folder-move; Resume completes with no loss |
| M6b Trash, restore, delete forever, undo | 2 | FR-36, FR-70, FR-71 | Trash, undo, restore and empty with typed count |
| M7 Share links | 2 | FR-60, FR-61 | A link downloads, then stops after expiry; token cap disables long choices |
| M8 Vault, save on device, lock | 3 | FR-8, FR-9, FR-10, FR-11, FR-101, FR-102 | Saved keys are ciphertext; lock mid-upload finishes it; Forget leaves nothing |
| M9 Settings and read-only mode | 2 | FR-100, FR-101, FR-111 | Read-only key shows reasons on every disabled action; settings persist |
| M10 Hardening and release gate | 3 | NFR-1 to NFR-12 verification | Release checklist signed; security audit findings resolved or recorded |

Total: 35 days plus buffer. Every MVP FR in the product spec appears in at least one milestone (checked when this plan was written).

---

## M0: Scaffold, CI, token generator, headers, S3 fixture (3 days)

**Status: complete.** Deviations from this plan (all logged in `docs/open-questions.md`): the S3 fixture is RustFS 1.0.6 instead of MinIO because the official MinIO images are no longer published; it was chosen after testing candidates against the fixture criteria (C-48); TypeScript is pinned to 6.0.3 because `typescript-eslint` does not support TypeScript 7 yet; the generated token CSS differs from the design CSS in one place, an undefined custom property in the design file (DC-25, resolved by the generator).

**Requirements:** NFR-2 (headers), NFR-11 (copy-key check skeleton), NFR-12 (token tooling). No FR.

**Deliverables**
- Vite, React and TypeScript (`strict`) project with pnpm (enable through Corepack if `pnpm` is missing), `.nvmrc` for Node 22 LTS, exact-pinned dependencies and a committed lockfile. A short `README.md`.
- Tailwind v4 and shadcn/ui setup that consumes the generated token CSS (no `components.json` colors of its own).
- ESLint with `typescript-eslint` strict, `no-restricted-imports` encoding the layer rules in `src/AGENTS.md`, a ban on `console` outside a logger, a ban on `dangerouslySetInnerHTML`, and rules against color and size literals.
- Vitest with Testing Library and `jest-axe`; Playwright with Chromium and WebKit projects at 375, 768 and 1440.
- `scripts/tokens/`: the DTCG to CSS generator ([ADR-008](adr/ADR-008-token-generator.md)) writing `src/styles/tokens.css` and `src/styles/tailwind.css`, plus a golden test against `design/tokens.css` and `design/tailwind.css`. Scripts `tokens:build` and `tokens:check`.
- `design/types.ts` copied once to `src/lib/types.ts`, which is then the canonical contract (C-46). There is no check that the two match; the differences from the origin (T-1 to T-8) are applied in M2a and later and are listed in technical-spec 3.
- `public/_headers` exactly as in technical-spec 11.2, and a `headers:check` script that parses it and asserts every directive.
- `tests/integration/docker-compose.yml`: a local S3 fixture (RustFS) with fixed fake credentials; one smoke integration test (ListBuckets, put, get, delete through the AWS SDK) and a capability suite for what Coffer needs (per-bucket CORS, multipart, `UploadPartCopy`, listing with `EncodingType=url`, presigned GET, `DeleteObjects`, per-user policies).
- `copy:check` script: merges `copy.en.json` with `copy.additions.en.json` and fails when code references an unknown key (starts trivial, grows with the code).
- CI workflow (GitHub Actions unless the owner names another system) running install with `--frozen-lockfile`, typecheck, lint, copy check, token check, unit tests, S3 fixture integration, build, header check, `pnpm audit --prod` and a Chromium plus WebKit smoke e2e.

**Tests:** golden token test; header parser test; S3 fixture smoke; one component test with axe; one e2e "hello" at the three viewports in two browsers.

**Exit check (demo):** from a clean clone, `pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test && pnpm tokens:check && pnpm build && pnpm headers:check` is green locally and in CI, and `docker compose up -d && pnpm test:integration` passes. Then edit a generated token CSS file by hand and show `pnpm tokens:check` failing.

**AGENTS.md commands landing:** install, dev, build, typecheck, lint, test, test:integration, test:e2e, start the S3 fixture, `tokens:build`, `tokens:check`, `copy:check`, `headers:check`. Remove their `TBD` marks and add `headers:check` to the table.

**Risk:** the golden test may need more than a day if the design CSS has hand-tuned details; if so, record the differences and split an M0b rather than loosen the test.

## M1: App shell, routing, theme, copy loader (2 days)

**Status: complete.** Differences from the plan below: modal layers use the native `<dialog>` instead of Radix Dialog or `vaul`, because Radix's scroll lock injects a style element that the CSP blocks (D-24); no app icon or favicon was shipped at M2a because the design had no logo (OQ-33); the search pill, New button, FAB and connection avatar are not drawn yet, so there are no dead controls (they arrive in M3, M4 and M8); the theme choice lives in a minimal Settings screen; the initial bundle was 128.9 KB gzip against the 120 KB budget, so the router became wouter and copy loads by feature group, giving 100.0 KB (C-50 to C-52).

**Requirements:** FR-22 (shells, hash routing), FR-100 (AC-100.2 theme), NFR-6, NFR-11.

**Deliverables**
- `main.tsx` with `.cf-root` and `.cf-app`; the three shells chosen by container width (bottom nav and FAB, rail, sidebar), `NavDrawer`, the More sheet; placeholder route screens.
- Hash routing with wouter and a typed route table (C-50); portal root inside `.cf-root`.
- Theme: setting System, Light, Dark; `public/theme-init.js`; live `prefers-color-scheme` updates.
- `src/lib/i18n`: merged copy loader, `intl-messageformat`, typed keys, the CI check wired to real usage.
- Base components: `Button` (all variants and states), `Sheet`, `Dialog`, `Toast` host, `Skeleton`, plus self-hosted IBM Plex fonts and `fonts.css`, manifest and icons.

**Tests:** e2e at 375, 768 and 1440 asserting the right shell and 44 px targets; theme tests (set before first paint, system change updates live, override persists); copy-key check fails on a missing key; axe on each shell in both themes; a console check for CSP violations against `vite preview` served with the real `_headers`.

**Exit check (demo):** resize the container and watch bottom nav, rail and sidebar switch; switch System, Light and Dark and reload with no flash; delete a copy key and show `copy:check` failing; show zero CSP violations in the console.

**AGENTS.md commands landing:** none new. Update the Conventions section if the lint rules differ from what it says.

## M2a: Provider engine and connection test (2 days)

**Status: complete.** Differences from the plan below: the CORS-versus-network check runs in real Chromium and WebKit against the S3 fixture, whose per-bucket CORS rules give real preflights, instead of Playwright route interception (stronger evidence); the harness page is served from a real loopback server because Chromium blocks requests from a page it did not load from the network to loopback (OQ-35, open); the test file name is 64 random bits with no collision check request; only T-5 and T-7 of the type changes were needed so far; `providers.json` is imported only by the (later, lazy) onboarding code, so it is not in the first bundle.

**Requirements:** FR-3 (engine), FR-4 (parser), FR-5 (algorithm), FR-12 (signing with a token, expiry sources), FR-110 (detection logic).

**Deliverables**
- `src/lib/providers`: load and validate `providers.json` (build-time checks from technical-spec 4), templating, region rules, addressing resolver, `expectedHostPattern` warning, paste parser (env, rclone, endpoint, `AWS_CREDENTIAL_EXPIRATION`).
- `src/lib/s3`: client factory with `WHEN_REQUIRED` checksums, `AppError` mapping, the connection test with step events, the CORS rule generator (JSON and XML), the read-only probe, test-file naming under the start folder, `ConnectionProfile.prefix`.
- Type changes T-1 to T-8 that this milestone needs.

**Tests (AC IDs in test names)**
- Unit, table-driven over all 21 presets: endpoint, region, addressing; paste fixtures including CRLF, quotes, `export`, bad input.
- Integration against the S3 fixture: ok; wrong secret (signature); wrong bucket; read-only user; delete-denied user (`failed` on clean); empty bucket read-only; start-folder prefix.
- Playwright route interception to separate `cors` from `network`; fake-handler tests for clock skew and wrong-region hints.

**Exit check (demo):** a script run prints the six steps for an ok, a readOnly and a CORS-failure case against the local S3 fixture, and a table shows endpoint, region and addressing for all 21 presets.

**AGENTS.md commands landing:** none new.

## M2b: Onboarding screens (3 days)

**Status: complete.** Differences from the plan below: the app mark and a brand kit landed first (C-53); a Connected screen with an `Open bucket` button replaces the automatic jump (D-31); a blocked bucket list asks for the name (D-28); the Welcome sample list is not built (D-30); Check again re-runs all steps (D-32); going back clears the secret fields (D-27); the local network pre-prompt, remediation and `localNetworkDenied` are built (C-54) and the private-IP spike kept the loopback-only rule (D-29, OQ-36). Input, Field, Segmented, Tabs and StepList are the shared components; no `Input` component is named in the design. The first-route JavaScript is 100.5 KB gzip (budget 120); onboarding is a 29 KB lazy chunk and the S3 client a 70 KB one.

**Requirements:** FR-1, FR-2, FR-3 (UI), FR-4 (UI), FR-5 (UI), FR-6, FR-7, FR-12 (token UI), FR-110 (offer screen).

**Deliverables**
- Screens `O10` (without the `Explore with sample files` button; demo is v1), `O20`, `O21`, `O30` to `O35`, `O40` to `O44`, `O50`; components `ProviderRow`, `ConnectionTest`, `EndpointPreview`, `HelpInline`, `ReadOnlyOffer`, `Banner`, `Tabs`, `Input`.
- The Advanced section: addressing, `Session token` and `Token expires at`, `Start in folder`.
- Memory-only session store holding the profile and keys; after connecting, the app lands on an empty Files placeholder. "Save on this device?" (`O51`) arrives in M8.
- A fixture bucket without a CORS rule for the CORS-failure path (CORS is set per bucket, so no second server is needed).

**Tests:** component tests per state; e2e at all three viewports for the R2 preset against the S3 fixture with a custom endpoint, CORS failure then fix, read-only offer, paste privacy (textarea cleared, nothing stored); keyboard-only run; axe; an assertion that no secret appears in the DOM, URL or storage.

**Exit check (demo):** connect to the local S3 fixture from the browser at 375 and 1440; use a bucket without a CORS rule, see the CORS helper with the exact origin, fix it, tap "Check again" and reach Connected; connect a read-only key and see the offer.

**AGENTS.md commands landing:** none new.

## M3: Browse and virtualization (3 days)

**Requirements:** FR-20, FR-21, FR-22 (breadcrumb and menu), FR-23 (folder filter), FR-24, FR-27, FR-30, FR-31 (menu shell), FR-37, FR-130 (listing errors).

**Deliverables**
- Listing as an infinite query: `Delimiter`, 1,000 per page, 2,000-item cap, `Load all` (100,000-key cap, progress, cancel, message), partial banner, `EncodingType=url` with retry.
- `FileList`, `FileRow`, `FileTile`, `FolderTile` virtualized with TanStack Virtual (list and grid), sort, view toggle, density, pull to refresh, arrow-key navigation.
- `Breadcrumb` with menu, `SearchPill` and `FilterChips` (current-folder filter), Home with bucket cards, `DetailsPanel`.
- Selection model and `SelectionBar`; `ContextMenu` and mobile action sheet showing only the actions that exist so far (each later milestone adds its items; no disabled dead entries).
- Download through a presigned URL (short-lived, `attachment`).
- All states from `T10_FileStates` and `T10b_FileStates`.

**Status: complete.** Differences from the plan below: see [D-35](open-questions.md#decisions-made-on-the-owners-behalf) (no folder menu yet, details from state, test-only cap variable); the search pill, chips and selection bar are in the route-aware app bar after review. The Files route is its own 49.7 KB gzip chunk, the S3 chunk is 72.9 KB, and the first route stays under budget. Pull-to-refresh and touch long-press selection are built but covered by unit tests only; the e2e matrix runs no touch gestures yet (M10 manual pass).

**Tests:** unit for key decoding, sorting and filters; integration listing 5,000 objects with delimiter, awkward keys (`#?%+`, spaces, Unicode, 1,024 bytes) and pagination; e2e scrolling a 5,000-item fixture within the performance budget, selection on touch and pointer, download works; axe and keyboard.

**Exit check (demo):** browse a bucket of 10,000 objects on the S3 fixture at 375, 768 and 1440 with folders, sorting and search; trigger `Load all` and see the cap message (the cap is configurable in test); download a file.

**AGENTS.md commands landing:** none new.

## M4: Upload and transfer panel (3 days)

**Requirements:** FR-35, FR-40, FR-41, FR-43, FR-44.

**Deliverables**
- `NewMenu` and FAB, file and folder pickers, drag-and-drop overlay, New folder dialog (zero-byte placeholder).
- Upload queue with a shared request pool (`uploadConcurrency`), at most three files active, cancel.
- The own upload orchestrator in `src/lib/s3/upload.ts` ([ADR-009](adr/ADR-009-own-multipart-orchestrator.md)): `PutObject` below 16 MiB; from 16 MiB `CreateMultipartUpload`, persist the `uploadId` through the injected `UploadStateStore` before the first part, `UploadPart` through the shared pool with an `AbortSignal`, `CompleteMultipartUpload` with sorted parts, `AbortMultipartUpload` on error and cancel. No `lib-storage`, no middleware.
- IndexedDB setup in `lib/storage` (database `coffer`, all stores, a migration test harness) and the `uploads` store implementing `UploadStateStore`; finished parts and their ETags are stored from the start so v1 resume needs no schema change.
- Abort on load: after unlock, every stored upload is aborted with `AbortMultipartUpload` and shown as interrupted (C-43); no resume UI.
- Conflict dialog (Replace, Keep both, Skip, Apply to all), `TransferPanel` with `role=progressbar` and text values, "Upload interrupted" row.

**Status: complete.** Differences from the plan below: abort-on-load matches records by endpoint and bucket ([D-36](open-questions.md#decisions-made-on-the-owners-behalf)); the New control sits in the Files screen, no `If-None-Match`, and the 500 MB check is opt-in ([D-37](open-questions.md#decisions-made-on-the-owners-behalf)). M4 was not split. A 500 MB upload took 22 s against the fixture. The `coffer` IndexedDB database now exists, so the M8 Forget inventory must list it.

**Tests:** unit for conflict naming and for the orchestrator with a fake client (part order, ETag sorting, abort on failure and cancel, at most 10,000 parts, record written before the first part); integration for a 20 MiB and a 200 MiB multipart upload, cancel leaves no incomplete upload (`ListMultipartUploads` empty), a part failing twice then succeeding, `SlowDown`; e2e for nested folder upload, conflict batch with Apply to all, reload mid-upload shows the interrupted row and the S3 fixture has no incomplete upload; axe on the panel.

**Exit check (demo):** upload a 500 MB file with live progress, cancel one upload, then reload another mid-way and show the panel saying it was interrupted while a `ListMultipartUploads` call against the S3 fixture returns nothing.

**Risk:** the orchestrator replaces a library call. If it overruns, split M4 into M4a (orchestrator, IndexedDB setup, unit and integration tests) and M4b (menus, queue, conflicts, panel, abort-on-load).

**AGENTS.md commands landing:** none new.

## M5a: Preview core types (2 days)

**Requirements:** FR-50, FR-51, FR-52, FR-54, FR-57, FR-58.

**Deliverables:** the full-screen `Preview` viewer (back, name, Download, details, menu; the Share link button is added in M7), previous and next by swipe, arrows and keys with "2 of 10"; image with zoom and pinch; video and audio from presigned URLs; text and code (first 1 MiB, line numbers, text nodes only, truncation notice); SVG through a `blob:` `<img>` with an explicit type and size cap; the no-preview fallback; `FileKind` detection by extension plus magic bytes.

**Status: complete.** Differences from the plan below: see [D-38](open-questions.md#decisions-made-on-the-owners-behalf) (preview in the hash with its own history handling, Space previews, loopback http reads through a blob URL, no HTTP cache for signed requests, PDF/Markdown/HTML wait for M5b). Touch swipe, pinch and double-tap are covered by component tests with synthetic pointer events; a real-device pass is an M10 manual check.

**Tests:** unit for `FileKind` detection; e2e for each type at three viewports; an SVG with embedded script stays inert; a hostile text file shows as text; axe and focus return on close.

**Exit check (demo):** open an image, a video, an MP3, a code file, an SVG and an unknown binary from the S3 fixture, moving between them with the keyboard and swipe.

**AGENTS.md commands landing:** none new.

## M5b: Preview PDF, Markdown, HTML (2 days)

**Requirements:** FR-53, FR-55, FR-56.

**Deliverables:** `pdfjs-dist` as a lazy chunk with a bundled worker and scripting disabled, page navigation, size limit; Markdown with `markdown-it` (`html: false`) and DOMPurify (no remote images, safe link schemes, `rel` set); HTML as source with "Render in sandbox" in an iframe with `sandbox=""` from a `blob:` URL and the notice about styles; bundle-size budget check for the lazy chunks.

**Status: complete.** Differences from the plan below: the HTML sandbox uses `srcdoc` with its own CSP meta, not a `blob:` URL ([D-39](open-questions.md#decisions-made-on-the-owners-behalf)); `pnpm size:check` was added to CI and to the Commands table. After review the connected app is a lazy chunk and the entry is 81.6 KiB gzip against the 120 KiB budget ([D-40](open-questions.md#decisions-made-on-the-owners-behalf)); Welcome in total is 128.5 KiB.

**Tests:** hostile fixtures (script tags, event handlers, `javascript:` links, remote images, nested iframes, `<meta refresh>`) must stay inert in Markdown and the sandbox; a PDF with embedded script does not run it; the lazy chunks are absent from the initial bundle; axe.

**Exit check (demo):** open the hostile fixture set and show nothing executes and no request leaves for remote images; render a PDF; show the bundle report with pdf.js outside the initial chunk.

**AGENTS.md commands landing:** none new (a `size` check, if added to CI here, is added to the Commands table).

## M6a: Operation journal, copy, rename, move (3 days)

**Requirements:** FR-32, FR-33, FR-34 (dialog; drag-to-move is v1), FR-45.

**Deliverables:** the journal store and state machine (write-ahead, copy, verify, delete, cursor, resume, discard, `undoOf`); the object and folder move engine; `CopyObject` with metadata preserved, multipart `UploadPartCopy` above the limit (the limit is a constant that tests lower); Rename dialog, Make a copy dialog, Move dialog with `FolderTree`; conflict handling at the destination; Transfer panel rows for background moves; the interrupted-operation banner with Resume, Review, Discard.

**Status: complete.** Differences from the plan below: see [D-41](open-questions.md#decisions-made-on-the-owners-behalf) (one entry per selected item, endpoint-matched entries with an operation lock, clashes decided per item, case-only renames on case-folding providers not handled). The 10,000-object folder move is not run in CI: the engine runs 2,000 in integration (the exit-check size, interrupted and resumed), and e2e shows a 400-object move leaves no long task over 250 ms.

**Tests:** unit for the journal state machine; integration with fault injection (crash after copy, after verify, mid-way, `SlowDown`), a copy over the lowered multipart limit, a 10,000-object folder move that does not block the UI; e2e for rename, move, copy and the interrupted banner; axe.

**Exit check (demo):** move a folder with 2,000 objects, close the tab mid-way, reopen, press Resume, and show by diffing listings that nothing was lost or duplicated.

**AGENTS.md commands landing:** none new.

## M6b: Trash, restore, delete forever, undo (2 days)

**Status: complete.** Decisions in [D-44](open-questions.md#decisions-made-on-the-owners-behalf). Delete forever and Empty trash are not journaled; a large partial Restore runs one entry per object.

**Requirements:** FR-36, FR-70, FR-71.

**Deliverables:** trash batch prefixes (`{root}.coffer-trash/{timestamp}-{6 chars}/`, one per operation, stored in the journal), Move to trash with the 8-second Undo toast, the `confirmTrash` hook, the Trash view flattening batches with original path and deletion time, selection with Restore and Delete forever, the conflict dialog on restore, typed-count confirmations (over 50 items and Empty trash), `DeleteObjects` batching with a single-delete fallback.

**Tests:** unit for batch id format and parsing; integration for trashing the same key twice (two batches, nothing overwritten), restore with and without a conflict, 2,500-object delete in batches, `DeleteObjects` rejected so the fallback runs; e2e for the undo toast and typed-count dialogs; axe.

**Exit check (demo):** trash a file, undo, trash it again twice, see two entries in Trash with deletion times, restore one, and empty the trash using the typed count.

**AGENTS.md commands landing:** none new.

## M7: Share links (2 days)

**Requirements:** FR-60, FR-61.

**Deliverables:** the presign module with learned clock offset, `ShareLimits`, expiry choices with 1 day preselected (longest allowed for tokens), the Share dialog with `share.body` and `share.invalidate`, link created state with Copy link, `SessionTokenNotice` with disabled (not hidden) choices, the 1-hour cap for tokens with unknown expiry; Share link added to the viewer, menus and selection bar.

**Tests:** unit for limits (7 days, token left, under 15 minutes, unknown expiry); integration that a link downloads the file and that a link with a test-only 2-second expiry then fails; clock-offset signing test; e2e for the dialogs at three widths; axe; a check that no link is logged or stored.

**Status: complete.** Differences from the plan above: see [D-46](open-questions.md#decisions-made-on-the-owners-behalf) (the fixture rejects a made-up session token, so the token cases are component tests; the e2e covers the dialog, the viewer, folders and selection at three widths in two engines).

**Exit check (demo):** create a link, open it in a private window to download, wait out a short test expiry and show it fail; connect with a session token and show longer choices disabled with the reason.

**AGENTS.md commands landing:** none new.

## M8: Vault, save on device, lock (3 days)

**Requirements:** FR-8, FR-9, FR-10, FR-11, FR-101 (auto-lock and what's stored), FR-102.

**Deliverables:** the vault (PBKDF2-HMAC-SHA-256 at 600,000 iterations or more, non-extractable AES-GCM key, per-record IV, AAD, shared salt); the `connections` store; Save on this device (`O51`) with the 12-character minimum and the 16-character hint; Unlock, wrong-passphrase and Locked screens; the auto-lock timer; the credential lease for running transfers, `Stop transfers and lock` and the transfers banner; Forget this device with the inventory test; the connection switcher and multiple connections; Show secret key with re-derivation, 15-second reveal and the clipboard notice.

**Status: complete.** Differences from the plan above: see [D-47](open-questions.md#decisions-made-on-the-owners-behalf) (lock reaches every tab, two more inventory keys, the switcher in the shell and not in the app bar, Connections under Security until M9). Change passphrase stays v1.

**Also in M8 (D-43):** add the Unlock screen to `tests/e2e/first-load.spec.ts`, at most 120 KiB gzip of JavaScript on a cold load.

**Tests:** crypto round-trip, tampered AAD, wrong passphrase, iteration-count assertion; an e2e storage dump (IndexedDB and `localStorage`) containing no plaintext fake key; lock during an upload (it finishes; queued uploads wait and then start after unlock); Stop transfers and lock aborts multipart uploads; the Forget inventory test; recorded unlock time at 4× CPU slowdown; axe.

**Exit check (demo):** save a connection, show only ciphertext in the browser storage, start an upload, let auto-lock fire (shortened in test), watch the upload finish while new actions are blocked, unlock, then use Forget this device and show an empty inventory.

**AGENTS.md commands landing:** none new.

## M9: Settings and read-only mode (2 days)

**Requirements:** FR-100, FR-101 (security page), FR-111.

**Deliverables:** Settings list and detail pages (Appearance, Behavior including `confirmTrash`, hidden files and parallel parts, Connections, Security, About with the MIT text and the IBM Plex credit); the shared capability helper that disables or hides write actions with `ro.reason` across menus, selection bars, New and the FAB, plus the Read-only chip and banner. The demo workspace is v1 and is not built here.

**Tests:** e2e for `S41` and `S42` (read-only) and every disabled item with its reason; settings persistence across reload; axe and keyboard; an assertion that `Explore with sample files` is not rendered in MVP.

**Status: complete.** Differences from the plan above: see [D-48](open-questions.md#decisions-made-on-the-owners-behalf) (selection bars drop the write actions, Connections and Security are separate pages, the transfer panel no longer covers the page).

**Exit check (demo):** connect a read-only key and tour the disabled actions and their reasons; change theme, density and behavior settings and reload to show they persist.

**AGENTS.md commands landing:** none new.

## M10: Hardening and release gate (3 days, plus fix buffer)

**Status:** Phase A done (2026-11-22): e2e guard for CSP and console errors, Firefox in the matrix, axe on every state, keyboard-only pass, real-browser contrast ([contrast-report.md](contrast-report.md)), Lighthouse in CI (`pnpm lighthouse`), antislop pass, security audit ([security-audit-0.1.0.md](security-audit-0.1.0.md)), owner documents. Phase B is the owner's.

**Requirements:** verifies NFR-1 to NFR-12 and the release gate in technical-spec 16.

**Deliverables and checks**
- Accessibility: axe on every screen at three widths in both themes; keyboard-only run of every FR with a keyboard path; manual passes with VoiceOver (iOS and macOS) and NVDA.
- **Real-browser contrast check** (technical-spec 15.7) in Chrome, Safari and Firefox, light and dark, results recorded; danger-tonal on the light surface re-checked (ADR-006).
- CSP verified in real browsers: no violations in the console (this closes the C-31 verification task).
- Full WebKit suite and a manual pass on a real iPhone (iOS Safari 16.4 or later).
- Performance: Lighthouse CI and the bundle-size check against the budgets in technical-spec 14.
- **Local Network Access checks** in Chrome stable, Edge, Safari and Firefox (technical-spec 15.5), results recorded; this closes the manual part of OQ-35 and informs OQ-36.
- Provider compatibility matrix run for the Popular presets (R2, B2, Wasabi, S3, DO Spaces, MinIO) and the custom preset, results documented.
- Run the antislop rules over UI and copy.
- **Run the Cloudflare `security-audit` skill in full audit mode** on the codebase (local, sandboxed, no live endpoints); resolve each confirmed finding or record it with an owner.
- Documentation updated; `LICENSE` present; version `0.1.0` notes drafted.

**Exit check (demo):** the release checklist is complete with evidence attached, the audit report has no unresolved confirmed finding, and the preview deployment serves the exact `_headers` with a clean console.

**AGENTS.md commands landing:** any release scripts (for example `pnpm size`, `pnpm lighthouse`) are added to the Commands table; update the "Before any release" section to match what actually runs.

---

## M11: UX polish round from manual QA

**Status:** In progress (2026-11-28). The owner tested against a real Cloudflare R2 bucket at about 1050 px (dark) and 486 px and asked for the findings to be fixed, pulling some v1 features forward ([D-51](open-questions.md#decisions-made-on-the-owners-behalf)).

**Pulled forward from v1:** Starred (FR-80) and Recent (FR-81).

**Deliverables and checks**
- Every fix has a regression test named after its AC; new behavior gets an AC in the product spec.
- Budgets stay green (technical-spec 14); new heavy code is lazy.

---

## Buffer and ordering notes

- **Buffer:** 4 days for review fixes, provider quirks found in M10 and any milestone that overruns. If a milestone overruns by more than a day, stop and re-plan instead of absorbing it silently.
- **Why this order:** the connection flow (M2) comes before browse because everything needs a working client; upload (M4) before preview and moves so test data is easy to create; the journal (M6a) before trash because trash is a move; the vault (M8) late because earlier milestones run on memory-only keys and the lease design needs real transfers to test.
- **Not in this plan (v1):** demo workspace, coach tips, command palette, keyboard shortcuts sheet, drag-to-move, folder zip, resume after reload, Storage usage, change passphrase. Starred and Recent were pulled into M11.

## Working agreements for every milestone

- Read the FR blocks and linked screens first; do not start a milestone before the previous exit check passes.
- Tests are named after the AC they prove.
- Definition of done from the root `AGENTS.md` applies: types, lint, tests, accessibility, states, copy keys, docs.
- Never edit `design/`; new gaps go to `docs/open-questions.md`.
- Update the root `AGENTS.md` commands table in the same change that adds a tool.
