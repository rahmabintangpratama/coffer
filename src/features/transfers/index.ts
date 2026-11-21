export { candidatesFromDrop, candidatesFromInput } from "./collect";
export type { UploadCandidate } from "./plan";
export { configureTransfers } from "./queue";
export { useTransfers } from "./store";
export { TransferPanel } from "./TransferPanel";
export { useUpload } from "./useUpload";

import { useTransfers } from "./store";

/** Show uploads that a reload interrupted and that the app has aborted at the provider (C-43). */
export function addInterruptedUploads(items: { id: string; name: string }[]): void {
  useTransfers.getState().addInterrupted(items);
}
