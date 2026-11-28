/**
 * The path Coffer is served under (`COFFER_BASE`): "/" at the root of an origin, or "/coffer/" below it. It always
 * starts and ends with "/". Only plain path segments are accepted, because the value is written into server configs.
 */
export function normalizeBase(input: string | undefined): string {
  const value = (input ?? "").trim();
  if (value === "" || value === "/") return "/";
  const segments = value.split("/").filter((segment) => segment !== "");
  if (!value.startsWith("/") || segments.length === 0 || !segments.every((segment) => /^[A-Za-z0-9._~-]+$/.test(segment) && segment !== "." && segment !== "..")) {
    throw new Error(`COFFER_BASE must be an absolute path such as /coffer/, got "${value}".`);
  }
  return `/${segments.join("/")}/`;
}
