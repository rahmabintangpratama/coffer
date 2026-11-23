# Coffer 0.1.0 release notes (draft)

- **Purpose:** the text of the 0.1.0 release announcement, to be published with the git tag `v0.1.0` after the owner's checks in phase B.
- **Status:** Draft
- **Last updated:** 2026-11-22
- **Source files in `design/`:** none
- **Related:** [../CHANGELOG.md](../CHANGELOG.md), [release-checklist.md](release-checklist.md), [security-audit-0.1.0.md](security-audit-0.1.0.md), [contrast-report.md](contrast-report.md), [manual-test-plan.md](manual-test-plan.md)

Fill the two `[ ]` marks from the owner's results in phase B before publishing. Delete this paragraph then.

## Coffer 0.1.0

Coffer is a file manager for the S3-compatible bucket you already have. It runs in your browser as a static site: there is no server, no account and no database. Your browser signs each request with the keys you type in and sends it straight to your provider. The keys never go anywhere else.

### What you can do

- Connect Cloudflare R2, Backblaze B2, Wasabi, Amazon S3, DigitalOcean Spaces, MinIO and 15 more services, or any other S3-compatible endpoint. A step-by-step test tells you what is wrong (wrong key, wrong region, missing CORS rule) and gives you the rule to paste for the address you are on.
- Browse, search the current folder, sort, and select many files. Upload files and folders, including large files in parts. Download.
- Preview images, video, audio, PDF, text and code, SVG, Markdown and HTML. HTML is shown as source or in a sandbox that cannot run anything.
- Rename, copy, move and delete. Deleted files go to a Trash you can restore from, and the last action can be undone.
- Make a share link for a chosen time.
- Keep a connection on this device, encrypted with a passphrase of your choice, and lock it again. "Forget this device" removes everything Coffer stored.
- Connect with a read-only key and Coffer hides every action that would write.

### What was checked

- **Security:** an audit of the source found three problems that are fixed in this release (a saved connection could be pointed at another host by someone with access to your browser profile; restoring a folder from the Trash could overwrite existing files; a lock that arrived while unlocking could be undone). Four more points depend on how your provider behaves and are listed in [the audit](security-audit-0.1.0.md). The audit did not execute the code (no sandbox was available), so it is a source review.
- **Content-Security-Policy:** every end-to-end test fails on a console error or a policy violation, under the real headers. No inline script, no third-party origin, self-hosted fonts.
- **Accessibility:** axe finds no serious or critical issue on any screen or state in light and dark at 375, 768 and 1440 px (in Firefox axe could not run on two screens, the Move dialog and the Security page, and runs with two rules left out elsewhere). Every flow that has a keyboard path was run with the keyboard only. A real-browser contrast pass measured 254 colour pairs in Chromium, WebKit and Firefox ([report](contrast-report.md)); the known deviations are documented. Screen readers: [ ] VoiceOver (macOS, iOS), [ ] NVDA.
- **Performance:** on a mobile profile (4x CPU slowdown, 9 Mbps) Welcome is interactive in 0.9 s with 112.9 KiB of JavaScript. Unlock needs 128.7 KiB, which is 8.7 KiB over the budget we set; it is recorded as [OQ-38](open-questions.md).
- **Browsers:** Chrome and Edge (Chromium), Safari (WebKit) and Firefox in automated tests; [ ] real iPhone and Android, [ ] Chrome, Edge, Firefox and Safari by hand, including Local Network Access.
- **Providers:** [ ] result of the provider matrix, see [manual-test-plan.md](manual-test-plan.md).

### Known limits

- Providers that do not allow browser access (for example Oracle OCI) cannot be used. Coffer says so during the connection test.
- Coffer needs a CORS rule on the bucket. The connection test shows the exact rule.
- Search across a whole bucket, folder download as zip, drag to move, resume after reload, Starred, Recent, storage usage, change passphrase and a demo workspace come in a later version.

### Install

There is nothing to install. Open the address, connect a bucket, and use a throwaway bucket and a scoped key while the version is `0.x`.
