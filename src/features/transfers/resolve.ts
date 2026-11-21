import { keepBothKey } from "@/lib/s3/keys";
import type { PlannedUpload } from "./plan";

export type ConflictChoice = "replace" | "keepBoth" | "skip";

export interface ConflictAnswer {
  choice: ConflictChoice;
  applyToAll: boolean;
}

export interface ConflictQuestion {
  key: string;
  /** Conflicts still to decide, this one included (for "Apply to all N conflicts"). */
  remaining: number;
  /** A folder clash offers Merge (answered as `replace`) and Keep both, never Skip or Replace (D-42). */
  folder?: boolean;
}

/**
 * Decide what happens to each upload whose key already exists, or that repeats
 * a key earlier in the same batch (FR-43). One question per conflict until the
 * person picks "apply to all". `Keep both` finds the first free ` (n)` name,
 * checking the bucket for each candidate; `Replace` keeps the key, and the old
 * object is only overwritten when the new upload completes (AC-43.3); `Skip`
 * drops the file.
 */
export async function resolveConflicts(
  planned: readonly PlannedUpload[],
  existing: ReadonlySet<string>,
  ask: (question: ConflictQuestion) => Promise<ConflictAnswer>,
  existsInBucket: (keys: string[]) => Promise<ReadonlySet<string>>,
): Promise<PlannedUpload[]> {
  const known = new Set(existing);
  const taken = new Set<string>();
  const seen = new Set<string>();
  let remaining = 0;
  for (const item of planned) {
    if (known.has(item.key) || seen.has(item.key)) remaining += 1;
    seen.add(item.key);
  }

  const result: PlannedUpload[] = [];
  let sticky: ConflictChoice | null = null;
  for (const item of planned) {
    if (!known.has(item.key) && !taken.has(item.key)) {
      taken.add(item.key);
      result.push(item);
      continue;
    }
    let choice: ConflictChoice | null = sticky;
    if (choice === null) {
      const answer = await ask({ key: item.key, remaining });
      choice = answer.choice;
      if (answer.applyToAll) sticky = choice;
    }
    remaining -= 1;
    if (choice === "skip") continue;
    if (choice === "replace") {
      taken.add(item.key);
      result.push(item);
      continue;
    }
    let candidate = keepBothKey(item.key, (key) => known.has(key) || taken.has(key));
    // The listing or HEAD only saw some keys; ask the bucket about the candidate before using it.
    for (;;) {
      const present = await existsInBucket([candidate]);
      if (!present.has(candidate)) break;
      known.add(candidate);
      candidate = keepBothKey(item.key, (key) => known.has(key) || taken.has(key));
    }
    taken.add(candidate);
    result.push({ ...item, key: candidate });
  }
  return result;
}
