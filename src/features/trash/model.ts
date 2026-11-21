import { parseTrashKey } from "@/lib/s3/trash";

/** One object in the trash, flattened across batches (AC-70.1). */
export interface TrashItem {
  /** The key in the trash: what Restore and Delete forever act on. */
  key: string;
  batch: string;
  deletedAt: Date | null;
  /** The key it had, with the connection root; empty for an object Coffer did not put there (it cannot be restored). */
  original: string;
  /** The original key without the connection root, shown as the original path. */
  path: string;
  name: string;
  size: number;
  /** A folder placeholder: shown as a folder, restores the folder only. */
  folder: boolean;
}

const nameOfPath = (path: string): string => {
  const trimmed = path.endsWith("/") ? path.slice(0, -1) : path;
  return trimmed.slice(trimmed.lastIndexOf("/") + 1) || trimmed;
};

/** Read the objects under `{root}.trash/` into items, newest deletion first, then by path (AC-70.1). */
export function toTrashItems(root: string, objects: readonly { key: string; size: number }[]): TrashItem[] {
  const items: TrashItem[] = [];
  for (const object of objects) {
    const parsed = parseTrashKey(root, object.key);
    if (!parsed) continue;
    const path = parsed.original.slice(root.length);
    // A batch folder with nothing else in it, or a key straight under .trash/, still shows by its trash key.
    const shown = path === "" ? object.key.slice(`${root}.trash/`.length) : path;
    items.push({ key: object.key, batch: parsed.batch, deletedAt: parsed.deletedAt, original: parsed.original, path: shown, name: nameOfPath(shown), size: object.size, folder: object.key.endsWith("/") });
  }
  return items.sort((a, b) => (b.deletedAt?.getTime() ?? 0) - (a.deletedAt?.getTime() ?? 0) || a.path.localeCompare(b.path));
}

/** Objects per batch, to tell when a selection is a whole batch. */
export function batchTotals(items: readonly TrashItem[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const item of items) totals.set(item.batch, (totals.get(item.batch) ?? 0) + 1);
  return totals;
}

export const canRestore = (item: TrashItem): boolean => item.original !== "";
