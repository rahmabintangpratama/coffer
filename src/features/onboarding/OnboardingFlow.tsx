import { lazy, Suspense, useEffect, useState } from "react";
import { CopyBoundary } from "@/components/CopyBoundary";
import { loadCopyGroups, t } from "@/lib/i18n";
import type { ConnectionSummary } from "@/lib/types";
import { WelcomeScreen } from "./WelcomeScreen";

// The provider list, the form and the S3 client load when "Connect a bucket" is pressed, and are fetched
// while idle after Welcome shows, so the next step still feels instant (D-40).
const loadConnectFlow = () => import("./ConnectFlow");
const ConnectFlow = lazy(loadConnectFlow);
const connectGroups = ["form", "conn"] as const;

function prefetchConnect(): void {
  void Promise.all([loadConnectFlow(), loadCopyGroups(...connectGroups), import("@/lib/s3")]).catch(() => undefined);
}

/** Runs `task` when the browser is idle; Safari has no requestIdleCallback, so a timer stands in. */
function whenIdle(task: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(task);
    return () => { window.cancelIdleCallback(handle); };
  }
  const timer = window.setTimeout(task, 1500);
  return () => { window.clearTimeout(timer); };
}

function LoadFailed() {
  return (
    <div role="alert" className="p-6">
      <h1 className="text-lg font-semibold">{t("app.loadError.title")}</h1>
      <p className="mt-2 text-fg-muted">{t("app.loadError.body")}</p>
    </div>
  );
}

const blank = <div aria-busy="true" className="min-h-dvh" />;

/**
 * Welcome to a tested connection (FR-1 to FR-7). Welcome is all this chunk draws; the steps after it
 * are `ConnectFlow`, a lazy chunk.
 */
export function OnboardingFlow({ onConnected, adding = false, onCancel }: { onConnected: (connection: ConnectionSummary) => void; adding?: boolean; onCancel?: () => void }) {
  // "Add connection" starts at the provider list and goes back to the app, not to Welcome.
  const [connecting, setConnecting] = useState(adding);
  useEffect(() => whenIdle(prefetchConnect), []);
  return (
    // .cf-root is the container the layout queries measure; .cf-app stays directly inside it, as in the shell.
    <div className="cf-root min-h-dvh">
      <div className="cf-app flex min-h-dvh flex-col bg-app text-fg">
        {connecting ? (
          <CopyBoundary groups={connectGroups} fallback={blank} errorFallback={<LoadFailed />}>
            <Suspense fallback={blank}>
              <ConnectFlow onBack={() => { if (adding && onCancel) onCancel(); else setConnecting(false); }} onConnected={onConnected} />
            </Suspense>
          </CopyBoundary>
        ) : (
          <WelcomeScreen onConnect={() => { setConnecting(true); }} />
        )}
      </div>
    </div>
  );
}
