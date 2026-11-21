import type { ConflictAnswer, ConflictQuestion } from "@/features/transfers";
import { keepBothKey } from "@/lib/s3/keys";

export interface ItemRef {
  /** The key, or for a folder its prefix ending in "/". */
  key: string;
  name: string;
  kind: "file" | "folder";
}

export interface Move {
  source: string;
  target: string;
}

/** The key an item would have in a folder: `dest + name`, with the trailing slash of a folder. */
export const targetIn = (destination: string, item: ItemRef): string => `${destination}${item.name}${item.kind === "folder" ? "/" : ""}`;

/** `name (copy).ext` in the same folder, then `name (copy 2).ext` and on (AC-33.1, AC-33.3). */
export function copyCandidate(name: string, n: number): string {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";
  return `${stem} (${n === 1 ? "copy" : `copy ${n.toString()}`})${extension}`;
}

/** The new name with the extension kept out of the selection, so typing replaces the stem only (FR-32 edge case). */
export function stemLength(name: string): number {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? dot : name.length;
}

/**
 * Decide what happens to each item whose target already exists (AC-32.3, FR-43 semantics, D-42):
 * one question per clash until "apply to all". A file gets Replace, Keep both or Skip. A folder gets
 * Keep both (a free ` (n)` name) or Merge, answered as `replace`: objects with the same key are
 * overwritten as the move reaches them and objects only the destination holds are left alone. "Apply
 * to all" holds for files and for folders separately. `exists` is asked about a key or a folder prefix.
 */
export async function decideTargets(
  moves: readonly Move[],
  exists: (key: string) => Promise<boolean>,
  ask: (question: ConflictQuestion) => Promise<ConflictAnswer>,
): Promise<Move[]> {
  const clashing: boolean[] = [];
  for (const move of moves) clashing.push(await exists(move.target));
  const remaining = { file: 0, folder: 0 };
  for (const [index, move] of moves.entries()) if (clashing[index]) remaining[move.target.endsWith("/") ? "folder" : "file"] += 1;
  const result: Move[] = [];
  const sticky: Record<"file" | "folder", ConflictAnswer["choice"] | null> = { file: null, folder: null };
  for (const [index, move] of moves.entries()) {
    if (!clashing[index]) {
      result.push(move);
      continue;
    }
    const isFolder = move.target.endsWith("/");
    const kind = isFolder ? "folder" : "file";
    let choice: ConflictAnswer["choice"] | null = sticky[kind];
    if (choice === null) {
      const answer = await ask({ key: move.target, remaining: remaining[kind], ...(isFolder ? { folder: true } : {}) });
      choice = answer.choice;
      if (answer.applyToAll) sticky[kind] = choice;
    }
    remaining[kind] -= 1;
    if (choice === "skip") continue;
    if (choice === "replace") {
      result.push(move);
      continue;
    }
    const base = isFolder ? move.target.slice(0, -1) : move.target;
    const taken = new Set<string>();
    let candidate = keepBothKey(base, (key) => taken.has(key));
    // Each candidate is asked about the bucket; the first free one wins.
    while (await exists(isFolder ? `${candidate}/` : candidate)) {
      taken.add(candidate);
      candidate = keepBothKey(base, (key) => taken.has(key));
    }
    result.push({ source: move.source, target: isFolder ? `${candidate}/` : candidate });
  }
  return result;
}
