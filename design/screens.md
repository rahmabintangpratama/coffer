# screens.md

Each board in the canvas shows one screen at 375, 768 and 1440 (left to right), with a light/dark Theme tweak. Boards named `T..` are state sheets with one row per state, each drawn at 375, 768 and 1440 (long sheets continue in a `Tnnb_` board).

## Layout per width (all screens)

| | 375 | 768 | 1440 |
|---|---|---|---|
| Navigation | Top app bar (menu, search pill, connection avatar), bottom nav Home · Starred · Files · More, FAB | Navigation rail with New at the top, app bar with search | Collapsible 256 px sidebar with + New, app bar with search |
| Content | One column, 56 px rows | Columns Name · Last modified · File size · ⋮, 48 px rows | Same, optional 360 px details panel |
| Overlays | Bottom sheets with drag handle, action sheet | Centered dialogs and popovers, 360 px right panel overlay | Dialogs, popovers, in-layout details panel |
| Onboarding | Full-screen steps, sticky bottom button | 560 px card on a gray ground | 560 px card (720 for provider and CORS), welcome gets a sample list at the right |

## Boards

### onboarding

- `O10_Welcome.dc.html` — 1 · Welcome
- `O11_Demo.dc.html` — 1 · Demo workspace (read-only)
- `O20_Provider.dc.html` — 2 · Choose provider
- `O21_ProviderStates.dc.html` — 2 · Provider search states
- `O30_CredR2.dc.html` — 3 · Credentials · Cloudflare R2
- `O31_CredTencent.dc.html` — 3 · Credentials · Tencent COS
- `O32_CredSupabase.dc.html` — 3 · Credentials · Supabase, session token
- `O33_CredCustom.dc.html` — 3 · Credentials · other S3-compatible
- `O34_Paste.dc.html` — 3 · Paste credentials
- `O35_CredWarnings.dc.html` — 3 · Credential warnings and secret handling
- `O40_Connecting.dc.html` — 4 · Connecting · running
- `O41_ConnectedOk.dc.html` — 4 · Connecting · all checks passed
- `O42_CorsFail.dc.html` — 4 · CORS failed
- `O43_FailStates.dc.html` — 4 · Other failures
- `O44_ReadOnlyOffer.dc.html` — 4 · Write test denied: offer to connect read-only
- `O50_PickBucket.dc.html` — 5 · Pick a bucket
- `O51_SaveDevice.dc.html` — 5 · Save on this device?
- `O52_Coach.dc.html` — 5 · Coach tip 1 of 3
- `O53_CoachTips.dc.html` — 5 · Coach tips 2 and 3
- `O60_Unlock.dc.html` — 6 · Unlock
- `O61_UnlockWrong.dc.html` — 6 · Unlock · wrong passphrase
- `O62_Locked.dc.html` — 6 · Locked after auto-lock
- `O63_Forget.dc.html` — 6 · Forget this device · confirmation

### browse

- `S10_FilesList.dc.html` — Files · list
- `S11_FilesGrid.dc.html` — Files · grid
- `S12_FilesSearch.dc.html` — Files · search with filters
- `S13_FilesDrop.dc.html` — Files · drag to upload
- `S14_Home.dc.html` — Home
- `S15_Selection.dc.html` — Selection · toolbar and bottom actions
- `S16_ContextMenu.dc.html` — Context menu · right-click, ⋮, bottom sheet
- `S17_NewMenu.dc.html` — + New menu
- `S18_BreadcrumbMenu.dc.html` — Breadcrumb ▾ menu
- `S19_Details.dc.html` — Details panel
- `S20_Share.dc.html` — Share link dialog
- `S21_Rename.dc.html` — Rename dialog
- `S22_Move.dc.html` — Move dialog with folder tree
- `S23_TrashUndo.dc.html` — Move to trash · undo toast
- `S24_TrashView.dc.html` — Trash
- `S25_DeleteForever.dc.html` — Delete forever confirmation
- `S26_Uploading.dc.html` — Upload panel · running
- `S27_UploadConflict.dc.html` — Upload conflict
- `S28_Interrupted.dc.html` — Interrupted operation banner + background move
- `S29_Starred.dc.html` — Starred
- `S30_Storage.dc.html` — Storage · result
- `S31_PreviewImage.dc.html` — Preview · image
- `S32_PreviewHtml.dc.html` — Preview · HTML as source with sandbox option
- `S33_Palette.dc.html` — Command palette
- `S34_Shortcuts.dc.html` — Shortcuts sheet
- `S35_ShareDone.dc.html` — Share link · link created
- `S37_ConnSwitch.dc.html` — Connection switcher
- `S38_MoreSheet.dc.html` — More (mobile) · Trash, Storage, Settings
- `S39_TrashSelect.dc.html` — Trash · restore and delete forever
- `S40_NavDrawer.dc.html` — Mobile navigation drawer (hamburger). Tablet and desktop use the rail and sidebar instead
- `S41_ReadOnlyFiles.dc.html` — Read-only connection · write actions disabled with the reason
- `S42_ReadOnlyMenu.dc.html` — Read-only connection · row menu and selection
- `S43_ShareSessionToken.dc.html` — Share link · session token, expiry capped to the token
- `T10_FileStates.dc.html` — Files states
- `T10b_FileStates.dc.html` — Files states (continued)
- `T11_Previews.dc.html` — Preview types
- `T11b_Previews.dc.html` — Preview types (continued)
- `T12_Dialogs.dc.html` — Dialog states
- `T13_Transfers.dc.html` — Transfer states
- `T14_Storage_Starred.dc.html` — Storage and Starred states

