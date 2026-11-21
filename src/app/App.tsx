import { lazy, Suspense } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Router, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { t } from "@/lib/i18n";
import { CopyBoundary } from "./CopyBoundary";
import { NotFoundScreen } from "./screens/NotFoundScreen";
import { PlaceholderScreen } from "./screens/PlaceholderScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { queryClient } from "./query";
import { routes } from "./routes";
import { useSession } from "./session";
import { Shell } from "./Shell";

// Onboarding, the provider presets and the form are not needed once connected, so they are one lazy chunk.
const OnboardingFlow = lazy(() => import("@/features/onboarding").then((module) => ({ default: module.OnboardingFlow })));
const onboardingGroups = ["ob", "form", "conn"] as const;
// Browsing is its own chunk too: the listing code, the virtualizer and the menus load after connect.
const FilesRoute = lazy(() => import("./screens/FilesRoute"));
const HomeScreen = lazy(() => import("@/features/files").then((module) => ({ default: module.HomeScreen })));
const filesGroups = ["files", "det", "filter", "search", "sel", "kind", "col", "view", "sort", "row", "menu", "home", "type"] as const;

function LoadError() {
  return (
    <main className="cf-root mx-auto max-w-lg p-6">
      <h1 className="text-xl font-semibold">{t("app.loadError.title")}</h1>
      <p className="mt-2 text-fg-muted">{t("app.loadError.body")}</p>
    </main>
  );
}

/** Onboarding until a connection exists, then the router and the screen for each route. Paths come from routes.ts. */
export function App() {
  const connection = useSession((state) => state.connection);
  const connect = useSession((state) => state.connect);

  if (!connection) {
    return (
      <CopyBoundary groups={onboardingGroups} fallback={<div className="cf-root min-h-dvh bg-app" aria-busy="true" />} errorFallback={<LoadError />}>
        <Suspense fallback={<div className="cf-root min-h-dvh bg-app" aria-busy="true" />}>
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

  const screenFallback = <div aria-busy="true" className="min-h-40" />;
  return (
    <QueryClientProvider client={queryClient}>
    <Router hook={useHashLocation}>
      <Shell>
        <Switch>
          <Route path={routes.home}>
            <CopyBoundary groups={filesGroups} fallback={screenFallback} errorFallback={<LoadError />}>
              <Suspense fallback={screenFallback}>
                <HomeScreen connection={connection} />
              </Suspense>
            </CopyBoundary>
          </Route>
          <Route path={`${routes.files}/*?`}>
            <CopyBoundary groups={filesGroups} fallback={screenFallback} errorFallback={<LoadError />}>
              <Suspense fallback={screenFallback}>
                <FilesRoute connection={connection} />
              </Suspense>
            </CopyBoundary>
          </Route>
          <Route path={routes.starred}>
            <PlaceholderScreen titleKey="nav.starred" />
          </Route>
          <Route path={routes.trash}>
            <PlaceholderScreen titleKey="nav.trash" />
          </Route>
          <Route path={routes.storage}>
            <PlaceholderScreen titleKey="nav.storage" />
          </Route>
          <Route path={routes.settings}>
            <SettingsScreen />
          </Route>
          <Route>
            <NotFoundScreen />
          </Route>
        </Switch>
      </Shell>
    </Router>
    </QueryClientProvider>
  );
}
