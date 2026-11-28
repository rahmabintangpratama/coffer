import type { EditActions } from "@/features/onboarding";
import { bindingOf } from "@/lib/storage/crypto";
import { carryLibrary } from "@/lib/storage/library";
import { vault } from "@/lib/storage/vault";
import type { ConnectionSummary } from "@/lib/types";
import { connectionRemoval } from "./removal";

/** Whether both point at the same place: the fields the sealed record is bound to, besides its id (D-49). */
export const sameDestination = (before: ConnectionSummary, next: ConnectionSummary): boolean => bindingOf({ ...next, id: before.id }) === bindingOf(before);

/**
 * Whether Starred and Recent still point at the same objects: the same server and bucket. Rows for keys outside the new
 * start folder are not taken.
 */
const sameObjects = (before: ConnectionSummary, next: ConnectionSummary): boolean =>
  new URL(next.endpoint).origin === new URL(before.endpoint).origin && next.bucket === before.bucket;

async function carried(before: ConnectionSummary, next: ConnectionSummary, to?: string): Promise<{ starred: number; recent: number }> {
  if (!sameObjects(before, next)) return { starred: 0, recent: 0 };
  return carryLibrary(before.id, next.bucket ?? "", next.prefix ?? "", to);
}

/**
 * Saving an edited connection (AC-11.6, OQ-38). The same destination writes the record again under its id, in one
 * IndexedDB put. A changed destination is a new record under a new id; Starred and Recent are copied to it when they
 * still point at the same objects, and the old one is removed (C-55) only after both are stored. While the old one has
 * unfinished moves nothing is saved. The journal is never carried over.
 */
export function editActions(before: ConnectionSummary): EditActions {
  return {
    async plan(next) {
      if (sameDestination(before, next)) return { kind: "same" };
      const { unfinished, transfers, uploads, starred, recent } = await connectionRemoval.inspect(before);
      if (unfinished.length > 0) return { kind: "blocked", unfinished: unfinished.length };
      const keep = await carried(before, next);
      return { kind: "replace", transfers, uploads, starred: starred - keep.starred, recent: recent - keep.recent, kept: keep.starred + keep.recent };
    },
    async save(next) {
      if (sameDestination(before, next)) {
        const connection = { ...next, id: before.id };
        await vault.save(connection, undefined, next.id);
        return { connection, oldRemoved: true };
      }
      // Asked again: a move may have been cut off since the review.
      if ((await connectionRemoval.inspect(before)).unfinished.length > 0) throw new Error("unfinished moves");
      await vault.save(next);
      try {
        await carried(before, next, next.id);
        await connectionRemoval.remove(before);
      } catch {
        return { connection: next, oldRemoved: false };
      }
      return { connection: next, oldRemoved: true };
    },
  };
}
