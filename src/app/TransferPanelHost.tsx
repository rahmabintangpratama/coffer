import { TransferPanel, useTransfers } from "@/features/transfers";
import { CopyBoundary } from "@/components/CopyBoundary";

/** The panel on every route. Its copy loads only when there is something to show. */
export function TransferPanelHost() {
  const visible = useTransfers((state) => state.transfers.length + state.interrupted.length + state.operations.length > 0);
  if (!visible) return null;
  return (
    <CopyBoundary groups={["upl", "op"]} fallback={null} errorFallback={null}>
      <TransferPanel />
    </CopyBoundary>
  );
}
