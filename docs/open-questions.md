# Open questions, decisions and design conflicts

- **Purpose:** The single log of what is still undecided (with an owner and a recommended answer), what the project owner decided, what was decided on the owner's behalf, and where `design/` files conflict or have gaps. Design changes are proposed here and never edited in `design/`.
- **Status:** Draft
- **Last updated:** 2026-11-21
- **Source files:** all of [`design/`](../design/) (read in full), plus the project brief
- **Related:** [product-spec.md](product-spec.md), [technical-spec.md](technical-spec.md), [adr/](adr/)

**Owners** are roles: *Product* (scope, copy decisions, legal), *Design* (the design package owner), *Eng* (implementation), *Security* (threat model and audit). **Precedence rule:** if the six older design files (`screens.md`, `ux-patterns.md`, `copy.en.json`, `types.ts`, `providers.json`, `SECURITY-DESIGN.md`) conflict with the seven newer files (`tokens.*`, `components.md`, `button-states.md`, `accessibility.md`, `HANDOFF.md`), the newer files win on colors, button states, the elevated scope and the component list.

## Owner-confirmed decisions

Answered by the project owner. The **From** column gives the question that was open before (its text is no longer kept; the decision replaces it). Status of every row: **Decided**.

| ID | From | Decision | Where used |
|---|---|---|---|
| C-1 | Q3 | Theme follows `prefers-color-scheme` by default, with a local override (System, Light, Dark) in Settings. | FR-100, tech spec section 12 |
| C-2 | Q4 | Danger-tonal light surface contrast fail is accepted as a hint-only fill; border and label carry meaning. | [ADR-006](adr/ADR-006-danger-tonal-contrast-deviation.md) |
| C-3 | Q5 | Organize is a submenu with `Move…` and `Add to starred`. Make a copy = `CopyObject` to `name (copy).ext`; `UploadPartCopy` above 5 GB. Both MVP. | FR-31, FR-33 |
| C-4 | Q6 | Download as .zip is v1, streamed with `fflate`, warning above 500 MB. | FR-38 |
| C-5 | Q7 | Package manager is pnpm. | Tech spec section 2 |
| C-6 | Q8 | Recent is a section on Home, backed by IndexedDB. | FR-81, [ADR-007](adr/ADR-007-local-data-placement.md) |
| C-7 | Q9 | Listing shows the first 2,000 items; "Load all" is opt-in with progress, capped at 100,000 keys, with a message at the cap. | FR-21 |
| C-8 | Q10 | `git init` with a `.gitignore` (node_modules, dist, .DS_Store, .env*) is part of the first task. Done. | Repository |
| C-9 | n/a | The six older design files are valid. Contrast numbers are computed, not observed; a real-browser contrast pass is a testing task. | Tech spec 15.7 |
| C-10 | OQ-1 | **Search scope.** MVP filters the current folder's loaded items by name, client-side. Placeholder and no-results copy name the folder (additions `search.placeholderFolder`, `search.none.bodyFolder`) unless Design agrees to keep the bucket wording. **v1:** the no-results state offers "Search all of {bucket}" (opt-in scan, same 100,000-key cap, cancellable; key `search.all`). | FR-23, FR-25, tech spec 6.2 |
| C-11 | OQ-2 | **Share expiry.** Choices are `15m, 30m, 1h, 1d, 7d` (`types.ts`). Default selection is **1 day** for normal keys. For session-token connections the default is the longest allowed choice. | FR-60, FR-61, tech spec 10 |
| C-12 | OQ-3 | **Session-token expiry.** Learned from the JWT `exp` claim (Supabase), from `AWS_CREDENTIAL_EXPIRATION` in paste detection, or from an optional "Token expires at" field under Advanced. If unknown, links are capped at 1 hour and the Share dialog says so. | FR-4, FR-12, FR-61, tech spec 4 and 10 |
| C-13 | OQ-4 | Presets with `sessionToken: true` and no token field get an optional "Session token" field (`role: "sessionToken"`) under Advanced; `AWS_SESSION_TOKEN` fills it. | FR-3, FR-4, FR-12 |
| C-14 | OQ-5 | `popular` and `popularOrder` drive the Popular section; `group` is a facet label only. "All providers" lists every preset alphabetically, popular ones included. | FR-2 |
| C-15 | OQ-6 | **Copy gaps.** Missing keys live in `src/lib/i18n/copy.additions.en.json`, merged over the design file; an addition may override a design key (only `files.emptyBucket.body` so far) and each override is listed in this file. The file exists and holds 110 keys after M2b. Provider strings stay in `providers.json`. **CI fails if any copy key used in code does not exist** in the merged copy. | NFR-11, tech spec 15.6, `src/lib/i18n/AGENTS.md` |
| C-16 | OQ-7 | Add `intl-messageformat` for ICU plurals. | Tech spec section 2 |
| C-17 | OQ-8 | Add `@tanstack/react-router` (hash history) and `zustand`. *The router part is superseded by C-50; zustand stands.* | Tech spec section 2 |
| C-18 | OQ-9 | **Folder placeholders.** `New folder` writes a zero-byte `name/` object (`application/x-directory`), hidden in listings and moved or deleted with the folder. `files.emptyBucket.body` is overridden in `copy.additions.en.json`: "Upload your first file, drag a folder in, or create a folder with New." | FR-35, tech spec 6.2 |
| C-19 | OQ-10 | **Trash layout.** Each trash operation moves items to `.trash/{UTC timestamp}-{6 random chars}/{original key}` (one batch prefix per operation). Older trashed copies are never overwritten. Deletion time comes from the prefix; restore strips it; trash collisions are impossible. The Trash view lists batches flattened to items. | [ADR-004](adr/ADR-004-trash-as-prefix.md), FR-36, FR-70 |
| C-20 | OQ-11 | A key that can write but not delete fails the connection test (`accessDenied` on the clean step). | FR-5 |
| C-21 | OQ-12 | An empty bucket can still get the read-only offer; the offer states that reading could not be verified. | FR-110 |
| C-22 | OQ-13 | `public/` may hold `_headers`, `fonts/`, `theme-init.js`, `manifest.webmanifest`, `icons/` (which may include `favicon.ico`, linked explicitly from `index.html`) and `favicon.svg`, nothing else. | Tech spec 11.2, `public/AGENTS.md` |
| C-23 | OQ-14 | Sandboxed HTML inherits the app CSP and may render unstyled; the notice says so. The CSP is not relaxed. | FR-56 |
| C-24 | OQ-15 | PDF preview uses `pdfjs-dist` as a lazy chunk with a bundled worker and scripting disabled. | FR-53 |
| C-25 | OQ-16 | **License is MIT.** A `LICENSE` file ships with the repo; IBM Plex (OFL) is credited in About. | FR-100 |
| C-26 | OQ-17 | Memory-only connections show the secret masked and it cannot be shown again after the form is submitted. | FR-102 |
| C-27 | OQ-18 | **Lock behavior.** The UI locks on schedule (and on manual Lock). Transfers already running continue to completion with in-memory credentials; queued transfers wait for unlock; no new operation can start while locked. | FR-9, tech spec 8 and 9, [ADR-005](adr/ADR-005-encrypted-local-vault.md) |
| C-28 | OQ-19 | **Token generator.** Eng writes a small DTCG to CSS generator in `scripts/tokens/`. `design/tokens.json` stays the source. CI fails when the generated `tokens.css` or `tailwind.css` differ from the committed files. | [ADR-008](adr/ADR-008-token-generator.md), `src/styles/AGENTS.md`, `scripts/AGENTS.md` |
| C-29 | OQ-20 | Supported: current and previous major of Chrome, Edge and Firefox; **iOS Safari 16.4+ is mandatory** (and desktop Safari 16.4+). | NFR-7, tech spec 15 |
| C-30 | OQ-21 | Production uses the `pages.dev` origin until a domain is chosen. | Tech spec 16 |
| C-31 | OQ-23 | Keep `style-src 'self'` strict and verify in a real browser; `style-src-attr 'unsafe-inline'` only after Security reviews the library that needs it. | Tech spec 11.2 |
| C-32 | OQ-24 | HSTS ships without `preload` until the production domain is final and owned. | Tech spec 11.2 |
| C-33 | OQ-25 | Oracle OCI stays selectable with the "Browser access not supported (CORS)" warning. | FR-2, FR-6 |
| C-34 | OQ-28 | **Passphrase.** Hard minimum **12 characters** (saving is blocked below it); an advisory hint appears at **16 or more**. No external estimator library. | FR-8, FR-101, tech spec 9 |
| C-35 | OQ-29 | Storage usage shows an **estimated request count** (about one request per 1,000 objects) before and while counting; no cap, always cancellable; after 100,000 objects it shows "Still counting"; a cancelled result is labelled partial. | FR-90 |
| C-36 | OQ-30 | Zip streams to disk where `showSaveFilePicker` exists; elsewhere buffer up to 1 GB and refuse beyond that with advice. The 500 MB warning applies everywhere. | FR-38 |
| C-37 | D-6 | **Connection-test file location.** The test file is written under the connection's start folder (initial prefix) when one is set, otherwise in the bucket root. | FR-3, FR-5, tech spec 4 and 5 |
| C-38 | OQ-31 | **Locked screen with running transfers.** While transfers still run, `O62_Locked` shows the existing `Banner` ("N transfers still finishing", `ob.locked.transfers`) and a secondary `Button` `Stop transfers and lock` (`ob.locked.stop`). Choosing it cancels the transfers (multipart uploads aborted), releases their credential leases and finishes the lock. "Forget this device" always cancels transfers. No Design pass needed; keys are in the additions file. | FR-9, tech spec 9, [ADR-005](adr/ADR-005-encrypted-local-vault.md) |
| C-39 | DC-23 | **Start in folder** is a standard optional text field under Advanced, built from the `Input` primitive following `components.md`. It sets `ConnectionProfile.prefix`. No Design pass needed. | FR-3, tech spec 4 |
| C-40 | OQ-22 | `Settings.uploadConcurrency` is the size of one shared pool of parallel parts across uploads (default 4); at most 3 files are active. | FR-41, T-6 |
| C-41 | OQ-26 | "Forget this device" requires typing the saved-connection count only when at least one saved connection exists; otherwise a single confirm. | FR-10 |
| C-42 | OQ-27 | A starred key that no longer exists stays and shows a "missing" state with a remove action; Coffer updates stars only for changes made through Coffer. | FR-80 |
| C-43 | D-7 | **MVP uploads do not resume.** There is no resume UI in MVP, so the `Upload paused when the page reloaded · Choose file` state (`T13_Transfers`) is hidden in MVP. On the next load, every stored multipart upload is aborted cleanly with `AbortMultipartUpload` using the stored `uploadId` (retried after unlock if the vault is locked), and the transfer panel says the upload was interrupted and must be started again (`upl.interrupted.*`). Resume returns in v1 on the same orchestrator (C-45). | FR-41, FR-42, FR-44, tech spec 7, D-7 |
| C-44 | n/a | **MVP scope.** Markdown preview (FR-55) and HTML as source with sandbox (FR-56) are in MVP (moved from v1). The demo workspace (FR-120) stays v1: `Explore with sample files` is hidden on Welcome in MVP. | Release plan, FR-1, FR-120 |
| C-45 | n/a | **Upload orchestrator.** MVP uses a small own multipart orchestrator (`CreateMultipartUpload`, `UploadPart` through the shared pool, `CompleteMultipartUpload`, `AbortMultipartUpload`) instead of `lib-storage` plus an `UploadId` middleware. MVP behavior stays as in C-43. | [ADR-009](adr/ADR-009-own-multipart-orchestrator.md), tech spec 7, M4 |
| C-46 | n/a | **Types.** `src/lib/types.ts` is the canonical contract; `design/types.ts` is its origin. There is no identity check; every difference (T-1 to T-8) is listed in the tech spec. | Tech spec 3, M0 |
| C-47 | n/a | **Git rules.** Conventional Commits; no `Co-Authored-By` or other attribution; every commit signed and signing never disabled (stop and report if it fails); commit to `main`; remote `git@github.com:rahmabintangpratama/coffer.git`; `.gitignore` reviewed before committing. | Root `AGENTS.md` Git section |
| C-48 | OQ-32 | **S3 fixture.** The fixture is **RustFS 1.0.6** (`rustfs/rustfs`, pinned by digest in the compose file and the CI service), chosen after testing candidates against the fixture criteria (comparison below). CORS is set per bucket; per-user policies come from RustFS's admin API (`tests/integration/global-setup.ts`). It also runs as a CI service container. `tests/integration/capabilities.test.ts` is the acceptance test for any future replacement. | `tests/integration/`, CI, tech spec 15.2 |
| C-49 | n/a | **Commit and Node enforcement.** commitlint (conventional preset, header at most 72) runs in a lefthook `commit-msg` hook and, in CI, over every commit in the pushed range. `engines` is `>=22 <23` with `engine-strict`, so pnpm refuses other Node versions. All 14 earlier commits already conformed, so history was not rewritten. | Root `AGENTS.md` Git, README |
| C-50 | OQ-34 | **Router.** Replace TanStack Router with **wouter** (hash location, about 2 KB gzip, against 29 KB). Routes are centralized as string literals in `src/app/routes.ts` and links take an `AppRoute`, so a typo is a compile error. Supersedes the router part of C-17. | Tech spec 1 and 2, `src/app/AGENTS.md` |
| C-51 | OQ-34 | **Per-feature copy loading.** Copy is split by top-level group. The shell groups (`act`, `app`, `main`, `nav`, `set`, `toast`) are in the first bundle; every other group is its own chunk, loaded by `loadCopyGroups` or `CopyBoundary` before its screen renders. A Vite plugin (`scripts/vite/copy-groups.ts`) builds the chunks from the design copy plus the additions file. | Tech spec 2, `src/lib/i18n/AGENTS.md` |
| C-52 | OQ-34 | **Budget.** The first-route budget stays at **120 KB gzip**. After C-50 and C-51 the initial JavaScript is **100.0 KB gzip** (React and ReactDOM about 60 KB, `intl-messageformat` 9.8 KB, lucide icons 3.7 KB, wouter 2 KB, zustand 1.2 KB, copy core and app code the rest) plus 8.2 KB of CSS. About 20 KB remain for onboarding code. | Tech spec 14 |
| C-53 | OQ-33 | **Brand.** The owner supplied a brand kit, stored read-only in `design/brand/` (one-time exception to the read-only rule). It is integrated as `public/favicon.svg`, `public/icons/*` (favicon PNGs and `.ico`, apple-touch icon, Android and maskable icons, mark and logo SVGs) and the manifest `icons` (192 and 512 `any`, 512 `maskable`). The kit's `site.webmanifest` is not used; its icons are merged into `manifest.webmanifest`, which keeps its relative `start_url`, `scope` and `background_color`. In the app, `CofferMark` and `CofferLogo` draw the vector paths with no background and `currentColor`, because the kit's SVGs have a baked-in white background that breaks dark mode. Icons get a one-year immutable cache like fonts, so a changed icon needs a new file name. | `public/AGENTS.md`, `src/components/CofferMark.tsx`, `CofferLogo.tsx` |
| C-54 | OQ-35 | **Local Network Access.** Before the connection test runs against a loopback or private-IP endpoint from a page on a less private address (a public page to localhost or a LAN address), Coffer reads `navigator.permissions.query({ name: "loopback-network" \| "local-network" })`, feature-detected and in try/catch. `prompt`: a short pre-prompt (`ob.localNetwork.*`) shows before the first request, never on page load, and Continue starts the test. `denied`, or a request that fails while access is still not granted: failure `localNetworkDenied` with how to re-enable it (`ob.fail.localNetwork.*`) instead of a generic network error. `granted`: run. A page on localhost reaching localhost needs nothing, so the page's own address decides. M10 adds LNA checks for Chrome, Edge, Safari and Firefox to the manual matrix. | FR-5, T-9, tech spec 5 and 15.5, [D-29](#decisions-made-on-the-owners-behalf) |

