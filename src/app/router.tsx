import { createHashHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { PlaceholderScreen } from "./screens/PlaceholderScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { Shell } from "./Shell";

// Hash routing: the path lives in the URL fragment, so file keys and names
// never reach the host or its logs (NFR-8).
const rootRoute = createRootRoute({ component: Shell });

// The path type stays a literal so Link can check destinations at compile time.
const child = <const Path extends string>(path: Path, component: () => React.JSX.Element) =>
  createRoute({ getParentRoute: () => rootRoute, path, component });

const routeTree = rootRoute.addChildren([
  child("/", () => <PlaceholderScreen titleKey="nav.home" />),
  child("/files", () => <PlaceholderScreen titleKey="nav.files" />),
  child("/starred", () => <PlaceholderScreen titleKey="nav.starred" />),
  child("/trash", () => <PlaceholderScreen titleKey="nav.trash" />),
  child("/storage", () => <PlaceholderScreen titleKey="nav.storage" />),
  child("/settings", () => <SettingsScreen />),
]);

export const router = createRouter({ routeTree, history: createHashHistory() });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
