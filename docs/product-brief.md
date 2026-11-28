# Coffer product brief

- **Purpose:** Explain why Coffer exists, who it is for, what it will and will not do, and how success is measured.
- **Status:** Draft
- **Last updated:** 2026-11-21
- **Source files:** [`design/HANDOFF.md`](../design/HANDOFF.md), [`design/ux-patterns.md`](../design/ux-patterns.md), [`design/SECURITY-DESIGN.md`](../design/SECURITY-DESIGN.md), [`design/screens.md`](../design/screens.md)
- **Related:** [product-spec.md](product-spec.md), [technical-spec.md](technical-spec.md), [open-questions.md](open-questions.md)

## Problem

Object storage is everywhere: Cloudflare R2, Backblaze B2, Wasabi, AWS S3, MinIO and a long tail of S3-compatible services. The tools that ship with these providers are **operator consoles**. They are built for people who configure buckets, not for people who live in their files. Everyday jobs such as finding a file, renaming a folder, previewing a PDF or sending a link take too many steps, or need a desktop client and a config file.

People who have used Google Drive for years expect a familiar model: a left rail, a search bar, a list, a context menu, Trash with Undo, Starred, a share link. Object storage has none of that by default, and it behaves differently underneath (folders are key prefixes, rename is copy plus delete, links expire).

## Target users

| Segment | Context | What they need |
|---|---|---|
| **Long-time Drive users** who now hold files in a bucket (backups, media, client deliverables, a homelab) | Phone or laptop. Not comfortable with CLI tools or IAM policies. | A file manager that feels like Drive and explains S3 constraints in plain words. |
| **Developers and small teams** | Own the bucket, want a quick look or a one-off fix without installing anything. | Connect in under three minutes, no account, no server, keys that stay on their device. |

## Value proposition

> Manage your bucket files the way you already manage files. Open a web page, paste a key, and work. Your keys stay in your browser, and there is no server in between.

### Positioning

| Alternative | Strength | Where Coffer differs |
|---|---|---|
| Provider consoles | Complete admin features | Coffer is built for daily file work, with one UI across 21 presets. |
| Desktop S3 clients (Cyberduck, Transmit, S3 Browser) | Mature, fast, native file access | Nothing to install. Works on a phone. No per-machine setup. |
| Self-hosted Drive clones (Nextcloud, Seafile, FileBrowser) | Accounts, sharing, sync | They need a server, a database and upkeep, and they re-store your files in their own layout. Coffer reads the bucket as it is. |
| rclone or CLI tools | Scriptable | Not for everyday browsing, previews or sharing. |

## Goals

| ID | Goal |
|---|---|
| G-1 | A first-time user reaches a verified connection quickly, with the fewest fields the provider needs. |
| G-2 | Everyday file work (browse, search, upload, download, rename, move, trash, preview, share) feels familiar to a Drive user. |
| G-3 | Credentials never leave the browser. Saved keys are encrypted with a passphrase only the user knows. |
| G-4 | The UI explains S3 constraints honestly instead of hiding them (prefix folders, copy plus delete, page limits, link expiry, CORS). |
| G-5 | Destructive actions are recoverable: Trash, Undo, and an operation journal for interrupted multi-object work. |
| G-6 | One responsive layout works at 375, 768 and 1440 px and meets WCAG 2.2 AA. |
| G-7 | New S3-compatible providers are added as data (a preset), not as code. |
| G-8 | Zero-ops hosting: a static site on any static host, with Cloudflare Pages as the reference target ([ADR-010](adr/ADR-010-deploy-portability.md)). |

## Non-goals

- **No backend.** No proxy, no signing service, no serverless functions.
- **No database.** All state is in the user's browser or in their bucket.
- **No accounts.** Coffer has no sign-in and no user directory.
- **No server-side search.** Search is a client-side filter on names. There is no index.
- **No sync client.** No background sync, no desktop folder mirroring.
- **No bucket administration.** Coffer does not create buckets, edit policies, lifecycle rules or ACLs. It tells people what CORS rule to add.
- **No analytics or telemetry,** and no third-party scripts or fonts.

## Success metrics

Coffer has no telemetry (see non-goals), so metrics come from moderated usability sessions, the provider compatibility matrix and public issue reports, not from product analytics.

| Metric | Target (initial) | How measured |
|---|---|---|
| Time to first successful connection (Welcome → "Connected") | Median ≤ 3 min for R2, B2, Wasabi and S3 with a prepared key | Moderated sessions, 8 or more participants per round |
| Connection-test pass rate on first try (no CORS) | ≥ 60% (CORS is the known blocker) | Sessions and compatibility matrix runs |
| **CORS-fix completion rate** (people who hit `O42_CorsFail` and reach "Connected") | ≥ 80% within 5 min | Sessions |
| Task success on core jobs (upload, rename, move, trash and undo, share link) | ≥ 90% unassisted | Sessions at 375 and 1440 |
| Providers with a documented "works" row in the compatibility matrix | All Popular presets at MVP; 15 of 21 at v1 | [technical-spec.md](technical-spec.md#155-provider-compatibility-matrix) |
| Accessibility | 0 axe serious or critical violations; keyboard-only completion of core jobs | CI plus manual pass |
| Secret hygiene | 0 secrets found in logs, URLs, errors or storage dumps | Automated tests plus security audit before release |

## Key risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| **CORS setup friction.** Browsers block cross-origin S3 calls until the bucket has a rule. | Users give up at step 4. | Dedicated failure screen with the exact origin, JSON and XML, provider-specific steps and a re-check button (FR-6, `O42_CorsFail`). Detect CORS separately from network errors. |
| **Credential security in the browser.** Keys are exposed to any script on the origin. | Account takeover. | Strict CSP, no third-party scripts, encrypted storage (PBKDF2 ≥ 600k to AES-GCM), memory-only option, auto-lock, "Forget this device", scoped-key advice, security audit before release (NFR-1 to NFR-3). |
| **Untrusted bucket content.** File names and contents may be hostile. | XSS, key theft. | Render names as text, HTML as source, SVG as `<img>`, sanitised Markdown, sandboxed iframe (NFR-3). |
| **Provider quirks.** Addressing style, regions, checksums, copy limits and error shapes differ. | "Works on R2, fails on X." | Data-driven presets, `WHEN_REQUIRED` checksums, a compatibility matrix with manual checks, honest per-provider badges. |
| **Data loss from copy plus delete.** A crash mid-move leaves duplicates or gaps. | Lost or duplicated files. | Write-ahead operation journal, verify before delete, resume or discard (FR-45). |
| **Leaked share links.** Presigned URLs cannot be revoked. | Unwanted access. | Explicit expiry, plain warning, 7-day maximum, session-token cap, "rotate the key" guidance (FR-60, FR-61). |
| **Mobile browser limits.** Memory, background tabs, lost file handles after reload. | Uploads stall. | Chunked multipart, "Choose file" resume flow, honest messaging. |
