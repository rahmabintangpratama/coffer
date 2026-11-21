export { candidatesFromDrop, candidatesFromInput } from "./collect";
export type { UploadCandidate } from "./plan";
export { configureTransfers } from "./queue";
export { type OperationRow, useTransfers } from "./store";
export { TransferPanel } from "./TransferPanel";
export type { ConflictAnswer, ConflictChoice, ConflictQuestion } from "./resolve";
export { useConflictPrompt } from "./useConflictPrompt";
export { useUpload } from "./useUpload";

import { useTransfers } from "./store";

/** Show uploads that a reload interrupted and that the app has aborted at the provider (C-43). */
export function addInterruptedUploads(items: { id: string; name: string }[]): void {
  useTransfers.getState().addInterrupted(items);
}
