import { QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useEffect } from "react";
import { Route, Router, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { InterruptedBanner, loadInterrupted } from "@/features/operations";
import { configureTransfers } from "@/features/transfers";
import type { ConnectionSummary } from "@/lib/types";
import { abortInterruptedUploads } from "./abortOnLoad";
import { useToasts } from "./toast";
import { CopyBoundary } from "@/components/CopyBoundary";
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
const TrashRoute = lazy(() => import("./screens/TrashRoute"));
const HomeScreen = lazy(() => import("@/features/files").then((module) => ({ default: module.HomeScreen })));
const filesGroups = ["files", "det", "filter", "search", "sel", "kind", "col", "view", "sort", "row", "menu", "home", "type", "dlg", "conf", "upl", "drop", "pv", "op", "ro", "share"] as const;
const trashGroups = ["trash", "del", "sel", "conf", "op", "ro"] as const;

// The upload queue reads how many parts may be in flight from the settings at the moment each part starts.
configureTransfers({ getConcurrency: () => useSettings.getState().uploadConcurrency });

/** The interrupted-operation banner, with its copy loaded first; it draws nothing while nothing was interrupted. */
function OperationsBanner(props: { connection: ConnectionSummary; notify: (message: string, action?: { label: string; run: () => void }) => void }) {
  return (
    <CopyBoundary groups={["op", "dlg", "files"]} fallback={null} errorFallback={null}>
      <InterruptedBanner {...props} />
    </CopyBoundary>
  );
}

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
    // Moves that were running when the page closed become "interrupted" and wait for Resume, Review or Discard (FR-45).
    void loadInterrupted(connection).catch(() => undefined);
  }, [connection]);
  const push = useToasts((state) => state.push);

  const screenFallback = <div aria-busy="true" className="min-h-40" />;
  return (
    <QueryClientProvider client={queryClient}>
      <Router hook={useHashLocation}>
        <Shell>
          <OperationsBanner connection={connection} notify={(message, action) => { push({ message, ...(action ? { actionLabel: action.label, onAction: action.run } : {}) }); }} />
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
              <CopyBoundary groups={trashGroups} fallback={screenFallback} errorFallback={<LoadError />}>
                <Suspense fallback={screenFallback}>
                  <TrashRoute connection={connection} />
                </Suspense>
              </CopyBoundary>
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
