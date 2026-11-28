# Coffer product specification

- **Purpose:** Define what Coffer does: personas, features, requirements (FR-x), testable acceptance criteria (AC-x.y), states, edge cases, linked screens and the release plan.
- **Status:** Draft
- **Last updated:** 2026-11-21
- **Source files:** [`design/screens.md`](../design/screens.md), [`design/ux-patterns.md`](../design/ux-patterns.md), [`design/components.md`](../design/components.md), [`design/copy.en.json`](../design/copy.en.json), [`design/types.ts`](../design/types.ts), [`design/providers.json`](../design/providers.json), [`design/SECURITY-DESIGN.md`](../design/SECURITY-DESIGN.md), [`design/accessibility.md`](../design/accessibility.md), [`design/HANDOFF.md`](../design/HANDOFF.md)
- **Related:** [product-brief.md](product-brief.md) (goals G-x), [technical-spec.md](technical-spec.md) (how), [open-questions.md](open-questions.md)

**Conventions.** `FR-n` is a functional requirement, `AC-n.m` its acceptance criterion (Given/When/Then), `NFR-n` a non-functional requirement (section at the end). Screen IDs are board IDs from `design/screens.md`; `T..` boards are state sheets. Each feature lists its states: *empty, loading, partial, error, success* (omitted when not applicable). **MVP** and **v1** tags are defined in [Release plan](#release-plan).

## Personas and jobs-to-be-done

| Persona | Description | Jobs-to-be-done |
|---|---|---|
| **Mina, the Drive migrator** | Has used Google Drive for ten years. Keeps backups and media in a Backblaze or R2 bucket. Mostly on a phone. Not comfortable with IAM. | *When* I need a file from my bucket, *I want* to find, preview and send it like in Drive, *so that* I don't need a desktop app or a console. *When* I delete something by mistake, *I want* Undo. |
| **Dev, the developer** | Owns buckets on several providers. Wants to inspect, fix or hand over files fast. Cares where keys go. | *When* I need to check an upload or fix a key name, *I want* to connect in minutes with a scoped key, *so that* I never paste secrets into a third-party service. *When* CORS blocks me, *I want* the exact rule to paste. |
| **Sam, the small-team admin** | Shares a bucket with two or three teammates and sends client deliverables. | *When* I deliver a file, *I want* a link with a clear expiry, *so that* I know how long it is open. *When* a teammate has a read-only key, *I want* the app to say so, not fail silently. |

## S3 constraints the UI must explain

The UI never hides these. Each one is surfaced where it affects the person.

| Constraint | What the UI says or does | Where |
|---|---|---|
| **Folders are key prefixes.** A folder with no objects under it disappears. | "Folders are created from file paths." Empty folders exist only as a zero-byte placeholder object (see [C-18](open-questions.md#owner-confirmed-decisions)). | FR-35, `files.emptyBucket.body` |
| **Rename and move are copy plus delete.** | Progress in the Transfer panel when over 1 s. Folders go through the journal. A rename dialog says names can't contain `/` (use Move). | FR-32, FR-34, FR-45 |
| **Listings arrive in pages of 1,000 keys.** | The first 2,000 items load. A banner offers "Load all" (opt-in, progress, capped at 100,000 keys with a message). Sorting by size or date needs all items. | FR-21 |
| **Search is current-folder only and by name.** No content search, no bucket index. | Search filters the folder you are in; v1 adds an opt-in "Search all of {bucket}" scan. See [C-10](open-questions.md#owner-confirmed-decisions). | FR-23 |
| **Presigned links last at most 7 days and can't be revoked.** | Explicit expiry, warning text, "rotate the access key to cancel all links." | FR-60 |
| **Session tokens cap link life.** | Longer choices are disabled and explained. | FR-61 |
| **CORS is required.** | Dedicated failure screen with the exact origin, JSON and XML. | FR-6 |
| **Browsers block `http` endpoints on `https` pages** (except localhost). | A plain explanation, no workaround offered. | FR-5, `ob.fail.net.*` |
| **No atomic folder operations.** | Journal with resume or discard. | FR-45 |
| **Storage usage needs a full listing.** | Computed on request, with a cost note. | FR-90 |

---

## 1. Onboarding and connection

#### FR-1 Welcome and entry points (MVP)
**Story:** As a new visitor, I want to understand what Coffer is and start in one tap, so that I can decide to connect or look around first.
**Acceptance**
- AC-1.1 Given no saved connections, When the app opens, Then the Welcome screen shows the headline, three facts and `Connect a bucket`. `Explore with sample files` appears from v1 (FR-120) and is hidden in MVP.
- AC-1.2 Given saved connections exist, When the app opens, Then the person lands on Unlock (FR-9), not Welcome.
- AC-1.3 Given a 1440 px viewport, When Welcome is shown, Then a sample file list appears at the right; at 375 px it does not and no horizontal scroll occurs at 360 px. (The list is not built in the MVP, [D-30](open-questions.md#decisions-made-on-the-owners-behalf); the no-scroll part applies.)

**States:** success only.
**Edge cases:** the provider count in `ob.factProviders` comes from the number of presets in `providers.json`.
**Screens:** `O10_Welcome`

#### FR-2 Provider selection (MVP)
**Story:** As a user, I want to pick my provider from a short list or search, so that I only see the fields my provider needs.
**Acceptance**
- AC-2.1 Given the provider screen, When it loads, Then Popular presets show in large rows in `popularOrder` and all presets show alphabetically below, with `Other S3-compatible service` last.
- AC-2.2 Given the search field, When the person types "back", Then only matching providers show; When nothing matches, Then the empty state offers the generic option (`ob.provider.none.*`).
- AC-2.3 Given a preset with a badge (Oracle OCI, Alibaba OSS), When its row renders, Then the badge text is part of the row's accessible name.
- AC-2.4 Given the person picks Oracle OCI, When they continue, Then a warning explains that browser access may not work and the flow continues.

**States:** empty search result; success.
**Edge cases:** search matches `displayName` and `id` (case-insensitive, diacritics-insensitive). Groups follow [C-14](open-questions.md#owner-confirmed-decisions).
**Screens:** `O20_Provider`, `O21_ProviderStates`

#### FR-3 Credentials form from presets (MVP)
**Story:** As a user, I want the form to ask only for what my provider needs, in my provider's words, so that I don't guess.
**Acceptance**
- AC-3.1 Given a preset, When the form renders, Then fields appear in `fields` order with the provider's `label` and the generic S3 term as a caption.
- AC-3.2 Given the preset has `endpointTemplate`, When required fields are filled, Then a read-only endpoint preview shows the built URL with an `Edit` action.
- AC-3.3 Given `showWhen` or `roleWhen` on a field (Supabase), When the controlling field changes, Then dependent fields appear or disappear and the right credential roles are used.
- AC-3.4 Given a field `validation`, When the value fails it (for example the R2 account ID is not 32 hex characters), Then the error says what is wrong, why and what to do, is linked with `aria-describedby`, and appears under the field.
- AC-3.5 Given the endpoint host does not match the preset's `expectedHostPattern`, When the person continues, Then the warning `form.endpointHostWarn` shows before any request is sent.
- AC-3.6 Given the secret field, When shown, Then it is masked; the connection name is generated and never asked.
- AC-3.7 Given `Advanced options` is collapsed by default, When opened, Then addressing style (Auto, Path, Virtual-hosted) and any optional session token field are shown. Presets with `addressingLocked` show the style as fixed.
- AC-3.8 Given an `http` endpoint that is not localhost on an `https` page, When validated, Then the form blocks it with `ob.fail.net.*` wording before testing.
- AC-3.9 Given `Advanced options`, When the person enters a value in the optional `Start in folder` text field (a standard Input), Then it becomes the connection root: Files opens there, the breadcrumb cannot go above it, and the connection test, Trash and Storage work under it. An empty value means the bucket root.
- AC-3.10 Given a preset with `sessionToken: true` and no token field, When Advanced is open, Then optional `Session token` and `Token expires at` fields are shown.

**States:** pristine, invalid, valid, advanced open, host warning.
**Edge cases:** Tencent `bucketSuffix` (`-{appId}`) is appended to the bucket name; the form tells the person bucket names end with the APPID. Region rules (`fixed`, `equals`, `fromEndpoint`, `custom`, `optional`, `required`) decide whether a region field is shown.
**Screens:** `O30_CredR2`, `O31_CredTencent`, `O32_CredSupabase`, `O33_CredCustom`, `O35_CredWarnings`

#### FR-4 Paste credentials (MVP)
**Story:** As a developer, I want to paste a block of config and have the form fill itself, so that I don't retype keys.
**Acceptance**
- AC-4.1 Given AWS-style env lines (`AWS_ACCESS_KEY_ID=…`), When pasted, Then matching fields fill and each shows a "detected" marker.
- AC-4.2 Given an rclone `[remote]` block, When pasted, Then keys map using the preset's `rcloneKeys` and a block whose `provider` value differs from `rcloneProviderValue` is still parsed but shows a mismatch note.
- AC-4.3 Given a bare endpoint, When pasted, Then the preset's `endpointPattern` named groups fill fields, using `endpointPatternDefaults` for groups that did not match.
- AC-4.4 Given the form is filled, When the action completes, Then the paste area is cleared and nothing is stored or sent (`ob.paste.privacy`).
- AC-4.5 Given unparseable text, When pasted, Then no field changes and a message says what formats are accepted.
- AC-4.6 Given `AWS_SESSION_TOKEN` and `AWS_CREDENTIAL_EXPIRATION` (ISO 8601) in the paste, When pasted, Then the session token and `Token expires at` fields fill with a "detected" marker and `sessionTokenExpiresAt` is set; an unparseable or past time is ignored with a note.

**States:** empty, detected, nothing detected.
**Edge cases:** CRLF line endings; quoted values; `export` prefix; both `AWS_ENDPOINT_URL` and `AWS_ENDPOINT_URL_S3` present (the S3-specific one wins). The pasted text is never logged.
**Screens:** `O34_Paste`

#### FR-5 Connection test (MVP)
**Story:** As a user, I want Coffer to check my connection and tell me exactly what is wrong, so that I can fix it without guessing.
**Acceptance**
- AC-5.1 Given valid details, When the person taps `Connect`, Then the six steps (Reach endpoint, Check CORS, List objects, Write a test file, Read it back, Clean up) run automatically, each with a text status.
- AC-5.2 Given all steps pass, When the test ends, Then "Connected" shows with `Choose a bucket` (or `Open bucket` when one was given, [D-31](open-questions.md#decisions-made-on-the-owners-behalf)).
- AC-5.3 Given the endpoint cannot be reached, When step 1 fails, Then the message names the endpoint, explains (for example "browsers block http endpoints on https pages") and offers `Edit endpoint`.
- AC-5.4 Given a signature error, When step 3 fails, Then the screen says the secret may have a stray space or the device clock is off, with the offset in minutes when known.
- AC-5.5 Given the bucket is in another region, When listing fails, Then the screen offers `Use {region}` and re-tests on tap.
- AC-5.6 Given AccessDenied on listing, When it fails, Then the message says the key is valid but cannot list `{bucket}` and what to do.
- AC-5.7 Given the test writes a file, When the test finishes, Then the test object is deleted (step 6). If deletion fails, the outcome is `failed` with `accessDenied` on the clean step.
- AC-5.8 Given an endpoint on localhost or a private address and a page on a less private address, When the browser would ask for local network access, Then a short explanation shows before any request, never on page load, and `Continue` starts the test ([C-54](open-questions.md#owner-confirmed-decisions)).
- AC-5.9 Given local network access is denied or the prompt was dismissed and the request fails, Then the failure is `localNetworkDenied` with how to allow it in site settings, not a generic network error.

**States:** running, each step pending/running/pass/fail/skipped, ok, failed, readOnly.
**Edge cases:** steps after a failure show `skipped`. The test never touches existing keys. The test file is written under the connection's start folder when one is set, otherwise in the bucket root. Test key naming and the CORS-versus-network detection are in [technical-spec.md](technical-spec.md#5-connection-test-algorithm).
**Screens:** `O40_Connecting`, `O41_ConnectedOk`, `O43_FailStates`

#### FR-6 CORS failure helper (MVP)
**Story:** As a user whose bucket blocks the browser, I want the exact rule and where to paste it, so that I can fix it in minutes.
**Acceptance**
- AC-6.1 Given step 2 fails as CORS, When the failure screen shows, Then it displays the exact app origin (`window.location.origin`), a JSON tab and an XML tab, a `Copy` button, and provider-specific steps from `helpSteps`.
- AC-6.2 Given the rule is shown, When copied, Then it allows only the current origin (never `*`), exposes `ETag` and the headers Coffer needs, and the screen warns against `*` (`ob.cors.warn`).
- AC-6.3 Given the person taps `I've added it · Check again`, When the test re-runs, Then it starts at step 2 and continues on success.
- AC-6.4 Given Oracle OCI, When CORS fails, Then the screen explains that the provider's S3 API may not allow browser access.

**States:** failed, re-checking, passed. The rule is not a secret, so copying it shows a plain "Copied" toast, not the clipboard warning.
**Edge cases:** the origin changes between production and preview deployments, so each needs its own entry. A bucket whose CORS already allows the origin but whose error responses lack CORS headers looks the same as a CORS failure; the screen says so in its "still failing?" line.
**Screens:** `O42_CorsFail`

#### FR-7 Bucket selection (MVP)
**Story:** As a user whose key sees several buckets, I want to pick one and be told if my key is too broad.
**Acceptance**
- AC-7.1 Given the key can list N buckets, When the picker shows, Then it lists them with a search field and the text "This key can access N buckets. A key limited to one bucket is safer."
- AC-7.2 Given a bucket was supplied in the form, or only one exists, When the test passes, Then the picker is skipped.
- AC-7.3 Given the key cannot list buckets, When the picker would show, Then it offers manual entry only.
- AC-7.4 Given no bucket was entered and the first signed call is blocked by CORS or denied, When the test ends, Then the person types the bucket name and the CORS help shows for that bucket if it is blocked ([D-28](open-questions.md#decisions-made-on-the-owners-behalf)).

**States:** loading, list, search no-result, manual entry.
**Edge cases:** more than 50 buckets shows "and N more" with search. Providers that return 403 for `ListBuckets` fall to manual entry.
**Screens:** `O50_PickBucket`

#### FR-8 Save on this device (MVP)
**Story:** As a returning user, I want to keep my connection encrypted on this device, so that I don't re-enter keys.
**Acceptance**
- AC-8.1 Given a passing connection, When "Save on this device?" shows, Then it offers `Save with a passphrase` and `Not now`, and says the passphrase cannot be recovered.
- AC-8.2 Given the person saves, When the passphrase is under 12 characters, Then saving is blocked with a message that says what is wrong and what to do; at 16 or more characters an advisory "strong" hint shows.
- AC-8.3 Given the person saves, Then the credentials are stored as AES-GCM ciphertext with a PBKDF2 key (at least 600,000 iterations); no plaintext key is written to any storage.
- AC-8.4 Given `Not now`, Then the keys stay in memory and are gone on reload or tab close.

**States:** form, saving, saved, skipped.
**Edge cases:** passphrase manager autofill; a second saved connection reuses the existing passphrase after unlock.
**Screens:** `O51_SaveDevice`

#### FR-9 Unlock, lock and auto-lock (MVP)
**Story:** As a user with saved connections, I want the app to lock when I'm away, so that a borrowed or unattended device can't use my keys.
**Acceptance**
- AC-9.1 Given saved connections, When the app opens, Then the Unlock screen asks for the passphrase.
- AC-9.2 Given a wrong passphrase, When submitted, Then `ob.unlock.wrong` shows and keys remain locked.
- AC-9.3 Given auto-lock is N minutes (default 15), When the person has been inactive for N minutes, Then the saved keys and the derived key are cleared from the vault, the Locked screen shows, and no new operation can start; transfers that are already running continue to completion with in-memory credentials.
- AC-9.4 Given the person taps Lock (menu or palette), When confirmed, Then the same lock occurs immediately.
- AC-9.5 Given unlock succeeds after an auto-lock, Then queued transfers start and the person returns to their previous folder.
- AC-9.7 Given transfers are running when the app locks, Then the Locked screen shows a `Banner` with the number of transfers still finishing and a secondary `Button` `Stop transfers and lock`; choosing it cancels them (multipart uploads are aborted), releases their credentials and completes the lock. "Forget this device" always cancels them.
- AC-9.6 Given the app is locked, When a transfer is queued but not yet started, Then it waits (status "waiting for unlock") and starts only after unlock.
- AC-9.8 Given more than one tab of Coffer is open, When any of them locks (manually or by auto-lock) or stops transfers and locks, Then every tab drops its keys and shows the Locked screen within about a second; "Stop transfers and lock" stops the running transfers of every tab. Unlocking in one tab does not unlock the others.

**States:** locked, unlocking (derivation in progress), wrong passphrase, unlocked.
**Edge cases:** the lock timer counts pointer, key and touch input, and does not count running transfers as activity (see [C-27](open-questions.md#owner-confirmed-decisions)). Running transfers keep a private credential lease until they finish; see tech spec section 9. Auto-lock "never" (0) shows a warning.
**Screens:** `O60_Unlock`, `O61_UnlockWrong`, `O62_Locked` (the transfers banner uses the existing `Banner` and a secondary `Button`)

#### FR-10 Forget this device (MVP)
**Story:** As a user on a shared or lost device, I want one action that removes everything Coffer stored.
**Acceptance**
- AC-10.1 Given Forget this device, When opened, Then the dialog lists exactly what is deleted (connections and keys, journal, starred and recent) and says buckets and files are not changed.
- AC-10.2 Given saved connections exist, When the person types the saved-connection count, Then the filled danger button enables; before that it is disabled.
- AC-10.3 Given the person confirms, Then every item in the local data inventory is removed, in-memory keys are cleared and the app returns to Welcome.
- AC-10.4 Given the action runs, Then a reload shows an empty inventory in `What's stored on this device`.
- AC-10.5 Given more than one tab is open, When the device is forgotten in one of them, Then every tab stops its transfers, lets go of the database and returns to Welcome.

**States:** confirm (disabled), confirm (enabled), done.
**Edge cases:** open IndexedDB connections are closed first. Share links already created keep working until they expire (the dialog does not claim otherwise).
**Screens:** `O63_Forget`, `S51_SettingsSecurity`

#### FR-11 Connection switcher and multiple connections (MVP)
**Story:** As a user with several buckets, I want to switch connection from anywhere.
**Acceptance**
- AC-11.1 Given two or more connections, When the avatar (mobile, rail) or sidebar block is activated, Then the switcher lists them with lock state in the accessible name.
- AC-11.2 Given a locked connection is chosen, When selected, Then Unlock appears.
- AC-11.3 Given `Add connection`, When chosen, Then onboarding starts without losing the current session.
- AC-11.4 Given a connection is removed in Settings, Then only that connection's data in this browser is deleted: its keys, its transfers, its unfinished uploads and its Starred and Recent entries (AC-102.5 to AC-102.7). Bucket data and other connections are untouched.
- AC-11.5 Given Settings → Connections, Then each row names the connection by provider and bucket and says whether it is encrypted with the passphrase or only in memory; the page offers `Add connection` (AC-11.3), and each row `Test connection` (the six onboarding steps against the saved keys, ending in "Connection works" or "Connection test failed" with the failed step) and, for a saved connection, `Rename` (the label only; see [OQ-38](open-questions.md#oq-38-editing-a-saved-connections-endpoint-region-or-bucket)).

**States:** one connection, several, locked entries.
**Screens:** `S37_ConnSwitch`

#### FR-12 Session-token connections (MVP)
**Story:** As a Supabase or STS user, I want to connect with a temporary token and know what that means.
**Acceptance**
- AC-12.1 Given a preset with `sessionToken`, When the person uses token mode, Then the session token is stored with the other secrets and requests are signed with it.
- AC-12.2 Given the token's expiry is known (JWT `exp`, `AWS_CREDENTIAL_EXPIRATION` or the `Token expires at` field), Then `sessionTokenExpiresAt` is stored and the Share dialog uses it (FR-61). If it is unknown, links are capped at 1 hour and the dialog says so.
- AC-12.3 Given the token has expired, When a request fails with `ExpiredToken`, Then the app prompts for new credentials and does not retry silently.

**States:** valid, expiring, expired.
**Edge cases:** expiry sources and the 1-hour fallback are [C-12](open-questions.md#owner-confirmed-decisions).
**Screens:** `O32_CredSupabase`, `S43_ShareSessionToken`

#### FR-13 Coach tips (v1)
**Story:** As a first-time user, I want light hints anchored to the UI, so that I find context menus, drag-to-upload and search.
**Acceptance**
- AC-13.1 Given the first successful connection, When Files opens, Then tip 1 of 3 shows anchored to a row menu; dismissing advances and records `coachTipsSeen`.
- AC-13.2 Given tips were dismissed, When the app reloads, Then they do not return.
- AC-13.3 Given a tip is shown, Then it uses `role=status`, never traps focus and never blocks the screen.

**States:** tip 1, 2, 3, done.
**Screens:** `O52_Coach`, `O53_CoachTips`

---

## 2. Browse and search

#### FR-20 File list and grid (MVP)
**Story:** As a user, I want to see my files like in Drive, in a list or grid, sorted my way.
**Acceptance**
- AC-20.1 Given a folder, When it loads, Then folders show first, then files, in the chosen sort (Name, Last modified, File size, asc or desc).
- AC-20.2 Given 375 px, When the list shows, Then rows are 56 px with icon, name over "date · size" and a 44 px ⋮; at 768 and above rows are 48 px with Name, Last modified, File size and ⋮.
- AC-20.3 Given the grid toggle, When selected, Then FolderTiles and FileTiles show (2 columns at 375; auto-fill min 176 at 768 and 200 at 1440) and the choice persists in Settings.
- AC-20.4 Given a folder with thousands of items, When scrolled, Then rows are virtualized and scrolling stays smooth (NFR-4).
- AC-20.5 Given the list has focus, When arrow keys are pressed, Then focus moves between rows and the list is a single tab stop.
- AC-20.6 Given file names, When rendered, Then they are text only and long names truncate in the middle of the extension (never wrap the layout).

**States:** loading (skeleton), empty folder (`files.emptyFolder.*`), empty bucket (`files.emptyBucket.*`), error (`files.error.*`), partial (FR-21), success.
**Edge cases:** hidden files (names starting with a dot) are hidden unless `showHiddenFiles`; the trash prefix (`.coffer-trash/` under the connection root) is always hidden here, and a user's own `.trash/` folder is shown like any other folder. Keys ending in `/` that are not placeholders. Names with leading or trailing spaces, RTL text and emoji render correctly.
**Screens:** `S10_FilesList`, `S11_FilesGrid`, `T10_FileStates`, `T10b_FileStates`

#### FR-21 Listing pagination and "Load all" (MVP)
**Story:** As a user with a big folder, I want to know the list is partial and be able to load everything on purpose.
**Acceptance**
- AC-21.1 Given more than 2,000 items, When the folder opens, Then the first 2,000 show with the banner "Showing 2,000 items · Load all to sort by size".
- AC-21.2 Given `Load all`, When tapped, Then pages load with a progress count and can be cancelled.
- AC-21.3 Given the cap of 100,000 keys is reached, Then loading stops and a message says the list is incomplete.
- AC-21.4 Given a partial list, When the person sorts by size or date, Then the app explains that sorting applies to loaded items until all are loaded.
- AC-21.5 Given pull-down refresh on mobile, Then the listing reloads from page 1.

**States:** partial, loading all, capped, complete.
**Edge cases:** a prefix with exactly 2,000 items shows no banner. Network failure on page 2 keeps page 1 and shows a retry in the banner.
**Screens:** `S10_FilesList`, `T10_FileStates`

#### FR-22 Navigation, breadcrumb and shells (MVP)
**Story:** As a user, I want familiar navigation on every screen size.
**Acceptance**
- AC-22.1 Given width below 768, Then the top app bar, bottom nav (Home, Starred, Files, More) and FAB show; More opens the sheet with Trash, Storage, Settings.
- AC-22.2 Given 768 to 1023, Then the 80 px navigation rail and app bar show; from 1024, the 256 px collapsible sidebar.
- AC-22.3 Given the menu button on mobile, When tapped, Then the drawer opens, traps focus and closes on Esc, scrim tap or swipe left.
- AC-22.4 Given a nested folder, When the breadcrumb shows, Then at 375 it reads `Root › … › current ▾` and the ▾ menu offers the folder actions.
- AC-22.5 Given any folder, Then its path is in the URL hash and a reload returns to it; no key names are sent to the host (NFR-8).
- AC-22.6 Given a layout breakpoint, Then layout switches by container width, not viewport width.
- AC-22.7 Given a folder was open earlier in the session, When `Files` is chosen from another screen, Then that folder opens again for the active connection; chosen on Files, it goes to the top. The memory is per connection, for the session only, and cleared on lock (M11).

**States:** current, hover, focus, drawer open.
**Screens:** `S10_FilesList`, `S18_BreadcrumbMenu`, `S38_MoreSheet`, `S40_NavDrawer`

#### FR-23 Search and filters (MVP)
**Story:** As a user, I want to find a file by name in the folder I'm in.
**Acceptance**
- AC-23.1 Given text in the pill, When typed, Then loaded items in the current folder filter by name (case-insensitive, substring) with no request to the bucket.
- AC-23.2 Given `Type` and `Modified` chips, When a value is chosen, Then results narrow and chips show `aria-pressed`.
- AC-23.3 Given no match, Then `search.none.*` shows with `Clear filters`.
- AC-23.4 Given `/` is pressed with the list focused, Then the pill gets focus; Esc clears then blurs.
- AC-23.5 Given a partial listing, When search runs, Then the app says results cover loaded items only and offers `Load all`.
- AC-23.6 (v1, built in M11) Given a search in the pill (the no-results state, or a link above the results), When the person taps `Search all of {bucket}`, Then a bounded, cancellable scan of the bucket (no delimiter, up to 100,000 keys, names only) runs with a progress count and shows matches with their folder; reaching the cap shows the same incompleteness message as Load all.

**States:** idle, results, no results, partial scope.
**Edge cases:** the design copy says "Search in {bucket}"; the pill searches the current folder, so the placeholder and no-results copy name exactly what was searched: "Search names in {folder}", or "at the top of {bucket}" at the root, and say that folders inside were not searched (additions file, [C-10](open-questions.md#owner-confirmed-decisions)). The bucket-wide scan leaves out hidden names and `.coffer-trash/` unless hidden files are shown, shows matches 50 at a time, filters what it scanned as the person types (no new requests), and each match links to itself and to its folder.
**Screens:** `S12_FilesSearch`

#### FR-24 Home (MVP, Recent section in FR-81)
**Story:** As a user, I want a starting page with my buckets.
**Acceptance**
- AC-24.1 Given Home, When it opens, Then a Buckets block lists the connection's bucket(s) with provider and object count when known.
- AC-24.2 Given no recent items, Then the Recent section is hidden.

**Screens:** `S14_Home`

#### FR-25 Command palette (v1)
**Story:** As a desktop user, I want ⌘/Ctrl+K to jump anywhere.
**Acceptance**
- AC-25.1 Given 1440 px, When ⌘/Ctrl+K is pressed, Then a 600 px top-aligned palette opens with the combobox/listbox pattern.
- AC-25.2 Given text typed, Then commands (go to Starred, Trash, Lock, shortcuts, search in bucket) and loaded files filter.
- AC-25.3 Given width below 1024, Then the palette is not available.

**Screens:** `S33_Palette`

#### FR-26 Keyboard shortcuts (v1, built in M11)
**Story:** As a keyboard user, I want Drive-like shortcuts.
**Acceptance**
- AC-26.1 Given list focus, When `Enter`, `Space`, `F2` or `N`, `M`, `S`, `I`, `Del` (or `Backspace`), `Shift+Del` are pressed, Then the mapped action runs on the selection, or on the focused item when nothing is selected. `Shift+Del` in Files is not built yet (Delete forever stays in Trash, AC-71.4).
- AC-26.4 Given Files on a desktop layout and no dialog open, When `⌘/Ctrl+K` is pressed, Then the search pill gets focus (until the command palette, FR-25, exists); When `Esc` is pressed with a selection, Then it clears wherever focus is.
- AC-26.2 Given focus is in a text field or dialog, Then single-key shortcuts do not fire.
- AC-26.3 Given `?` is pressed, Then the shortcuts sheet opens; Esc closes the top layer first, then clears selection.

**Edge cases:** single-key shortcuts are active only with list focus, which satisfies WCAG 2.1.4.
**Screens:** `S34_Shortcuts`

#### FR-27 Details panel (MVP)
**Story:** As a user, I want a file's details, including its full key.
**Acceptance**
- AC-27.1 Given a file, When Details opens, Then it shows thumbnail, type, size (with exact bytes), location, full key (mono, copyable), modified, ETag, content type.
- AC-27.2 Given `Copy key`, Then the key is copied and a toast confirms.
- AC-27.3 Given 375 px, Then Details is a bottom sheet; at 768 a 360 px overlay panel; from 1024 an in-layout panel toggled by ⓘ.

**States:** loading metadata, loaded, error. Metadata comes from the listing; `HeadObject` fills content type if missing.
**Screens:** `S19_Details`

---

## 3. Selection and actions

#### FR-30 Selection model (MVP)
**Story:** As a user, I want to select one or many items the way Drive does.
**Acceptance**
- AC-30.1 Given desktop, When click, Shift+click, ⌘/Ctrl+click or drag on empty space occur, Then the selection is single, range, toggled or box respectively; ⌘/Ctrl+A selects all loaded items.
- AC-30.2 Given mobile, When long-press occurs, Then selection mode starts with check circles; tapping toggles; ✕ exits.
- AC-30.3 Given a selection, Then the selection bar shows count (live region), and actions that don't apply are disabled (`Share link` disabled for multiple items and folders).
- AC-30.4 Given navigation, Esc, or a completed action, Then the selection clears.
- AC-30.5 Given a selected row, Then it shows `bg.selected`, a filled checkbox and a 2 px leading accent edge (never color alone).
- AC-30.6 Given desktop, When an item is double-clicked, Then it opens like `Enter`: a folder navigates and a file opens in Preview. On a phone a tap opens (outside selection mode).

**States:** none, one, many, read-only (FR-111).
**Screens:** `S15_Selection`, `S39_TrashSelect`, `S42_ReadOnlyMenu`

#### FR-31 Context menus (MVP)
**Story:** As a user, I want every action on one menu.
**Acceptance**
- AC-31.1 Given a file, When right-click, ⋮, Shift+F10 or the Menu key is used, Then the menu shows Preview/Open, Download, Rename, Make a copy, Share, Organize (Move…, Add to starred), Details, Move to trash.
- AC-31.2 Given 375 px, Then the menu is a bottom action sheet with a file header.
- AC-31.4 Given a folder, Then its menu starts with Open; from 768 px every action with a shortcut shows it at the end of the item and in `aria-keyshortcuts` (FR-26).
- AC-31.3 Given a folder, Then Preview and Share are absent and Download is "Download as .zip" (v1).

**Screens:** `S16_ContextMenu`, `S17_NewMenu`

#### FR-32 Rename (MVP)
**Story:** As a user, I want to rename a file or folder.
**Acceptance**
- AC-32.1 Given a file, When renamed to a new valid name, Then the object is copied to the new key, verified, and the old key deleted; progress shows if it takes more than 1 s.
- AC-32.2 Given a name containing `/`, Then the dialog shows `dlg.rename.err.slash` and does not submit.
- AC-32.3 Given the new key already exists, Then the person is asked Replace, Keep both or Skip; for a folder, Keep both or Merge (D-42).
- AC-32.4 Given a folder, When renamed, Then every object under the prefix is copied and deleted via the journal (FR-45).
- AC-32.5 Given success, Then a toast offers Undo while the journal entry exists.

**States:** idle, validating, running, success, error (source untouched).
**Edge cases:** extension preserved in the suggested selection; case-only renames on providers that fold case; keys longer than 1,024 bytes are rejected with a clear message.
**Screens:** `S21_Rename`

#### FR-33 Make a copy (MVP)
**Story:** As a user, I want a duplicate of a file.
**Acceptance**
- AC-33.1 Given a file, When `Make a copy` is chosen, Then the dialog proposes `name (copy).ext` in the same folder and `dlg.copy.hint` names the folder.
- AC-33.2 Given an object up to 5 GB, Then `CopyObject` is used; above 5 GB, multipart `UploadPartCopy`.
- AC-33.3 Given a name collision, Then the proposal increments: `name (copy 2).ext`.

**States:** idle, running, success, error. **Edge cases:** metadata and content type are preserved; folders are not copyable in MVP (the menu item is hidden for folders).
**Screens:** `T12_Dialogs`

#### FR-34 Move (MVP; drag-to-move v1)
**Story:** As a user, I want to move items to another folder.
**Acceptance**
- AC-34.1 Given selected items, When `Move…` is chosen, Then a folder tree dialog (sheet at 375, 640 px dialog at 768+) shows the destination, with the current location shown and disabled.
- AC-34.2 Given a destination, When `Move here` is confirmed, Then each object is copied, verified and deleted; progress shows in the Transfer panel.
- AC-34.3 Given the destination is the folder itself or a child of the moved folder, Then the action is disabled with an explanation.
- AC-34.4 Given `New folder here`, Then a folder is created and chosen.
- AC-34.5 Given (v1) items are dragged onto a folder on desktop, Then the destination highlights, a count chip shows and the same move runs.

**States:** choosing, running, success with Undo, interrupted (FR-45), error.
**Edge cases:** name clashes at the destination use the conflict dialog (FR-43). A clash with a folder offers only `Keep both` (the moved folder becomes `name (1)/`) and `Merge` (objects with the same key are overwritten; objects that exist only in the destination are never deleted); a clash with a file keeps Replace, Keep both and Skip (D-42). Moving 10,000 objects must not block the UI.
**Screens:** `S22_Move`, `S28_Interrupted`

#### FR-35 New folder (MVP)
**Story:** As a user, I want to create a folder.
**Acceptance**
- AC-35.1 Given `New → New folder`, When a valid name is entered, Then a zero-byte placeholder object `prefix/name/` is written and the folder appears.
- AC-35.2 Given a name with `/` or one that exists, Then an inline error explains.
- AC-35.3 Given a read-only connection, Then New is disabled or hidden (FR-111).
- AC-35.4 Given an empty folder on a writable connection, Then its empty state offers `Upload files`, `Upload folder` and `New folder`; from 768 px its text says files can be dropped here, on a phone it does not (M11).

**Edge cases:** the placeholder decision is [C-18](open-questions.md#owner-confirmed-decisions); `files.emptyBucket.body` is overridden in the copy additions so it no longer says folders exist only from file paths. **Screens:** `S17_NewMenu`, `T12_Dialogs`

#### FR-36 Move to trash with Undo (MVP)
**Story:** As a user, I want delete to be safe.
**Acceptance**
- AC-36.1 Given selected items, When `Move to trash` is chosen, Then they move to `.coffer-trash/{UTC timestamp}-{6 random chars}/{original key}` (one batch prefix for the whole operation, under the connection root) with no confirmation and the toast "Moved N items to trash · Undo" shows for at least 8 s.
- AC-36.2 Given `confirmTrash` is on, Then a confirmation shows first.
- AC-36.3 Given `Undo`, When tapped, Then items return to their original keys.
- AC-36.4 Given a folder, Then all objects under it move and the journal tracks it.
- AC-36.5 Given an item already under the trash prefix, Then Move to trash is not offered.
- AC-36.6 Given the same key is trashed twice, Then both copies exist in separate batch prefixes; nothing is overwritten.
- AC-36.7 Given the trash toast, When `Undo` is tapped, Then the toast closes at once and "Restored N items" replaces it; a restore from Trash offers `Show location`, a move names its destination ("Moved 1 item to {folder}"), and New folder offers `Open`. A toast without an action leaves when the screen changes; from 768 px toasts sit at the bottom left of the content, clear of the rail or sidebar.

**States:** running, success with Undo, error (nothing lost). **Edge cases:** trash collisions are impossible because each operation has its own batch prefix ([ADR-004](adr/ADR-004-trash-as-prefix.md)). Mobile never deletes on a single tap without a sheet or Undo.
**Screens:** `S23_TrashUndo`

#### FR-37 Download file (MVP)
**Story:** As a user, I want to save a file to my device.
**Acceptance**
- AC-37.1 Given a file, When `Download` is chosen, Then the browser downloads it directly from the provider using a short-lived presigned URL with `attachment` disposition and the file's name.
- AC-37.2 Given a very large file, Then no data passes through app memory.
- AC-37.3 Given multiple files, Then they download one after another and the person is told the browser may ask to allow multiple downloads.

**States:** starting, started, error (`files.error`-style toast). **Edge cases:** file names with quotes, non-ASCII and `%` are encoded in `Content-Disposition` (RFC 5987). **Screens:** `S16_ContextMenu`, `S31_PreviewImage`

#### FR-38 Download folder as .zip (v1)
**Story:** As a user, I want a whole folder as one file.
**Acceptance**
- AC-38.1 Given a folder, When chosen, Then objects stream into a zip written by `fflate` and saved without building the whole archive in memory when the browser supports a streaming save.
- AC-38.2 Given total size above 500 MB, Then a warning appears before starting.
- AC-38.3 Given cancel or failure, Then the partial file is discarded and nothing in the bucket changes.

**Edge cases:** browsers without a streaming save fall back to a memory-bound path with a lower limit ([C-36](open-questions.md#owner-confirmed-decisions)). **Screens:** `S18_BreadcrumbMenu`, `S16_ContextMenu`

---

## 4. Upload and transfers

#### FR-40 Upload files and folders (MVP)
**Story:** As a user, I want to add files by menu or by dropping them.
**Acceptance**
- AC-40.1 Given `New → Upload files` or `Upload folder`, When items are chosen, Then they upload into the current folder; folder uploads keep their relative paths.
- AC-40.2 Given desktop drag-over, Then the overlay shows `drop.title` and `drop.sub`; on drop, uploads start.
- AC-40.3 Given a read-only connection, Then upload entry points are disabled or hidden.
- AC-40.4 Given a file name containing characters the bucket cannot store, Then it is reported before upload, not after failure.

**States:** queued, running, paused, failed, done. **Edge cases:** empty files (zero bytes); more than 1,000 files queued; duplicates within one batch; keys over 1,024 bytes.
**Screens:** `S17_NewMenu`, `S13_FilesDrop`, `S26_Uploading`

#### FR-41 Multipart upload and progress (MVP)
**Story:** As a user, I want large uploads to be fast and reliable.
**Acceptance**
- AC-41.1 Given a file over the multipart threshold, Then it uploads in parts in parallel (setting `uploadConcurrency`), with per-file progress as a percentage and bytes.
- AC-41.2 Given a part fails, Then it retries with backoff; after the retry budget the file shows `failed` with `Try again`.
- AC-41.3 Given `Cancel upload`, Then in-flight parts abort and the multipart upload is aborted at the provider.
- AC-41.4 Given a small file, Then it uploads with a single `PutObject`.
- AC-41.5 Given a multipart upload was running when the page closed or reloaded, When the app next loads (and the connection is unlocked), Then the stored `uploadId` is aborted with `AbortMultipartUpload`, the task shows as interrupted, and no incomplete multipart upload of ours remains at the provider. In MVP there is no resume.

**Edge cases:** parts are at least 5 MiB except the last; an object over 5 TiB is rejected up front. An upload still running in another tab is not aborted (it holds a Web Lock, D-36). If the abort cannot run (offline, locked, or no connection to that endpoint and bucket yet) the record is kept and retried on a later load or unlock ([D-36](open-questions.md#decisions-made-on-the-owners-behalf)), and the lifecycle-rule guidance in the technical spec applies. **Screens:** `S26_Uploading`, `T13_Transfers`

#### FR-42 Resume after reload (v1; replaces the MVP abort-on-reload behavior)
**Story:** As a user on a flaky connection, I want to continue an interrupted upload.
**Acceptance**
- AC-42.1 Given an upload was interrupted by a reload, When the app opens, Then the panel shows "Upload paused when the page reloaded" with `Choose file`.
- AC-42.2 Given the person chooses the same file (name, size, modified time match), Then only the missing parts upload.
- AC-42.3 Given a different file is chosen, Then the app refuses with an explanation and does not corrupt the object.
- AC-42.4 Given `Discard`, Then the multipart upload is aborted and its IndexedDB state removed.

**Edge cases:** parts reconciled with `ListParts`; the multipart upload may have been aborted by the provider (lifecycle rule), in which case it restarts. **Screens:** `T13_Transfers`

#### FR-43 Upload conflicts (MVP)
**Story:** As a user, I want to decide what happens when a name already exists.
**Acceptance**
- AC-43.1 Given an existing key, When a batch includes it, Then one dialog asks Replace, Keep both or Skip, with `Apply to all N conflicts`.
- AC-43.2 Given `Keep both`, Then the new file is saved as `name (1).ext` (next free number).
- AC-43.3 Given `Replace`, Then the old object is overwritten only after the new upload completes.

**Edge cases:** conflicts are detected with a listing of the target folder plus `HeadObject` for keys outside the loaded page. **Screens:** `S27_UploadConflict`

#### FR-44 Transfer panel (MVP)
**Story:** As a user, I want one place to see uploads and background moves.
**Acceptance**
- AC-44.1 Given running transfers, Then the panel shows "Uploading N items" or "Moving '{name}'" with progress (`role=progressbar` with text values) and collapses to its header.
- AC-44.2 Given a failure, Then the row shows the reason and `Try again`.
- AC-44.3 Given 375 px, Then the panel is full width above the bottom nav; at 768 and above, 360 px at bottom right.
- AC-44.5 Given a multipart upload was interrupted by a reload, When the panel shows it, Then the row reads "Upload interrupted" with "{name} was interrupted when the page closed. Start it again." (`upl.interrupted.*`); the "Choose file" resume state is not shown in MVP.
- AC-44.4 Given the app locks, Then running transfers keep going and finish, queued transfers show "waiting for unlock", and the panel is reachable again after unlock.

**Screens:** `S26_Uploading`, `T13_Transfers`

#### FR-45 Operation journal and interrupted recovery (MVP)
**Story:** As a user, I want a move that was cut off to be recoverable.
**Acceptance**
- AC-45.1 Given a multi-object operation, When it starts, Then a journal entry is written before the first request.
- AC-45.2 Given the page closes mid-move, When the app next loads, Then a banner says "A move was interrupted" with `{done} of {total}` and offers Resume, Review, Discard.
- AC-45.3 Given Resume, Then the operation continues without duplicating or losing objects.
- AC-45.4 Given Discard, Then the entry is closed and the person is told which objects are in which location.
- AC-45.5 Given any step, Then a source object is deleted only after its copy is verified.

**Edge cases:** the bucket changed while closed; the destination already has some objects; the credentials are locked on load (the banner waits for unlock).
**Screens:** `S28_Interrupted`

---

## 5. Preview

#### FR-50 Preview viewer (MVP)
**Story:** As a user, I want to open a file without downloading it.
**Acceptance**
- AC-50.1 Given a previewable file, When opened, Then a full-screen dark viewer shows name, Download, Share link, ⓘ and ⋮ with back/Esc to close.
- AC-50.2 Given siblings in the folder, Then previous and next work by swipe (mobile), arrows and ← → (desktop) and announce "2 of 10".
- AC-50.3 Given any preview, Then the dialog is labelled "Preview of {name}" and focus returns to the row on close.
- AC-50.4 Given the viewer is open, When ⓘ is pressed, Then the details of the file on screen (FR-27) open inside the viewer (a side panel from 1024 px, a bottom sheet below), and Previous and Next update them.
- AC-50.5 Given the viewer is open, When it is closed by its Back button, Escape or the browser's Back, Then the folder it was opened from shows with its selection, and focus is on the row of the file last shown.

**States:** loading, ready, error, no preview. **Screens:** `S31_PreviewImage`, `T11_Previews`, `T11b_Previews`

#### FR-51 Image preview (MVP)
**Acceptance:** AC-51.1 Given a raster image, Then it renders with fit, zoom in/out, pinch and double-tap zoom. AC-51.2 Given an unsupported format (for example HEIC in some browsers), Then FR-58 shows. **Story:** As a user, I want to see images fast. **States:** loading, ready, error. **Edge cases:** very large images; EXIF orientation. **Screens:** `S31_PreviewImage`

#### FR-52 Video and audio preview (MVP)
**Acceptance:** AC-52.1 Given a video or audio file, Then native controls play it from a presigned URL with range requests. AC-52.2 Given the provider does not support ranges, Then playback may buffer and the viewer still works or falls to FR-58. **Story:** As a user, I want to play media in place. **States:** loading, ready, error. **Edge cases:** codecs the browser cannot play fall to FR-58. **Screens:** `T11_Previews`

#### FR-53 PDF preview (MVP)
**Acceptance:** AC-53.1 Given a PDF, Then pages render with Previous/Next page and "Page N of M". AC-53.2 Given a PDF over a size limit (default 50 MiB), Then FR-58 offers Download. **Story:** As a user, I want to read a PDF in the browser. **States:** loading, ready, error. **Edge cases:** encrypted PDFs; scripts in PDFs never run. **Screens:** `T11_Previews`, `T11b_Previews`

#### FR-54 Code and text preview (MVP)
**Acceptance:** AC-54.1 Given a text or code file, Then the first 1 MiB renders as plain monospaced text with line numbers and the meta line `{type} · {lines} · {size}`. AC-54.2 Given a larger file, Then a notice says only the beginning is shown. AC-54.3 Given any content, Then it is set as text, never as HTML. **Story:** As a developer, I want to peek at a file. **States:** loading, ready, truncated, error. **Edge cases:** binary files mislabelled as text (control characters); invalid UTF-8. **Screens:** `T11_Previews`

#### FR-55 Markdown preview (MVP)
**Acceptance:** AC-55.1 Given a Markdown file, Then it renders sanitised: raw HTML is not rendered, remote images are not loaded, links open with `rel="noopener noreferrer"` and only `http`, `https` and `mailto` schemes. AC-55.2 Given the meta line, Then it reads "Markdown · sanitized". **Story:** As a user, I want readable notes. **Screens:** `T11b_Previews`

#### FR-56 HTML as source with sandbox (MVP)
**Acceptance:** AC-56.1 Given an HTML file, Then it opens as source with "Shown as code for your safety." AC-56.2 Given `Render in sandbox`, Then it renders in an iframe with `sandbox=""` (no scripts, no same-origin, no forms, no popups) from `srcdoc` ([D-39](open-questions.md#decisions-made-on-the-owners-behalf): a blob document is refused by WebKit under the app's `frame-ancestors`), with its own CSP meta that blocks remote resources. **Story:** As a developer, I want to see what a page looks like without risk. **Edge cases:** the sandboxed page inherits the app's CSP, so styles and remote resources may be blocked ([C-23](open-questions.md#owner-confirmed-decisions)). **Screens:** `S32_PreviewHtml`

#### FR-57 SVG preview (MVP)
**Acceptance:** AC-57.1 Given an SVG, Then it is shown only through an `<img>` element (as a `blob:` URL with an explicit `image/svg+xml` type) and the meta line reads "SVG · shown as an image, scripts never run". AC-57.2 Given an SVG over 2 MiB, Then FR-58 applies. **Story:** As a user, I want to see vector files safely. **Edge cases:** SVG with external references (not loaded in `<img>`). **Screens:** `T11b_Previews`

#### FR-58 No-preview fallback (MVP)
**Acceptance:** AC-58.1 Given a type that cannot be shown, Then the viewer says "{type} files can't be shown in the browser. You can still download the file." with a Download button. **Story:** As a user, I want a clear path when a file can't be previewed. **Screens:** `T11b_Previews`

---

## 6. Share links

#### FR-60 Create share link (MVP)
**Story:** As a user, I want to send a time-limited link to a file.
**Acceptance**
- AC-60.1 Given one file, When `Share link` is chosen, Then the dialog shows `share.body` ("Anyone with the link can open this file until it expires. Links can't be revoked early.") and expiry choices 15 min, 30 min, 1 hour, 1 day, 7 days, with **1 day** preselected for normal keys.
- AC-60.2 Given the person chooses an expiry, When they tap `Create link for {duration}`, Then a presigned `GetObject` URL is created locally with exactly that lifetime and `confirmedNotRevocable` is set by the UI.
- AC-60.3 Given the link is created, Then the dialog shows the link, `Copy link`, the expiry time (`share.expiresAt`) and `share.invalidate` (rotate the access key to cancel all links).
- AC-60.4 Given multiple items or a folder, Then `Share link` is disabled.
- AC-60.5 Given the link works, Then no request is made to Coffer's host and the URL is never logged or placed in the page URL.

**States:** choose expiry, created, error. **Edge cases:** the default is 1 day for normal keys and the longest allowed choice for session tokens ([C-11](open-questions.md#owner-confirmed-decisions)); copying uses the clipboard API with a fallback; URLs are long (over 1,000 characters).
**Screens:** `S20_Share`, `S35_ShareDone`

#### FR-61 Session-token link cap (MVP)
**Story:** As a user with a temporary token, I want to know my link will stop working early.
**Acceptance**
- AC-61.1 Given a session token, When Share opens, Then `SessionTokenNotice` shows `share.session.title` and the time left.
- AC-61.2 Given choices longer than `ShareLimits.maxSeconds`, Then they are disabled with `aria-disabled` and not hidden; the default is the longest allowed.
- AC-61.3 Given the token expires in under 15 minutes, Then no expiry is available and Share explains why.

**Screens:** `S43_ShareSessionToken`

---

## 7. Trash

#### FR-70 Trash view and restore (MVP)
**Story:** As a user, I want to see deleted items and restore them.
**Acceptance**
- AC-70.1 Given Trash, Then it lists every item under the trash prefix that is in Coffer's batch format (`{UTC timestamp}-{6 chars}/...`; anything else there is ignored) flattened across batches, each with its original path and the deletion time read from its batch prefix, newest first, with the note `trash.note`. An object under a folder trashed in the same batch is part of that folder's row, and Restore and Delete forever on the row include it (M11); a folder trashed without its own placeholder object cannot be told from its contents, so its objects stay separate rows.
- AC-70.2 Given selected items, When `Restore` is chosen, Then the batch prefix is stripped and they move back to their original keys.
- AC-70.3 Given an original key now exists, Then the conflict dialog (FR-43 semantics) asks.
- AC-70.4 Given an empty trash, Then an empty state shows.

**States:** empty, loading, list, error. **Screens:** `S24_TrashView`, `S39_TrashSelect`

#### FR-71 Delete forever and Empty trash (MVP)
**Story:** As a user, I want permanent deletion to be deliberate.
**Acceptance**
- AC-71.1 Given `Delete forever`, Then a confirmation names the item and bucket and says it can't be undone.
- AC-71.2 Given more than 50 items, or `Empty trash`, Then the filled danger button stays disabled until the person types the count.
- AC-71.3 Given confirmation, Then objects are deleted in batches of up to 1,000 and progress shows; failures are listed and the rest continue.
- AC-71.4 Given `Shift+Del` (v1), Then the same confirmation shows.

**Screens:** `S25_DeleteForever`, `S39_TrashSelect`

---

## 8. Starred and Recent

#### FR-80 Starred (v1, built in M11)
**Story:** As a user, I want to pin items I use often.
**Acceptance**
- AC-80.1 Given `Add to starred`, Then the item is saved locally (connection, bucket, key) and labelled "Saved in this browser".
- AC-80.2 Given a starred item is renamed, moved or trashed through Coffer, Then the star follows or is removed.
- AC-80.3 Given the Starred view is empty, Then `star.empty.*` shows.
- AC-80.4 Given a starred key no longer exists, Then it shows as missing with a remove action instead of failing.

**Screens:** `S29_Starred`, `T14_Storage_Starred`

#### FR-81 Recent (v1, built in M11)
**Story:** As a user, I want to reopen what I opened lately.
**Acceptance:** AC-81.1 Given a file is opened in Preview, Then it is added to Recent locally (names only). AC-81.2 Given Home, Then Recent shows with `home.recent.note`. AC-81.3 Given `Forget this device`, Then Recent is cleared. **Edge cases:** capped at 50 items; items for other connections are hidden. **Screens:** `S14_Home`

---

## 9. Storage usage

#### FR-90 Calculate usage (v1, built in M11)
**Story:** As a user, I want to know where my space goes.
**Acceptance**
- AC-90.1 Given Storage, Then nothing is calculated until the person taps `Calculate usage`, with the cost note `stor.idle.body` and an estimated request count (about one request per 1,000 objects; for a repeat run, based on the last object count).
- AC-90.2 Given running, Then the object count and the number of requests made update, the scan can be cancelled, and after 100,000 objects a "Still counting" hint shows.
- AC-90.3 Given finished, Then total size, object count, time calculated and the largest folders show; `Calculate again` is offered.

**States:** idle, calculating, result, error, cancelled. **Edge cases:** very large buckets (millions of keys) are cancellable and the result is labelled partial. **Screens:** `S30_Storage`, `T14_Storage_Starred`

---

## 10. Settings and security

#### FR-100 Settings pages (MVP)
**Story:** As a user, I want to set theme, density and behavior.
**Acceptance**
- AC-100.1 Given Settings, Then Appearance (Theme System/Light/Dark, Density), Behavior (confirm trash, hidden files, parallel upload parts), Connections, Security and About are available; mobile shows a list that opens detail pages and 768 and above a section nav plus detail.
- AC-100.2 Given Theme is `System`, Then the app follows `prefers-color-scheme` and updates live; Light and Dark override it and persist across reloads.
- AC-100.3 Given About, Then it shows the version (from `package.json` at build time), the origin, a link to the source repository (`repository` in `package.json`), the MIT license text behind `View license` and the IBM Plex (OFL) credit.

**Screens:** `S50_SettingsList`, `T50_SettingsPages`, `T50b_SettingsPages`

#### FR-101 Security settings (MVP; change passphrase v1)
**Story:** As a user, I want to see and control what's stored.
**Acceptance**
- AC-101.1 Given Security, Then auto-lock choices (5, 15, 30, 60 minutes and Never with a warning), Lock now, `What's stored on this device` and `Forget this device` show.
- AC-101.2 Given `What's stored`, Then it lists saved connections, the journal (counting only interrupted operations: interrupted, paused, or running with no live lock; finished entries kept for the Undo window are not counted), starred and recent with counts, and states that Coffer sends nothing except to the provider. `Forget this device` is the only action that removes all of it; removing one connection deletes only that connection's rows (AC-102.5).
- AC-101.3 Given `Change passphrase` (v1), Then the old passphrase is required, the new one must be at least 12 characters, and every saved connection is re-encrypted before the old key is dropped.

**Screens:** `S50_SettingsList`, `S51_SettingsSecurity`

#### FR-102 Reveal secret key (MVP)
**Story:** As a user, I want to see a saved secret only when I prove I'm there.
**Acceptance**
- AC-102.1 Given a saved connection, When `Show secret key` is chosen, Then the passphrase is required.
- AC-102.2 Given the correct passphrase, Then the secret shows for 15 seconds and hides again (`reveal.note`).
- AC-102.3 Given a copy, Then the notice "Copied. Clear your clipboard when you're done." shows.
- AC-102.4 Given any state, Then secrets never appear in URLs, toasts, titles, logs or error text.
- AC-102.5 Given `Remove` on a saved connection that has no unfinished move, Then the confirmation lists exactly what will be removed (its saved keys, and the counts of its running or waiting transfers, unfinished uploads, Starred and Recent entries) and says that the bucket, its files, other connections and the passphrase are not touched. On confirm, its transfers stop, its incomplete multipart uploads are aborted at the provider (best effort; the toast says how many succeeded and how many failed), and its journal, upload, Starred and Recent rows and its saved profile are deleted. If it was the active connection, the app goes to Unlock or Welcome.
- AC-102.6 Given the connection has an interrupted or running move, When `Remove` is chosen, Then removal is blocked by a dialog that offers `Resume` or `Discard` for each interrupted entry (a running one says to try again when it finishes); after the last one is discarded the confirmation follows.
- AC-102.7 Given a removal, Then no row of that connection (journal, uploads, Starred, Recent, profile) remains in storage, and no row of another connection changes.

**Edge cases:** memory-only connections cannot be revealed after submission ([C-26](open-questions.md#owner-confirmed-decisions)). **Screens:** `T50_SettingsPages`, `S51_SettingsSecurity`

---

## 11. Read-only connections

#### FR-110 Detection and offer (MVP)
**Story:** As a user with a read-only key, I want to use Coffer without failures.
**Acceptance**
- AC-110.1 Given list and read pass and the write step fails with AccessDenied, Then the test ends with outcome `readOnly` and `ReadOnlyOffer` shows `Connect read-only` and `Edit keys`.
- AC-110.2 Given `Connect read-only`, Then the profile is saved with `access: "readOnly"`.

**Edge cases:** an empty bucket cannot prove read ([C-21](open-questions.md#owner-confirmed-decisions)). **Screens:** `O44_ReadOnlyOffer`

#### FR-111 Read-only experience (MVP)
**Story:** As a read-only user, I want to know why actions are off.
**Acceptance**
- AC-111.1 Given a read-only connection, Then the app bar shows the Read-only chip with the title "This key is read-only" and a banner shows the reason and `Use another key`.
- AC-111.2 Given the same, Then New and the FAB are hidden or disabled, and Rename, Make a copy, Move and Move to trash are disabled in menus with the reason line.
- AC-111.3 Given the same, Then selection bars drop Move and Trash; Star, Download, Preview, Copy link and Details keep working.

**Screens:** `S41_ReadOnlyFiles`, `S42_ReadOnlyMenu`

---

## 12. Demo mode

#### FR-120 Demo workspace (v1; the Welcome entry point is hidden in MVP)
**Story:** As a curious visitor, I want to try Coffer without keys.
**Acceptance**
- AC-120.1 Given `Explore with sample files`, Then a read-only workspace with sample files opens and the banner "Demo · sample files, read-only. Connect your bucket" shows.
- AC-120.2 Given the demo, Then no network request is made to any storage endpoint and no data is stored on the device.
- AC-120.3 Given write actions, Then they are disabled with the read-only reason.
- AC-120.4 Given `Connect your bucket`, Then onboarding starts.

**States:** demo active. **Edge cases:** previews work on bundled samples (including the safe SVG preview). **Screens:** `O11_Demo`

---

## 13. Cross-cutting requirements

#### FR-130 Runtime errors and recovery (MVP)
**Story:** As a user, I want errors to tell me what happened and what to do.
**Acceptance**
- AC-130.1 Given a listing timeout or failure, Then `files.error.*` shows with `Try again` and states that files are not affected.
- AC-130.2 Given an operation error, Then the message says what, why and what next, and never includes keys, signatures or full presigned URLs.
- AC-130.3 Given `ExpiredToken` or `InvalidAccessKeyId` at runtime, Then the app returns to the credentials step for that connection.
- AC-130.4 Given the browser goes offline, Then a banner says so and operations pause.

**States:** error, offline, recovered. **Screens:** `T10_FileStates`, `T10b_FileStates`

---

## Non-functional requirements

| ID | Requirement | Verified by |
|---|---|---|
| NFR-1 | Secrets (access key ID, secret, session token, passphrase, derived key) never appear in logs, URLs, errors, toasts, `localStorage`, unencrypted IndexedDB or network requests other than SigV4-signed requests to the provider endpoint. | Unit tests, storage-dump e2e, security audit |
| NFR-2 | The site is served with the CSP and headers in the technical spec; no third-party scripts, fonts, analytics. | Header test in CI, browser console check |
| NFR-3 | All bucket data (names, contents, metadata) is untrusted: text only, HTML as source, SVG as `<img>`, sanitised Markdown. | Unit and e2e XSS fixtures |
| NFR-4 | Performance: initial JS and TTI budgets, and list virtualization, as in the technical spec. | Lighthouse CI, bundle-size check |
| NFR-5 | WCAG 2.2 AA, including 44 px targets on mobile, visible focus and reduced motion. | axe in CI, manual keyboard and screen reader pass |
| NFR-6 | No horizontal scroll at 360 px; layout verified at 375, 768 and 1440. | Playwright viewport matrix |
| NFR-7 | Supported browsers: current and previous major of Chrome, Edge and Firefox; **iOS Safari 16.4 or later is mandatory** (and desktop Safari 16.4 or later). | CI browser matrix (WebKit on every PR), manual iOS device pass per release |
| NFR-8 | No telemetry. Nothing is sent anywhere except to the provider endpoint. Keys and file names are not part of the URL sent to the host (hash routing). | Network assertion in e2e |
| NFR-9 | Data safety: no source object is deleted before its copy is verified; interrupted operations are recoverable. | Integration tests with fault injection |
| NFR-10 | Provider compatibility: every preset has a documented result in the compatibility matrix. | Manual matrix runs |
| NFR-11 | Every UI string comes from `copy.en.json` keys (ICU plurals) or the copy additions file; no hard-coded strings. | Lint rule; CI fails when a key used in code does not exist |
| NFR-12 | Every color, size, radius, shadow and duration comes from design tokens. | Lint rule, review |

## Release plan

### MVP

Connect (all 21 presets plus custom), browse, upload, download, preview (image, video, audio, PDF, text and code, SVG, Markdown, HTML as source with sandbox), rename, move, copy and delete with Trash, share link, save on device, and read-only connections.

| Area | FRs |
|---|---|
| Onboarding and connection | FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12 |
| Browse | FR-20, FR-21, FR-22, FR-23, FR-24, FR-27 |
| Selection and actions | FR-30, FR-31, FR-32, FR-33, FR-34 (dialog), FR-35, FR-36, FR-37 |
| Upload and transfers | FR-40, FR-41, FR-43, FR-44, FR-45 |
| Preview | FR-50, FR-51, FR-52, FR-53, FR-54, FR-55, FR-56, FR-57, FR-58 |
| Share | FR-60, FR-61 |
| Trash | FR-70, FR-71 |
| Settings and security | FR-100, FR-101 (without change passphrase), FR-102 |
| Read-only | FR-110, FR-111 |
| Cross-cutting | FR-130, NFR-1 to NFR-12 |

### v1

FR-13 coach tips, FR-23 (Search all of {bucket}), FR-25 command palette, FR-26 keyboard shortcuts, FR-34 drag-to-move, FR-38 folder zip, FR-42 resume after reload, FR-80 Starred, FR-81 Recent, FR-90 Storage usage, FR-101 change passphrase, FR-120 demo workspace.

### Out of scope

No backend, database, accounts, server-side or content search, sync client, bucket administration (create bucket, policies, lifecycle, ACL editing), object versioning UI, object tagging, public-bucket hosting tools, localization beyond English (strings are keyed for later), native apps, and telemetry.
