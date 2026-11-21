import { Route, Router, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { NotFoundScreen } from "./screens/NotFoundScreen";
import { PlaceholderScreen } from "./screens/PlaceholderScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { routes } from "./routes";
import { Shell } from "./Shell";

/** The router and the screen for each route. Paths come from routes.ts. */
export function App() {
  return (
    <Router hook={useHashLocation}>
      <Shell>
        <Switch>
          <Route path={routes.home}>
            <PlaceholderScreen titleKey="nav.home" />
          </Route>
          <Route path={routes.files}>
            <PlaceholderScreen titleKey="nav.files" />
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
  );
}
