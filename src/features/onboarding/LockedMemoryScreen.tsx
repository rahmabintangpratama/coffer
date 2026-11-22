import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { t } from "@/lib/i18n";
import { vault } from "@/lib/storage/vault";
import type { ConnectionSummary } from "@/lib/types";
import { StepFrame } from "./StepFrame";

/**
 * O62 for a connection that was only in memory (AC-9.8): another tab (or a lock here) dropped its keys, and nothing saved can
 * bring them back. The screen says so, and the action leads straight to the connection form with provider, endpoint,
 * region, bucket and start folder kept; only the keys are typed again. If other connections are saved it also offers Unlock.
 */
export function LockedMemoryScreen({ connection, reason, onReenter, onUnlockSaved }: { connection: ConnectionSummary; reason: "manual" | "auto" | "remote" | "start"; onReenter: () => void; onUnlockSaved: () => void }) {
  const [saved, setSaved] = useState(0);
  useEffect(() => {
    let current = true;
    void vault.savedCount().then((count) => { if (current) setSaved(count); }, () => undefined);
    return () => { current = false; };
  }, []);
  return (
    <div className="cf-root min-h-dvh">
      <div className="cf-app flex min-h-dvh flex-col bg-app text-fg">
        <StepFrame title={t("ob.locked.title")}>
          <p className="text-md text-fg-muted">{reason === "remote" ? t("ob.locked.memory.remote") : t("ob.locked.memory.local")}</p>
          <p className="text-base font-semibold">{connection.name}</p>
          <p className="text-sm text-fg-muted">{t("ob.locked.memory.kept")}</p>
          <div className="flex flex-col gap-2">
            <Button variant="primary" size="lg" block onClick={onReenter}>{t("ob.locked.memory.cta")}</Button>
            {saved > 0 && <Button variant="secondary" size="lg" block onClick={onUnlockSaved}>{t("ob.locked.memory.unlock")}</Button>}
          </div>
        </StepFrame>
      </div>
    </div>
  );
}
