import { TransferPanel, useTransfers } from "@/features/transfers";
import { CopyBoundary } from "./CopyBoundary";

/** The panel on every route. Its copy loads only when there is something to show. */
export function TransferPanelHost() {
  const visible = useTransfers((state) => state.transfers.length + state.interrupted.length > 0);
  if (!visible) return null;
  return (
    <CopyBoundary groups={["upl"]} fallback={null} errorFallback={null}>
      <TransferPanel />
    </CopyBoundary>
  );
}
