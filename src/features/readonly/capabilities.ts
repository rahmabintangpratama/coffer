import { t } from "@/lib/i18n";
import type { ConnectionSummary } from "@/lib/types";

/**
 * What the connection's key may do (FR-111). Every write action in the app asks here, so a read-only key is treated the same
 * in menus, selection bars, New and the FAB, the viewer and Trash: disabled with the reason, or hidden where there is no room.
 */
export const canWrite = (connection: Pick<ConnectionSummary, "access">): boolean => connection.access === "readWrite";

export interface WriteGate {
  readOnly: boolean;
  /** `ro.reason` while read-only, so a disabled control can say why. */
  reason: string | undefined;
  /** Props for a menu or toolbar action: disabled when read-only (or for its own reason), with the reason line. */
  action: (alsoDisabled?: boolean) => { disabled: boolean; reason?: string };
}

/** Read `t()` when called, not at import: the copy group may not be loaded yet. */
export function writeGate(readOnly: boolean): WriteGate {
  const reason = readOnly ? t("ro.reason") : undefined;
  return {
    readOnly,
    reason,
    action: (alsoDisabled = false) => ({ disabled: alsoDisabled || readOnly, ...(reason === undefined ? {} : { reason }) }),
  };
}

export const gateOf = (connection: Pick<ConnectionSummary, "access">): WriteGate => writeGate(!canWrite(connection));
