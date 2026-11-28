import type { EditActions } from "@/features/onboarding";
import { bindingOf } from "@/lib/storage/crypto";
import { vault } from "@/lib/storage/vault";
import type { ConnectionSummary } from "@/lib/types";
import { connectionRemoval } from "./removal";

/** Whether both point at the same place: the fields the sealed record is bound to, besides its id (D-49). */
export const sameDestination = (before: ConnectionSummary, next: ConnectionSummary): boolean => bindingOf({ ...next, id: before.id }) === bindingOf(before);

/**
 * Saving an edited connection (AC-11.6, OQ-38). The same destination writes the record again under its id, in one
 * IndexedDB put. A changed destination is a new record under a new id, and the old one is removed (C-55) only after
 * the new one is stored; while the old one has unfinished moves nothing is saved.
 */
export function editActions(before: ConnectionSummary): EditActions {
  return {
    async plan(next) {
      if (sameDestination(before, next)) return { kind: "same" };
      const { unfinished, transfers, uploads, starred, recent } = await connectionRemoval.inspect(before);
      return unfinished.length > 0 ? { kind: "blocked", unfinished: unfinished.length } : { kind: "replace", transfers, uploads, starred, recent };
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
        await connectionRemoval.remove(before);
      } catch {
        return { connection: next, oldRemoved: false };
      }
      return { connection: next, oldRemoved: true };
    },
  };
}
