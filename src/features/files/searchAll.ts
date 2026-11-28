/**
 * "Search all of {bucket}" (AC-23.6): a scan of the keys under the connection root with no
 * delimiter, names only, capped. These helpers are pure so the rules are tested without S3.
 */

/** AC-23.6: the scan stops after this many keys and says the results may be incomplete. */
export const SCAN_CAP = 100_000;
/** Matches are shown this many at a time. */
export const MATCH_PAGE = 50;

/** Whether a key takes part: under the root, and, unless hidden files are shown, with no segment starting with "." (that covers `.coffer-trash/`). */
export function searchable(key: string, root: string, showHidden: boolean): boolean {
  if (!key.startsWith(root) || key === root) return false;
  if (showHidden) return true;
  return !key.slice(root.length).split("/").some((segment) => segment.startsWith("."));
}

/** The keys whose own name (last segment; a folder placeholder keeps its "/") contains the query, case-insensitive. */
export function matchKeys(keys: readonly string[], query: string): string[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [];
  return keys.filter((key) => {
    const trimmed = key.endsWith("/") ? key.slice(0, -1) : key;
    return trimmed.slice(trimmed.lastIndexOf("/") + 1).toLowerCase().includes(needle);
  });
}
