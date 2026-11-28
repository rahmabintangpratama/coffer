# Changelog

All notable changes to Coffer are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/). Versions below `1.0.0` may change without notice between releases.

## [Unreleased]

### Added

- **Starred and Recent.** Add to or remove from starred in the row menu, the selection bar and the viewer; a Starred view with each item's folder; Recent files on Home. Both are kept in this browser only.
- **Storage usage.** Calculate usage on request: total size, object count and the largest folders, cancellable.
- **Search all of the bucket.** From a search in the current folder, scan the whole bucket by name, with each match's folder.
- **Keyboard shortcuts.** F2, M, S, I, Delete on the list, `/` and Ctrl/⌘+K for search, `?` for the shortcut sheet; hints in the menus.
- **Grid thumbnails** for images.
- **Any static host.** Generated configurations for Cloudflare Pages, Netlify, Vercel, nginx and Caddy from one header file, hosting under a path, and GitHub Pages as a documented weaker option.
- **Connections.** Add, test and edit connections in Settings. Editing tests the connection first and keeps the keys you leave empty.
- **Shell.** New at the top of the sidebar, a Details toggle in Files, the Files link reopens the last folder, Upload and New folder in an empty folder, an Open item for folders, a link to the source on About.

### Fixed

- The viewer's buttons were invisible in the dark theme, its More menu did not open, Details opened behind it with the previous file, and its Back button could land on the bucket root.
- What's stored counted finished operations as interrupted moves.
- Editing a connection to another server never uses the saved keys there.
- Double-click on a file now opens it.
- Toasts: Undo closes the toast and says what was restored, moves name their folder, and toasts no longer cover the sidebar.
- Trash shows a trashed folder as one entry.
- The Move dialog sorts folders like the file list; filter menus open at their chip; the Share dialog names the file.

## [0.1.0] - not yet released

First public release. Coffer is a browser-only, mobile-first file manager for S3-compatible object storage. It is a static site: there is no backend, database or account, and the browser signs every request with the keys you enter and talks directly to your provider.

### Added

- **Connect.** Guided connection for 21 provider presets plus any custom S3-compatible endpoint, with a step-by-step connection test and a ready-to-paste CORS rule for the address you are using.
- **Browse.** Folder navigation with breadcrumbs, a virtualized list and grid, sorting, filtering by name, and a "Load all" mode with a cap.
- **Upload and download.** Multi-file and folder upload, large-file multipart upload with a transfer panel, download, and cancel and retry.
- **Preview.** Images, video, audio, PDF, text and code, SVG, Markdown and HTML. HTML is shown as source, SVG as an image and Markdown is sanitized.
- **File operations.** Rename, move, copy and delete, with a Trash you can restore from and an undo for the last action. Operations are journaled so an interrupted move can be recovered.
- **Share links.** Presigned links with a chosen expiry, shown once in the dialog and never stored.
- **Save on this device.** Optional encrypted storage of a connection behind a passphrase (PBKDF2, AES-GCM, non-extractable key), auto-lock, cross-tab lock and "Forget this device".
- **Settings.** Appearance, security, connection and about pages.
- **Read-only connections.** A key that cannot write is detected and the app hides every write action.
- **Accessibility.** Keyboard path for every flow, visible focus, 44 px touch targets on mobile, light and dark themes, reduced-motion support.

### Security

- A strict Content-Security-Policy, set in `public/_headers`, with no inline script, no `unsafe-eval` and no third-party origin. Fonts are self-hosted.
- Keys, session tokens, passphrases and presigned links are never logged, put in a URL or stored unencrypted.
- No analytics, telemetry or error-reporting SDK.

### Known limits

- Providers that do not allow browser access (for example Oracle OCI) cannot be used. Coffer says so during the connection test.
- Search, folder zip, drag-to-move, resume after reload, Starred, Recent, Storage usage, change passphrase and the demo workspace are planned for v1.

### Verification

See [docs/release-checklist.md](docs/release-checklist.md) for the evidence behind this release and [docs/security-audit-0.1.0.md](docs/security-audit-0.1.0.md) for the security audit.

[Unreleased]: https://github.com/rahmabintangpratama/coffer/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/rahmabintangpratama/coffer/releases/tag/v0.1.0
