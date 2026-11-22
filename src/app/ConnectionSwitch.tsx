import { useState, useSyncExternalStore } from "react";
import { CopyBoundary } from "@/components/CopyBoundary";
import { ConnectionSwitcher, LockDialog } from "@/features/vault";
import { vault } from "@/lib/storage/vault";
import { lockNow } from "./lock";
import { useSession } from "./session";

const copyGroups = ["conn", "sec"] as const;

const subscribe = (listener: () => void) => {
  const offUnlock = vault.onUnlock(listener);
  const offLock = vault.onLock(listener);
  return () => { offUnlock(); offLock(); };
};
const isUnlocked = () => vault.isUnlocked();

/**
 * The connection switcher where the shell has room for it (FR-11): a block in the sidebar, an icon in the rail and a row in
 * the drawer. Choosing a connection whose keys are open switches to it; choosing a locked one goes to Unlock for it.
 * "Add connection" runs onboarding over the current session.
 */
export function ConnectionSwitch({ variant, className }: { variant: "icon" | "block"; className?: string }) {
  const connection = useSession((state) => state.connection);
  const unlocked = useSyncExternalStore(subscribe, isUnlocked);
  const [asking, setAsking] = useState(false);
  if (!connection) return null;
  const session = useSession.getState();
  return (
    // The switcher sits in the shell, outside every route's copy, so it loads its own groups.
    <CopyBoundary groups={copyGroups} fallback={null} errorFallback={null}>
      <ConnectionSwitcher
        active={connection}
        variant={variant}
        {...(className === undefined ? {} : { className })}
        onSwitch={(next) => {
          if (vault.has(next.id)) {
            session.connect(next);
            void vault.touch(next.id).catch(() => undefined);
            window.location.hash = "#/files";
          } else session.lock({ reason: "start", connectionId: next.id });
        }}
        onAdd={session.startAdding}
        {...(unlocked ? { onLock: () => { setAsking(true); } } : {})}
      />
      <LockDialog
        open={asking}
        onClose={() => { setAsking(false); }}
        onConfirm={() => { lockNow("manual"); }}
      />
    </CopyBoundary>
  );
}
