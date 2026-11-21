# ux-patterns.md

Coffer borrows Drive's interaction model, not its visual identity: no Google colors, type, icons or logo.

## Drive → Coffer mapping

| Drive concept | Coffer | Note |
|---|---|---|
| Home / Suggested | Home | Recent files from local history plus bucket shortcuts. Nothing is read from the bucket for Recent. |
| My Drive | Files | One bucket at a time; folders are prefixes. |
| Starred | Starred | Local, labelled “Saved in this browser”. |
| Trash | Trash | The `.trash/` prefix in the same bucket. Restore, Delete forever, Empty trash. |
| Storage | Storage | Computed on demand with “Calculate usage”. |
| Account avatar | Connection switcher | Avatar on mobile and rail, block in the sidebar. |
| + New | New | Menu: New folder, Upload files, Upload folder. FAB on mobile. |
| Search bar | Pill search | “Search in {bucket}”. Filters: Type, Modified. Names only. |
| Breadcrumb with menu | Breadcrumb with ▾ | Menu: New folder, Upload, Rename, Move, Download, Move to trash. |
| Share → link | Share link | Presigned URL. See SECURITY-DESIGN.md for the confirmation rules. |
| Details panel | Details panel | Adds full key, ETag and content type. |
| Upload progress card | Transfer panel | Also used for background moves. |

## Selection model

- Desktop: click selects one; double-click opens; Shift extends a range; Ctrl/⌘ toggles; drag on empty space draws a selection box; ⌘/Ctrl+A selects all loaded items.
- Mobile: tap opens; long press selects and enters selection mode (leading check circles replace icons); tapping more items toggles them; ✕ exits.
- Selection toolbar: ✕ · “3 selected” · Share link · Download · Move · Move to trash · ⋮. Share link is disabled for multiple items and for folders.
- On mobile the top bar becomes the selection bar and the bottom nav is replaced by Share link, Download, Move, Move to trash.
- Selection clears on navigation, on Esc, and after an action completes.

## Gestures and pointer

| Gesture | Result |
|---|---|
| Right-click / ⋮ / long press (mobile opens action sheet) | Context menu |
| Drag selected items onto a folder (desktop) | Move; shows the destination highlighted and a count chip |
| Drag files from the desktop onto the list | Upload overlay “Drop files to upload them to ‘exports’” |
| Swipe left/right in preview (mobile) | Previous / next file |
| Pinch / double-tap in image preview | Zoom |
| Pull down on a list (mobile) | Refresh the listing |

## Keyboard

| Key | Action |
|---|---|
| `/` | Focus search |
| Enter | Open |
| Space | Preview |
| F2 or N | Rename |
| M | Move… |
| S | Star or unstar |
| I | Details |
| Del | Move to trash |
| Shift+Del | Delete forever (confirmation) |
| ⌘/Ctrl+A | Select all |
| ⌘/Ctrl+K | Command palette (desktop) |
| `?` | Shortcuts sheet |
| Esc | Close the top layer, then clear selection |

Single-key shortcuts only work when the file list or a row has focus.

## Undo and confirmation rules

1. Move to trash never asks first. It shows “Moved N items to trash · Undo” for 8 seconds. (Setting `confirmTrash` can add a confirmation.)
2. Rename, move and copy are copy + delete under the hood. They show progress in the transfer panel when they take more than 1 second. Undo is offered for moves and renames while the journal entry exists.
3. Delete forever always asks. More than 50 items, and Empty trash, require typing the count.
4. Uploads that clash with existing keys ask once per batch: Replace, Keep both, Skip, with “Apply to all”.
5. Interrupted operations are found in the journal on next load and show a banner with Resume, Review, Discard.
6. Nothing destructive happens on a single tap on mobile without a sheet or an Undo toast.

## Read-only keys

The connection test writes and deletes a small file. If that write fails with AccessDenied while listing and reading succeed, the person is offered `Connect read-only`. The profile is saved with `access: "readOnly"`. Write actions are never silently missing: they are disabled with the reason “This key is read-only”, or hidden where there is no room (FAB, selection actions). Local features (Star, Recent) keep working.

## Links made with a session token

A presigned URL stops working when the credentials that signed it expire. When the connection has a session token, the Share dialog warns about that and offers only expiries up to the time left on the token (`ShareLimits.maxSeconds`).

## Drag-to-upload and background work

Uploads and moves share one panel: “Uploading 3 items” / “Moving ‘raw-footage’”. It collapses to its header. Paused uploads after a reload show “Choose file”, because browsers can't reopen files by themselves.
