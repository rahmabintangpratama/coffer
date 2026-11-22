import { useState, useSyncExternalStore } from "react";
import { create } from "zustand";
import { CopyBoundary } from "@/components/CopyBoundary";
import { ConnectionSwitcher, LockDialog } from "@/features/vault";
import { vault } from "@/lib/storage/vault";
import { lockNow } from "./lock";
import { useSession } from "./session";

/** Whether the switcher dialog is open, kept outside the component: the app bar is rebuilt when the Files bar loads. */
const useSwitcherOpen = create<{ variant: string | null; set: (variant: string | null) => void }>((set) => ({ variant: null, set: (variant) => { set({ variant }); } }));

const copyGroups = ["conn", "sec"] as const;

const subscribe = (listener: () => void) => {
  const offUnlock = vault.onUnlock(listener);
  const offLock = vault.onLock(listener);
  return () => { offUnlock(); offLock(); };
};
const isUnlocked = () => vault.isUnlocked();

/**
 * The connection switcher where the shell has room for it (FR-11): an avatar at the end of the app bar below 768 px, an icon
 * in the rail and a block in the sidebar. Choosing a connection whose keys are open switches to it; choosing a locked one goes to Unlock for it.
 * "Add connection" runs onboarding over the current session.
 */
export function ConnectionSwitch({ variant, className, part = "all" }: { variant: "avatar" | "icon" | "block"; className?: string; part?: "all" | "button" | "dialog" }) {
  const connection = useSession((state) => state.connection);
  const unlocked = useSyncExternalStore(subscribe, isUnlocked);
  const [asking, setAsking] = useState(false);
  // The avatar, the rail icon and the sidebar block all exist at once (CSS shows one), so each opens only its own dialog.
  const open = useSwitcherOpen((state) => state.variant === variant);
  const setOpenVariant = useSwitcherOpen((state) => state.set);
  if (!connection) return null;
  const session = useSession.getState();
  return (
    // The switcher sits in the shell, outside every route's copy, so it loads its own groups.
    <CopyBoundary groups={copyGroups} fallback={variant === "avatar" ? <span aria-hidden="true" className={`size-(--cf-size-touch-min) shrink-0 ${className ?? ""}`} /> : null} errorFallback={null}>
      <ConnectionSwitcher
        active={connection}
        variant={variant}
        part={part}
        open={open}
        onOpenChange={(next) => { setOpenVariant(next ? variant : null); }}
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
      {part === "button" ? null : (
        <LockDialog
          open={asking}
          onClose={() => { setAsking(false); }}
          onConfirm={() => { lockNow("manual"); }}
        />
      )}
    </CopyBoundary>
  );
}
