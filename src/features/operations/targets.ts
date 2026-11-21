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
 * Decide what happens to each item whose target already exists (AC-32.3, FR-43 semantics): one
 * question per clash until "apply to all", then Replace keeps the target (the old object is
 * overwritten object by object as the move reaches it), Keep both picks the first free ` (n)` name, and
 * Skip drops the item. `exists` is asked about a key or a folder prefix.
 */
export async function decideTargets(
  moves: readonly Move[],
  exists: (key: string) => Promise<boolean>,
  ask: (question: ConflictQuestion) => Promise<ConflictAnswer>,
): Promise<Move[]> {
  const clashing: boolean[] = [];
  for (const move of moves) clashing.push(await exists(move.target));
  let remaining = clashing.filter(Boolean).length;
  const result: Move[] = [];
  let sticky: ConflictAnswer["choice"] | null = null;
  for (const [index, move] of moves.entries()) {
    if (!clashing[index]) {
      result.push(move);
      continue;
    }
    let choice: ConflictAnswer["choice"] | null = sticky;
    if (choice === null) {
      const answer = await ask({ key: move.target, remaining });
      choice = answer.choice;
      if (answer.applyToAll) sticky = choice;
    }
    remaining -= 1;
    if (choice === "skip") continue;
    if (choice === "replace") {
      result.push(move);
      continue;
    }
    const isFolder = move.target.endsWith("/");
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
