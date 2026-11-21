import { lazy, Suspense } from "react";
import { CopyBoundary } from "@/components/CopyBoundary";
import { LoadError } from "./LoadError";
import { routes } from "./routes";
import { useSession } from "./session";

// Onboarding, the provider presets and the form are not needed once connected, so they are one lazy chunk.
const OnboardingFlow = lazy(() => import("@/features/onboarding").then((module) => ({ default: module.OnboardingFlow })));
const onboardingGroups = ["ob"] as const;
// The connected app (shell, routes, query client, transfers) loads after the connection exists, not before the first paint.
const ConnectedApp = lazy(() => import("./ConnectedApp"));

const blank = <div className="cf-root min-h-dvh bg-app" aria-busy="true" />;

/** Onboarding until a connection exists, then the connected app. Paths come from routes.ts. */
export function App() {
  const connection = useSession((state) => state.connection);
  const connect = useSession((state) => state.connect);

  if (!connection) {
    return (
      <CopyBoundary groups={onboardingGroups} fallback={blank} errorFallback={<LoadError />}>
        <Suspense fallback={blank}>
          <OnboardingFlow
            onConnected={(summary) => {
              connect(summary);
              // The app lands on Files; a hash route, so nothing about the connection goes in the URL path.
              window.location.hash = `#${routes.files}`;
            }}
          />
        </Suspense>
      </CopyBoundary>
    );
  }

  return (
    <Suspense fallback={blank}>
      <ConnectedApp connection={connection} />
    </Suspense>
  );
}
