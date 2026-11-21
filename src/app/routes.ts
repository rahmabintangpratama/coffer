// Every route in the app, in one place. A route is a string literal, so a typo
// in a link or a nav item is a compile error. Routing is hash-based: the path
// lives in the URL fragment, so file keys and names never reach the host (NFR-8).
export const routes = {
  home: "/",
  files: "/files",
  starred: "/starred",
  trash: "/trash",
  storage: "/storage",
  settings: "/settings",
} as const;

export type AppRoute = (typeof routes)[keyof typeof routes];

/** Home matches only itself; the others also match their sub-paths (`/files/exports`). */
export function isActiveRoute(route: AppRoute, location: string): boolean {
  if (route === routes.home) return location === "/" || location === "";
  return location === route || location.startsWith(`${route}/`);
}
