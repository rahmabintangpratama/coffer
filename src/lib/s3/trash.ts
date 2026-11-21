import { trashPrefixOf } from "./keys";

/** `YYYYMMDDTHHMMSSZ-xxxxxx`: UTC time, then six random base-36 characters (C-19, ADR-004). */
const BATCH = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z-[0-9a-z]{6}$/;
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** A batch id for one trash operation. `random` is injectable for tests; it must return six values below 36. */
export function newBatchId(now: Date = new Date(), random: () => number[] = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) => byte % 36)): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `${stamp}-${random().map((value) => ALPHABET[value] ?? "0").join("")}`;
}

/** The time in a batch id, or null when the name is not one of ours. */
export function batchTime(batch: string): Date | null {
  const match = BATCH.exec(batch);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const time = new Date(`${year ?? ""}-${month ?? ""}-${day ?? ""}T${hour ?? ""}:${minute ?? ""}:${second ?? ""}Z`);
  return Number.isNaN(time.getTime()) ? null : time;
}

/** The batch prefix of one trash operation: `{root}.coffer-trash/{batch}/`. */
export const batchPrefixOf = (root: string, batch: string): string => `${trashPrefixOf(root)}${batch}/`;

/** Where an item goes in the trash: the batch prefix plus its key relative to the connection root. Folders keep their trailing slash. */
export function trashKeyOf(root: string, batch: string, key: string): string {
  return `${batchPrefixOf(root, batch)}${key.slice(root.length)}`;
}

export interface TrashedKey {
  /** The key in the trash. */
  key: string;
  batch: string;
  /** When it was trashed, read from the batch id. */
  deletedAt: Date;
  /** The key it had, with the connection root: where Restore puts it. */
  original: string;
}

/**
 * Read a key under the trash prefix: its batch, the deletion time and the original key. Null for a key outside the
 * trash and for anything under the prefix that is not in our batch format `{root}.coffer-trash/{batch}/...` (C-19):
 * Coffer never lists, restores or deletes what it did not put there.
 */
export function parseTrashKey(root: string, key: string): TrashedKey | null {
  const prefix = trashPrefixOf(root);
  if (!key.startsWith(prefix)) return null;
  const rest = key.slice(prefix.length);
  const slash = rest.indexOf("/");
  if (slash < 0) return null;
  const batch = rest.slice(0, slash);
  const deletedAt = batchTime(batch);
  if (deletedAt === null) return null;
  return { key, batch, deletedAt, original: `${root}${rest.slice(slash + 1)}` };
}
