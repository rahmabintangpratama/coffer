import { QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useEffect } from "react";
import { Route, Router, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { configureTransfers } from "@/features/transfers";
import type { ConnectionSummary } from "@/lib/types";
import { abortInterruptedUploads } from "./abortOnLoad";
import { CopyBoundary } from "./CopyBoundary";
import { LoadError } from "./LoadError";
import { queryClient } from "./query";
import { routes } from "./routes";
import { NotFoundScreen } from "./screens/NotFoundScreen";
import { PlaceholderScreen } from "./screens/PlaceholderScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { useSettings } from "./settings";
import { Shell } from "./Shell";

// Browsing is its own chunk too: the listing code, the virtualizer and the menus load when Files opens.
const FilesRoute = lazy(() => import("./screens/FilesRoute"));
const HomeScreen = lazy(() => import("@/features/files").then((module) => ({ default: module.HomeScreen })));
const filesGroups = ["files", "det", "filter", "search", "sel", "kind", "col", "view", "sort", "row", "menu", "home", "type", "dlg", "conf", "upl", "drop", "pv"] as const;

// The upload queue reads how many parts may be in flight from the settings at the moment each part starts.
configureTransfers({ getConcurrency: () => useSettings.getState().uploadConcurrency });

/**
 * Everything after a connection exists: the query client, the router, the shell and
 * its routes. It is one lazy chunk, so the first paint (Welcome and the connection
 * form) does not carry TanStack Query, the shell, the transfer queue or the settings.
 */
export default function ConnectedApp({ connection }: { connection: ConnectionSummary }) {
  // Uploads that a reload cut off are aborted at the provider as soon as a connection to their bucket exists.
  useEffect(() => {
    // IndexedDB can be missing (some private modes); the abort is best effort and must never break the app.
    void abortInterruptedUploads(connection).catch(() => undefined);
  }, [connection]);

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
