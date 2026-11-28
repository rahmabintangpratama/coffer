/**
 * Whether other sites are likely to live on the origin the app runs on (C-61): it is served under a path, or it sits
 * under a path of a GitHub Pages host, where every project of an account shares the origin. A page cannot ask the
 * browser who else uses its origin, so an app at the root of an origin it shares is not noticed.
 */
export function isSharedOrigin(base: string, hostname: string, pathname: string): boolean {
  if (base !== "/") return true;
  return hostname.toLowerCase().endsWith(".github.io") && pathname !== "/" && pathname !== "/index.html";
}
