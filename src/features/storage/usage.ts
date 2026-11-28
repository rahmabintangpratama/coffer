/** Storage usage (FR-90): totals by top-level folder, built page by page from a listing with no delimiter. */

export interface FolderUsage {
  /** The folder name under the root, or "" for objects directly at the root. */
  name: string;
  bytes: number;
  objects: number;
}

export interface Usage {
  objects: number;
  bytes: number;
  /** Listing requests made so far (one per page of up to 1,000 objects). */
  requests: number;
  folders: Map<string, FolderUsage>;
}

/** AC-90.2: after this many objects the "Still counting" hint shows. */
export const STILL_COUNTING_AT = 100_000;

export const emptyUsage = (): Usage => ({ objects: 0, bytes: 0, requests: 0, folders: new Map() });

/** Add one listing page. Keys outside `root` are ignored; a key's first segment under `root` is its folder. */
export function addPage(usage: Usage, page: readonly { key: string; size: number }[], root: string): Usage {
  const folders = new Map(usage.folders);
  let { objects, bytes } = usage;
  for (const object of page) {
    if (!object.key.startsWith(root)) continue;
    const rest = object.key.slice(root.length);
    const cut = rest.indexOf("/");
    const name = cut === -1 ? "" : rest.slice(0, cut);
    const current = folders.get(name) ?? { name, bytes: 0, objects: 0 };
    folders.set(name, { name, bytes: current.bytes + object.size, objects: current.objects + 1 });
    objects += 1;
    bytes += object.size;
  }
  return { objects, bytes, requests: usage.requests + 1, folders };
}

/** AC-90.3: the largest folders first (ties by name), at most `limit`. */
export function largestFolders(usage: Usage, limit = 10): FolderUsage[] {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  return [...usage.folders.values()].sort((a, b) => b.bytes - a.bytes || collator.compare(a.name, b.name)).slice(0, limit);
}

/** AC-90.1: about one request per 1,000 objects, at least one. */
export const estimateRequests = (objects: number): number => Math.max(1, Math.ceil(objects / 1000));