## Open questions

### OQ-35: Chrome's local network access permission
- **Owner:** Eng, Design
- **Status:** Closed as requirements in [C-54](#owner-confirmed-decisions) and the spike result in [D-29](#decisions-made-on-the-owners-behalf). One manual check remains in M10.
- **Question:** A request from a page on a public origin to `http://127.0.0.1:9000` failed in Playwright's Chromium with "Permission was denied for this request to access the `loopback` address space" (Chrome's Local Network Access check). A denied permission and a stopped server both surface as a `TypeError`.
- **Resolution:** Permission query, pre-prompt, remediation and the `localNetworkDenied` failure are built (M2b). Private-IP http stays blocked (D-29). Playwright can grant the permission with `local-network-access`, which the e2e spec uses.
- **Remaining:** run the checks in the M10 matrix (technical-spec 15.5) in Chrome stable, Edge, Safari and Firefox.
- **Affects:** FR-5, `ob.fail.localNetwork.*`, technical-spec 5 and 15.5

### OQ-36: http to private-IP endpoints
- **Owner:** Product, Eng (needs an ADR if the answer is yes)
- **Status:** Closed. The owner kept the rule "http only for loopback" and decided no ADR is needed ([D-29](#decisions-made-on-the-owners-behalf)).
- **Question:** People who run MinIO or RustFS on a LAN address often have only http. Chrome and Edge let a public https page reach it after the person allows local network access, but Safari and Firefox do not, and the CSP forbids it today.
- **Recommended:** Keep the rule (http only for localhost) and document the options: run Coffer on the same machine, or put the server behind https (a reverse proxy or a local certificate). Revisit only if people ask, with an ADR that weighs `connect-src http:` against the security rules.
- **Affects:** FR-3, FR-6, `public/_headers`, technical-spec 11.2

### OQ-33: App icon and logo
- **Owner:** Product, Design
- **Status:** Closed by [C-53](#owner-confirmed-decisions): the owner supplied a brand kit (`design/brand/`), integrated in M2b.
- **Question:** The design package had no logo or app icon, so the web manifest and the browser tab had no icon and the app could not be installed to a home screen.
- **Affects:** `public/manifest.webmanifest`, `index.html`

---

## Decisions made on the owner's behalf

These choices were not asked. Reverse any by opening a question.

| ID | Decision | Rationale |
|---|---|---|
| D-1 | Hash routing (`#/files/...`). | Keys and names never reach the host or its logs (NFR-8). |
| D-2 | Directory tree adds `src/app/` (router, providers, shell), `src/lib/i18n/` (copy loader) and `scripts/` (token generator). | Needed by the layer rules and C-28; each holds only `AGENTS.md`, `CLAUDE.md`, `.gitkeep` for now. |
| D-3 | Downloads, images and media use presigned URLs; text, code, SVG, PDF and Markdown read bytes with ranged `GetObject`. | No data through memory for big files; CORS only where bytes are read. |
| D-4 | CORS-versus-network is detected with a `no-cors` reach probe followed by a signed call. | Browsers do not expose the reason for a CORS block. |
| D-5 | The CORS rule exposes `ETag`, `Date` and `x-amz-bucket-region` and allows `AllowedHeaders: ["*"]` for the pinned origin. | Multipart needs ETag; `Date` gives clock offset; region hints. |
| D-6 | *Superseded by C-37.* (Was: test file in the bucket root.) | Owner decision. |
| D-7 | Multipart threshold 16 MiB, part size 8 MiB (scaled for 10,000 parts). MVP and v1 use one own orchestrator over SDK commands instead of `lib-storage` (C-45, [ADR-009](adr/ADR-009-own-multipart-orchestrator.md)); MVP has no resume, so a reload aborts interrupted multipart uploads (C-43); v1 adds resume on the same orchestrator. | `lib-storage` cannot resume or expose the upload id. |
| D-8 | Journal keeps done entries for 24 hours for Undo. | Simple bound for the Undo window. |
| D-9 | Listing uses `EncodingType=url` with a retry without it. | Keys with characters XML 1.0 cannot carry. |
| D-10 | The trash prefix is hidden from Files, search and usage regardless of `showHiddenFiles`. | Avoids showing the buffer as normal files. |
| D-11 | Home in MVP shows buckets only; Recent arrives with v1. | Recent is "starred and recent" in the v1 scope. |
| D-12 | Demo mode (v1) uses an in-memory `StorageBackend`. | Same UI code path, zero network. |
| D-13 | Root `CLAUDE.md` adds Claude-specific text only: the skills note and the subagent rules (what to delegate, what stays in the main model, subagents never touch git). Subagent definitions are committed in `.claude/agents/` with a minimal tool list and a model each. Every other `CLAUDE.md` is only `@AGENTS.md`. | Only genuinely Claude-specific text goes there; cheap models take mechanical read-only work to save tokens. |
| D-14 | Auto `addressingStyle` picks path-style for IPs, localhost, ports and dotted bucket names. | Wildcard TLS and DNS limits. |
| D-15 | Presign signing date uses the learned clock offset. | A wrong device clock must not produce dead links. |
| D-16 | All saved profiles share one salt (one PBKDF2 derivation per unlock). | Usable unlock on phones; types unchanged. |
| D-17 | `SECURITY-DESIGN.md`'s `Strict-Transport-Security ... preload` is shipped without `preload` (now C-32). | Hard to reverse. |
| D-18 | The trash batch id has the form `YYYYMMDDTHHMMSSZ-xxxxxx` (UTC, six lowercase base-36 characters from `crypto.getRandomValues`). It is generated once per operation and stored in the journal entry, so a resume reuses it. | Sortable, collision-free, resumable. |
| D-19 | The start folder is a new optional connection field `prefix` (Advanced, "Start in folder", a standard optional text field per C-39). It is the connection root: Files starts there, the breadcrumb cannot go above it, and the trash prefix and test file live under it (`{prefix}.trash/...`). "Original key" in trash is relative to this root. | A prefix-scoped key cannot write to the bucket root (see DC-23). |
| D-20 | While locked, each already-running transfer keeps a private credential lease and a dedicated S3 client; the lease is released when that transfer finishes or fails. Queued transfers acquire a lease only at start, which fails while locked, so they wait. The Locked screen follows C-38. | Implements C-27 without keeping the vault open. |
| D-21 | `copy.additions.en.json` may override a design key (needed for `files.emptyBucket.body`); every override is listed under C-15 or its own C-row. | C-18 requires an override. |
| D-22 | `LICENSE` (MIT, "Coffer contributors", 2026) was added to the repo. | C-25. The copyright holder name is a placeholder the owner can change. |
| D-23 | Token scripts are `pnpm tokens:build` and `pnpm tokens:check`. The generator must first reproduce `design/tokens.css` and `design/tailwind.css` (compared after normalizing whitespace) in a golden test. | Proves equivalence before the design copies stop being the reference. |
| D-24 | Modal layers (`Dialog`, `Sheet`, `NavDrawer`) are built on the native `<dialog>` element, not Radix Dialog. Radix primitives that do not inject styles (menus, popovers, tooltips) stay allowed after a browser check for CSP violations; `vaul` is not used. | Radix Dialog uses `react-remove-scroll`, which injects a `<style>` element; `style-src 'self'` blocks it (C-31 keeps the CSP strict). |
| D-25 | **Menus, popovers and other Radix primitives under the CSP.** A spike under the real `_headers` (Chromium and WebKit, 2026-11-21) showed that Radix `DropdownMenu`, `ContextMenu` and `Popover` in modal mode each cause a `style-src-elem` violation (the scroll lock injects a `<style>` element), and so do `Select` (two violations) and `ScrollArea`. Non-modal menus and popovers, `Tooltip` and `Tabs` caused none; `Checkbox`, `Switch`, `RadioGroup` and a closed `HoverCard` caused none on mount. **Standard:** (1) menus and popovers are always `modal={false}`; the wrappers in `src/components` hard-code it, and a lint rule rejects a Radix menu or popover root without `modal={false}` and rejects importing those packages outside `src/components`. (2) No Radix `Dialog`, `AlertDialog`, `Select` or `ScrollArea`: use the native `<dialog>` (D-24), a native `<select>` for plain choices, a non-modal popover plus listbox for combobox fields, and native scrolling. (3) Non-modal means the page behind stays scrollable and the menu closes on outside press, Escape or focus leaving; below 768 px menus are bottom sheets (the native layer) anyway. (4) Portals mount inside `.cf-root` (`container` prop) so container queries and the theme apply, and content carries `data-surface="elevated"`. (5) Any new Radix primitive is checked against the CSP e2e test before use. | The CSP stays strict (C-31); the spike made the cost concrete before M3 builds menus. |
| D-26 | `index.html` has two `theme-color` metas, light `#FFFFFF` and dark `#22211E` (the generated dark `bg.surface`), selected by `prefers-color-scheme`, instead of the kit's single teal `#1D6B86`. | The browser UI should match the app bar surface, not the accent, in both schemes. The metas follow the operating system scheme; an in-app theme override does not change them (a follow-up, not needed for M2b). The manifest `theme_color` stays `#FFFFFF`. |
| D-27 | Going back to the connection form from a failure or the bucket picker restores every value except the keys. The keys went to the vault at submit, so the secret fields come back empty and the attempt's vault entry is dropped. | State and props carry no keys (`src/AGENTS.md`); the person re-enters them rather than Coffer keeping them in React state. |
| D-28 | When no bucket was given and the first signed call is blocked by CORS or denied, the flow treats the key as unable to list buckets and asks for the bucket name. The CORS help then shows for that bucket. | Listing buckets is a service-level call that many providers cannot add CORS headers to; the RustFS fixture is one. A block there says nothing about the bucket the person wants (AC-7.3). The picker is covered in e2e with a routed response that adds CORS headers. |
| D-29 | **LNA spike result.** In Chrome for Testing 159 (Playwright), with local network access granted and the app's CSP removed, a public https page reaches `http://<private IP>` with a plain `fetch`, and `targetAddressSpace` changes nothing. With the app's real CSP the request is blocked before the browser: `connect-src` allows `https:` and `http://localhost:*` and `http://127.0.0.1:*` only, and a CSP cannot name private ranges. **Decision: keep the rule that http is allowed only for loopback.** No custom request handler was built. | Allowing private-IP http needs `http:` in `connect-src` (any host over plain text), which the security rules forbid without an ADR (see [OQ-36](#oq-36-http-to-private-ip-endpoints)). Not verified in Chrome stable, Edge, Safari or Firefox: that is a manual M10 check. Evidence: `scripts/spikes/lna-target-address-space.ts`. |
| D-30 | The Welcome screen has no sample file list at 1440 (AC-1.3) and no `Explore with sample files` button. | Both belong to the demo (FR-120, v1); the list would be a picture of features that do not exist yet. |
| D-31 | After the test passes, the screen shows Connected and an `Open bucket` button (or `Choose a bucket`) instead of moving on by itself. | A change of screen the person did not cause is hard to follow with a screen reader; the Connected state is also the exit-check evidence. |
| D-32 | `I've added it · Check again` and `Use {region}` re-run all six steps from Reach endpoint, not from step 2 (AC-6.3). | Reaching the endpoint takes milliseconds, and one code path is easier to trust than a resumable test. |
| D-33 | The CORS help opens with `ob.cors.stepOpen` (new key) and offers the provider's `helpSteps` in a disclosure, instead of using `ob.cors.s1`. | `ob.cors.s1` needs a per-provider console and product name that `providers.json` does not have. |
| D-34 | The provider count on Welcome is the number of presets rounded down to ten (`20+` for 21), and the reach probe's non-2xx answer is logged by the browser as a failed resource. | The claim stays true when a preset is added. The console line cannot be suppressed; the e2e console check ignores the fixture's 501 (RustFS answers `HEAD /` with 501). |

## Design conflicts log

Conflicts and gaps found across `design/` files. Status values: **Resolved** (a decision or rule settles it), **Open** (needs Design or Product), **Accepted** (deviation recorded). Newer files win where noted.

| ID | Conflict or gap | Files | Resolution |
|---|---|---|---|
| DC-1 | Share expiry list differs: `15m, 30m, 1h, 1d, 7d` versus "1 hour, 1 day, 7 days". | `types.ts`, `SECURITY-DESIGN.md`, `copy.en.json` | **Resolved** → [C-11](#owner-confirmed-decisions); use `types.ts`. |
| DC-2 | Search copy says "in {bucket}"; brief says current folder. | `copy.en.json`, brief | **Resolved** → [C-10](#owner-confirmed-decisions). |
| DC-3 | Mobile selection actions: `components.md` puts Move to trash in the top bar with the rest in a bottom action bar; `ux-patterns.md` lists all four actions replacing the bottom nav. | `components.md`, `ux-patterns.md` | **Resolved: newer `components.md` wins** (trash at top, Share link, Download, Move in the bottom bar). |
| DC-4 | `popular` flag and `group: "popular"` disagree for DO Spaces and MinIO. | `providers.json`, `types.ts`, `screens.md` | **Resolved** → [C-14](#owner-confirmed-decisions). |
| DC-5 | `sessionToken: true` on four presets with no token field. | `providers.json`, `types.ts` | **Resolved** → [C-13](#owner-confirmed-decisions). |
| DC-6 | Danger-tonal light surface fill 1.14:1 versus 1.25:1 target; not mentioned in `accessibility.md` or `HANDOFF.md`. | `button-states.md`, `accessibility.md` | **Accepted** → [ADR-006](adr/ADR-006-danger-tonal-contrast-deviation.md) (C-2). |
| DC-7 | Starred and Recent location "localStorage or IndexedDB". | `SECURITY-DESIGN.md`, `ux-patterns.md` | **Resolved** → [ADR-007](adr/ADR-007-local-data-placement.md). |
| DC-8 | CSP `style-src 'self'` and `blob:` iframes interact: sandboxed HTML inherits the CSP. | `SECURITY-DESIGN.md`, `screens.md` | **Resolved** → [C-23](#owner-confirmed-decisions). |
| DC-9 | Strings referenced by screens and components but absent from the copy file. | `copy.en.json`, `screens.md`, `components.md` | **Resolved** → [C-15](#owner-confirmed-decisions) (additions file, CI check). Design may fold them in later. |
| DC-10 | Provider text (`helpSteps`, labels, badges) lives in `providers.json`, outside the "all strings from `copy.en.json`" rule. | `providers.json`, `HANDOFF.md` | **Resolved:** provider content is the documented exception. |
| DC-11 | `ConnectionProfile.credentials` has a `memory` variant that could be persisted by mistake. | `types.ts` | **Resolved:** change T-1 (separate stored type). |
| DC-12 | `OperationJournalEntry` has no fields for resuming (`phase`, `cursor`, `failures`, `undoOf`). | `types.ts`, `ux-patterns.md` | **Resolved:** change T-3 in the tech spec. |
| DC-13 | `Settings.uploadConcurrency` name versus copy label "Parallel upload parts". | `types.ts`, `copy.en.json` | **Resolved** → [C-40](#owner-confirmed-decisions). |
| DC-14 | `HANDOFF.md` says the design uses `https://coffer.pages.dev` as a stand-in origin. | `HANDOFF.md` | **Resolved** → [C-30](#owner-confirmed-decisions) (`pages.dev` until a domain is chosen). |
| DC-15 | `design/` files mention `tokens.py`, `logo-mark.svg` and sample data that are not supplied. | `accessibility.md`, `HANDOFF.md` | Not needed (owner). Generator gap **resolved** → [C-28](#owner-confirmed-decisions). |
| DC-16 | `HANDOFF.md` and `components.md` list "Sheet", "Popover" and form primitives only inside other components; they have no entry. | `components.md`, `button-states.md` | **Resolved:** specified as shadcn/Radix primitives in tech spec section 12. |
| DC-17 | Mobile nav has no Trash, Storage, Settings, Recent. | `components.md`, `screens.md` | **Resolved:** More sheet `S38_MoreSheet`, drawer `S40_NavDrawer`, Recent on Home `S14_Home`. Not a gap. |
| DC-18 | DetailsPanel width and placement. | `components.md`, `screens.md` | **Resolved:** consistent (360 px overlay at 768, in-layout from 1024). |
| DC-19 | No license chosen although copy says "Free and open source". | `copy.en.json` | **Resolved** → [C-25](#owner-confirmed-decisions) (MIT). |
| DC-20 | Copy uses ICU plurals; no formatter in the stack. | `copy.en.json`, brief | **Resolved** → [C-16](#owner-confirmed-decisions). |
| DC-21 | `public/` contents: brief allows `_headers` and fonts only. | brief, `SECURITY-DESIGN.md` | **Resolved** → [C-22](#owner-confirmed-decisions). |
| DC-22 | The security design says no code audit was done; contrast was computed and the canvas was not viewed in a browser. | `SECURITY-DESIGN.md`, `HANDOFF.md`, `accessibility.md` | **Resolved:** real-browser contrast task (tech spec 15.7) and a pre-release security audit. |
| DC-23 | No connection field for a start folder (initial prefix), yet the owner's decision C-37 assumes one, and prefix-scoped keys cannot use the bucket-root trash. | `types.ts`, `providers.json`, `screens.md` | **Resolved** → [C-39](#owner-confirmed-decisions): a standard optional text field in Advanced; no Design pass. Copy keys `form.prefix*` are in the additions file. |
| DC-24 | `SECURITY-DESIGN.md` says "minimum 12 characters suggested"; the owner made 12 a hard minimum. | `SECURITY-DESIGN.md`, `copy.en.json` | **Resolved** → [C-34](#owner-confirmed-decisions) (additions `ob.save.tooShort`). |
| DC-25 | `design/tokens.css` sets `--cf-color-border-focus: var(--cf-inverse-accent)` in `[data-surface="inverse"]`, but no `--cf-inverse-accent` is defined; `tokens.json` says `{color.inverse.accent}`, which is `--cf-color-inverse-accent`. As delivered, the toast focus ring would be invalid. | `tokens.css`, `tokens.json`, `button-states.md` | **Resolved** by the token generator, which emits the correct name from `tokens.json` (the generated `src/styles/tokens.css` is what the app uses). No design change is needed. The golden test keeps this as its one documented difference from the delivered CSS. |

### Fixture comparison (C-48)

Each candidate was run in Docker and checked with the same probe (later turned into `capabilities.test.ts`). "Service container" means it runs with its default command and only environment variables, which is all a GitHub Actions service container allows.

| Server (image) | Per-bucket CORS and preflight | Multipart and `UploadPartCopy` | List, delimiter, `EncodingType=url` | Presigned GET (and expiry) | `DeleteObjects` | Per-user policies (read-only, delete-denied) | Service container |
|---|---|---|---|---|---|---|---|
| **RustFS** `rustfs/rustfs:1.0.6` (released 2026-11-15) | Yes. Allowed origin answered, other origin and a bucket without a rule refused | Yes | Yes | Yes, expires with 403 | Yes | **Yes**, via the admin API; deny-delete works for `DeleteObject` and `DeleteObjects` | **Yes** (default command, env credentials) |
| Moto `motoserver/moto` (2026-10-30) | Fails: echoes any origin, including on a bucket with no rule | Yes | Yes | Link does not expire without auth | Yes | Needs IAM enforcement switched on in steps; it is a mock, not a server | Yes |
| SeaweedFS `chrislusf/seaweedfs` (2026-11-16) | Partial: a bucket without a rule still answers the origin | Yes | Yes | Yes | Yes | Not tested (identity file needed) | Runs with defaults, but cannot be configured through the environment |
| Garage `dxflrs/garage` | Not tested | Not tested | Not tested | Not tested | Not tested | Read and write flags only, no delete-denied key | **No**: needs a config file at start and exits without one |
| MinIO (official) | Image no longer published on Docker Hub or Quay | | | | | | |
| MinIO `bitnamilegacy/minio` (frozen, 2025-08) | Global environment variable only | Yes | Yes | Yes | Yes | Yes | Yes, but frozen and unmaintained |

RustFS is the only candidate that met every criterion. RustFS is young (1.0.x, frequent releases), so the image is pinned to an exact version and bumped on purpose, with the capability suite as the safety net. Its built-in `readonly` policy does not allow listing, so the tests create their own read-and-list policy.
