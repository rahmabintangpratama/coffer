import type { ConnectionSummary } from "@/lib/types";

/** What saving an edited connection will do, known once its test has passed (AC-11.6). */
export type EditPlan =
  /** Endpoint, region, addressing, bucket and start folder are unchanged: the record is written again. */
  | { kind: "same" }
  /** The destination changed: a new record is written, then the old one is removed with this browser's data for it. */
  | { kind: "replace"; transfers: number; uploads: number; starred: number; recent: number }
  /** The destination changed while moves are unfinished: nothing is saved (C-55). */
  | { kind: "blocked"; unfinished: number };

export interface EditActions {
  plan: (next: ConnectionSummary) => Promise<EditPlan>;
  /** `next.id` names the tested keys in the vault. Rejects when nothing was changed. */
  save: (next: ConnectionSummary) => Promise<{ connection: ConnectionSummary; oldRemoved: boolean }>;
}
