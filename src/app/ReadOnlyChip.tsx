import { CopyBoundary } from "@/components/CopyBoundary";
import { ReadOnlyBadge } from "@/components/ReadOnlyBadge";
import { canWrite } from "@/features/readonly";
import { t } from "@/lib/i18n";
import { useSession } from "./session";

const groups = ["ro"] as const;

function Chip() {
  return <ReadOnlyBadge label={t("ro.badge")} title={t("ro.reason")} />;
}

/** The Read-only chip in the app bar of a read-only connection (AC-111.1). It loads its own copy: the bar is outside every route. */
export function ReadOnlyChip() {
  const connection = useSession((state) => state.connection);
  if (!connection || canWrite(connection)) return null;
  return (
    <CopyBoundary groups={groups} fallback={null} errorFallback={null}>
      <Chip />
    </CopyBoundary>
  );
}