### system

- `S50_SettingsList.dc.html` — Settings · list (mobile) / security (tablet, desktop)
- `S51_SettingsSecurity.dc.html` — Settings · security detail
- `T50_SettingsPages.dc.html` — Settings detail pages
- `T50b_SettingsPages.dc.html` — Settings detail pages (continued)

## Screen notes

- **Welcome**: headline “Manage your bucket files the way you already manage files”, three facts, `Connect a bucket` and `Explore with sample files`. The demo is a read-only workspace with a quiet banner “Demo · sample files, read-only. Connect your bucket”.
- **Provider**: search, Popular (R2, B2, Wasabi, S3, DO Spaces, MinIO) in large rows, All providers alphabetical, `Other S3-compatible service` last. OCI shows “Browser access not supported (CORS)”; Alibaba shows “Virtual-hosted only”.
- **Credentials**: minimal fields from `providers.json`; connection name is generated and not shown. Paste credentials parses AWS env lines, an rclone `[remote]` block or a bare endpoint using `pasteHints`. Detected fields get a “detected” marker. Advanced is collapsed.
- **Connecting**: runs automatically. A CORS failure shows the exact origin, JSON and XML tabs, Copy, provider steps and `I’ve added it · Check again`. Other failures say what, why and what next.
- **Pick bucket**: skipped when a bucket was given or only one exists. Shows “This key can access 14 buckets. A key limited to one bucket is safer.” Manual entry when the key can’t list buckets.
- **Save on this device?**: after success. Passphrase with strength hint and “We can’t recover this passphrase.” `Not now` keeps the keys in memory only.
- **Coach tips**: three, dismissible, anchored to the context menu, drag-to-upload and search. Stored in `Settings.coachTipsSeen`.
- **Mobile menu button**: opens a left drawer (up to 320 px, scrim) with the same destinations as the sidebar. Drawn in `S40_NavDrawer`; from 768 the rail or sidebar replaces it.
- **Read-only connection**: if the write test fails with AccessDenied while list and read pass, `O44_ReadOnlyOffer` offers `Connect read-only`. The app bar shows a Read-only chip, a banner gives the reason, New and the FAB are disabled or hidden, and Rename, Make a copy, Move and Move to trash are disabled in menus with the line “This key is read-only”. Selection bars drop Move and Trash. Star, Download, Preview, Copy link and Details keep working. See `S41`, `S42`.
- **Share with a session token**: a warning says the link stops working when the token expires; choices longer than the time left are disabled and the default is the longest allowed one (`S43`).
- **Files**: folders first; sort by Name, Last modified, File size; partial listing banner “Showing 2,000 items · Load all to sort by size”.
- **Trash**: the `.trash/` prefix. Restore, Delete forever, Empty trash (typed count).
- **Storage**: not calculated until the person asks. Idle → calculating → result by largest folders.
- **Settings**: mobile is a list that opens detail pages; from 768 it is a section nav plus detail.
