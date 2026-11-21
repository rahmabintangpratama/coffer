# SECURITY-DESIGN.md

Scope: security-by-design for the Coffer v2 UI. This was written directly from the brief, because no security-audit skill was available in the session where the design was made. **No code audit was performed and none is claimed.** A full security-audit run on the codebase must be done later by the coding agent once the code exists.

## 1. Trust boundaries

| Boundary | Trusted? | Notes |
|---|---|---|
| The person at the keyboard | Yes | Can be tricked into pasting or sharing; the UI explains consequences. |
| Browser storage (IndexedDB, localStorage) | Partly | Readable by anything running on the origin and by people with device access. Secrets are encrypted at rest when saved. |
| App origin (Cloudflare Pages) | Yes, if headers hold | Strict CSP, no third-party scripts. |
| Provider endpoint | Semi | Receives signed requests. Must be https (except localhost). |
| File names and contents in the bucket | **No** | Anyone with write access to the bucket controls them. |
| Share-link recipients | **No** | Anyone holding a link can use it until it expires. |

## 2. Assets

1. Access key ID, secret access key, session token.
2. The passphrase and its derived key.
3. File contents and listings.
4. The operation journal (names of keys being moved).
5. Starred and recent lists (names only).

## 3. Threats → UI mitigations

| Threat | Mitigation in the design |
|---|---|
| Shoulder surfing or screenshots of keys | Secrets shown masked (`••••••••c21`). Revealing needs the passphrase when a connection is saved. Never in toasts, URLs, logs or error text. |
| Clipboard exposure | Copying a secret shows “Copied. Clear your clipboard when you’re done.” Paste detection clears the pasted text after filling. |
| XSS from file names | File names are always rendered as text. Never as HTML, never in `href` without validation. |
| XSS from file contents | HTML is previewed as source with “Shown as code for your safety” and an optional “Render in sandbox” (sandboxed iframe, no scripts, no same-origin). SVG is shown only as an `<img>`. Markdown is sanitized (no raw HTML, links get `rel=noopener noreferrer`). |
| Leaked share links | Creating a link needs an explicit expiry choice (1 hour, 1 day, 7 days) and the text “Anyone with the link can open this file until it expires. Links can’t be revoked early.” The UI explains how to invalidate all links: rotate the access key at the provider. |
| Over-privileged keys | Help text recommends a key limited to one bucket. Bucket pick shows “This key can access 14 buckets. A key limited to one bucket is safer.” |
| Phishing endpoints | If the endpoint host doesn't match `expectedHostPattern` for the chosen provider, show a warning before testing: “This endpoint doesn’t look like a {provider} address.” |
| Plain http | Blocked by browsers on https pages except localhost; the UI says so and doesn't offer a workaround. |
| Accidental data loss | Trash by default with Undo. Typed count for Delete forever above 50 items and for Empty trash. |
| Unattended device | Auto-lock (default 15 minutes), manual Lock, locked screen that needs the passphrase. |
| Lost or shared device | “Forget this device” deletes saved connections, the journal, starred items and recent files, and says exactly that. “What’s stored on this device” lists everything. |
| Weak passphrase | Strength hint, minimum 12 characters suggested, and “We can’t recover this passphrase.” |
| Overly broad CORS | The CORS helper writes the exact origin and warns against `*`. |

## 4. Headers and CSP proposal (Cloudflare Pages `_headers`)

```
/*
  Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob: https:; media-src blob: https:; font-src 'self'; worker-src 'self' blob:; manifest-src 'self'; connect-src 'self' https: http://localhost:* http://127.0.0.1:*; frame-src blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
  Cross-Origin-Opener-Policy: same-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

Notes for the implementer: `worker-src 'self' blob:` is for the pdf.js worker (bundle it, or let it start from a blob), and `manifest-src 'self'` is for the web app manifest. `connect-src https:` is needed because the provider endpoint is user-chosen; keep it as the only broad directive. `img-src https:` and `media-src https:` exist for presigned previews; narrow them to the active endpoint at runtime if possible. No third-party scripts, fonts or analytics. Self-host IBM Plex (OFL) instead of using a font CDN. Sandbox previews live in a `blob:` iframe with `sandbox=""` and no `allow-scripts`.

## 5. Local data inventory

| Item | Where | Encrypted | Removed by |
|---|---|---|---|
| Saved connections (keys, session token) | IndexedDB | Yes: AES-GCM, key from passphrase with PBKDF2 (≥600,000 iterations, random salt) | Forget this device, delete connection |
| Unlocked keys | Memory only | n/a | Lock, auto-lock, tab close |
| Operation journal | IndexedDB | No (key names only) | Forget this device, Discard |
| Upload state (upload IDs, finished parts) | IndexedDB | No | Finish, Discard, Forget |
| Starred | localStorage or IndexedDB | No | Forget this device |
| Recent files | localStorage or IndexedDB | No | Forget this device |
| Settings | localStorage | No | Forget this device |

## 6. What the design does not do

It does not protect against malware or extensions on the device, a compromised provider, or someone who learns the passphrase. The About page and Security settings say that plainly.

## 7. Still to do (by the coding agent)

Run a full security-audit pass on the real code: dependency review, CSP verification in a browser, XSS review of every place that renders bucket data, storage-encryption review, and a check that no secret reaches logs or error reports.
