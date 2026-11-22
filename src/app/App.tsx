import { lazy, Suspense, useEffect } from "react";
import { CopyBoundary } from "@/components/CopyBoundary";
import { LoadError } from "./LoadError";
import { routes } from "./routes";
import { useSession } from "./session";

// Onboarding, the provider presets and the form are not needed once connected, so they are one lazy chunk.
const OnboardingFlow = lazy(() => import("@/features/onboarding").then((module) => ({ default: module.OnboardingFlow })));
const onboardingGroups = ["ob"] as const;
// Unlock is its own small chunk: a device with saved connections opens on it, so it must not wait for the shell.
const UnlockScreen = lazy(() => import("@/features/onboarding/UnlockScreen").then((module) => ({ default: module.UnlockScreen })));
const unlockGroups = ["ob", "forget"] as const;
// The connected app (shell, routes, query client, transfers) loads after the connection exists, not before the first paint.
const ConnectedApp = lazy(() => import("./ConnectedApp"));

const blank = <div className="cf-root min-h-dvh bg-app" aria-busy="true" />;

/**
 * Unlock when keys are locked, onboarding until a connection exists (or while one is added), then the connected app.
 * Paths come from routes.ts. The lock, tab-sync and forget code loads when it is first needed.
 */
export function App() {
  const connection = useSession((state) => state.connection);
  const locked = useSession((state) => state.locked);
  const adding = useSession((state) => state.adding);

  // Lock and Forget in another tab reach this one (FR-9, FR-10).
  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    void import("@/lib/storage/tabsync").then(({ tabSync }) => {
      if (cancelled) return;
      stop = tabSync().subscribe((message) => { void import("./lock").then((module) => { module.applyTabMessage(message); }); });
    });
    return () => { cancelled = true; stop?.(); };
  }, []);

  if (adding || (!connection && !locked)) {
    const session = useSession.getState();
    return (
      <CopyBoundary groups={onboardingGroups} fallback={blank} errorFallback={<LoadError />}>
        <Suspense fallback={blank}>
          <OnboardingFlow
            adding={adding}
            onCancel={session.stopAdding}
            onConnected={(summary) => {
              session.connect(summary);
              void import("@/lib/storage/vault").then(({ vault }) => vault.saved()).then(session.setSaved, () => undefined);
              // The app lands on Files; a hash route, so nothing about the connection goes in the URL path.
              window.location.hash = `#${routes.files}`;
            }}
          />
        </Suspense>
      </CopyBoundary>
    );
  }

  if (locked) {
    const session = useSession.getState();
    return (
      <CopyBoundary groups={unlockGroups} fallback={blank} errorFallback={<LoadError />}>
        <Suspense fallback={blank}>
          <UnlockScreen
            reason={locked.reason}
            {...(locked.minutes === undefined ? {} : { minutes: locked.minutes })}
            {...(locked.connectionId !== undefined ? { previousId: locked.connectionId } : connection ? { previousId: connection.id } : {})}
            onUnlocked={(open, saved) => {
              session.unlocked(open, saved);
              if (window.location.hash === "" || window.location.hash === "#") window.location.hash = `#${routes.files}`;
            }}
            onUseOther={session.startAdding}
            onNothingSaved={() => { session.leaveLock(); }}
            onStopTransfers={() => { void import("./lock").then((module) => { module.stopTransfersAndLock(); }); }}
            onForget={() => import("./lock").then((module) => module.forgetThisDevice())}
          />
        </Suspense>
      </CopyBoundary>
    );
  }

  return (
    <Suspense fallback={blank}>
      {connection && <ConnectedApp connection={connection} />}
    </Suspense>
  );
}
