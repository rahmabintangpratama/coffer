/**
 * The open preview is part of the address: `#/files/<folder>?preview=<key>`, in the
 * fragment so the key is never sent to the host (NFR-8; src/AGENTS.md: preview is a
 * search param of the hash route). wouter's navigate would write a real query
 * string, so the address is changed here and the router is told with a hashchange.
 * Opening pushes an entry (Back closes the viewer); moving between files replaces
 * it, so one Back leaves the viewer however many files were seen.
 */
const MARK = "coffer-preview";

export interface HashRoute {
  /** The path part, `/files/a/b`. */
  path: string;
  /** The key being previewed, or null. */
  preview: string | null;
}

/** Read the raw fragment. wouter decodes the location it hands out, which would corrupt `%25` in names, so this reads the address itself. */
export function readHashRoute(): HashRoute {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const cut = hash.indexOf("?");
  const path = `/${cut === -1 ? hash : hash.slice(0, cut)}`;
  const preview = cut === -1 ? null : new URLSearchParams(hash.slice(cut + 1)).get("preview");
  return { path, preview };
}

const urlFor = (path: string, key: string | null): string =>
  `${window.location.pathname}${window.location.search}#${path}${key === null ? "" : `?preview=${encodeURIComponent(key)}`}`;

function go(mode: "push" | "replace", url: string, marked: boolean): void {
  const state: unknown = marked ? { coffer: MARK } : null;
  if (mode === "push") window.history.pushState(state, "", url);
  else window.history.replaceState(state, "", url);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export function openPreview(key: string): void {
  go("push", urlFor(readHashRoute().path, key), true);
}

export function stepPreview(key: string): void {
  go("replace", urlFor(readHashRoute().path, key), true);
}

export function closePreview(): void {
  const state = window.history.state as { coffer?: string } | null;
  if (state?.coffer === MARK) window.history.back();
  else go("replace", urlFor(readHashRoute().path, null), false);
}
