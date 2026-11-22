import { decideTargets, type Move } from "@/features/operations";
import type { ConflictAnswer, ConflictQuestion } from "@/features/transfers";
import { batchPrefixOf } from "@/lib/s3/trash";
import { batchTotals, canRestore, type TrashItem } from "./model";

export interface RestoreDeps {
  /** Which of these keys exist now (one listing per folder for a large set, HeadObject for a small one). */
  existing: (keys: string[]) => Promise<ReadonlySet<string>>;
  /** One key, for the free ` (n)` names that Keep both tries. */
  exists: (key: string) => Promise<boolean>;
  ask: (question: ConflictQuestion) => Promise<ConflictAnswer>;
}

/**
 * What a Restore does (FR-70): each selected object goes back to its original key. A key that exists now
 * goes through the conflict dialog with FR-43 semantics (AC-70.3). When nothing clashes and the selection is
 * every object of a batch, the batch moves back as one prefix (one journal entry, four objects in flight)
 * instead of one entry per object.
 *
 * A selected folder row stands for everything under it, so its objects are checked one by one like any other
 * selection (M10 audit). Moving the placeholder as a prefix would carry the whole subtree back and overwrite
 * existing keys without asking. A placeholder with objects under it stays in the trash once they are
 * restored; only an empty one goes back as itself.
 */
export async function planRestore(selected: readonly TrashItem[], all: readonly TrashItem[], root: string, deps: RestoreDeps): Promise<Move[]> {
  const chosenFolders = selected.filter((item) => item.folder);
  const under = all.filter((item) => chosenFolders.some((folder) => item.key !== folder.key && item.key.startsWith(folder.key)));
  const withChildren = new Set(all.filter((item) => item.folder && all.some((other) => other.key !== item.key && other.key.startsWith(item.key))).map((item) => item.key));
  const covered = [...new Map([...selected, ...under].filter(canRestore).map((item) => [item.key, item])).values()];
  const restorable = covered.filter((item) => !(item.folder && withChildren.has(item.key)));
  const objects = restorable.filter((item) => !item.folder);
  const found = await deps.existing(objects.map((item) => item.original));
  const checked = new Set(objects.map((item) => item.original));
  const exists = async (key: string) => found.has(key) || (!checked.has(key) && (await deps.exists(key)));
  const decided = await decideTargets(
    objects.map((item) => ({ source: item.key, target: item.original })),
    exists,
    deps.ask,
  );
  const moves: Move[] = [...restorable.filter((item) => item.folder).map((item) => ({ source: item.key, target: item.original })), ...decided];
  if (found.size > 0) return moves;

  const totals = batchTotals(all);
  const chosen = new Map<string, number>();
  for (const item of covered) chosen.set(item.batch, (chosen.get(item.batch) ?? 0) + 1);
  const whole = new Set([...chosen].filter(([batch, count]) => count === totals.get(batch) && batch !== "").map(([batch]) => batch));
  if (whole.size === 0) return moves;
  const byKey = new Map(restorable.map((item) => [item.key, item]));
  const rest = moves.filter((move) => !whole.has(byKey.get(move.source)?.batch ?? ""));
  return [...[...whole].map((batch) => ({ source: batchPrefixOf(root, batch), target: root })), ...rest];
}

export type { ConflictAnswer };
