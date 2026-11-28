/** Addresses into Files for a key under the connection root (same encoding as Files' own paths). */
const folderPath = (relativePrefix: string): string => {
  const parts = relativePrefix.split("/").filter((part) => part !== "");
  return parts.length === 0 ? "/files" : `/files/${parts.map(encodeURIComponent).join("/")}`;
};

/** The folder part of a key, relative to the root, ending in "/" (or "" at the root). */
export function parentOf(root: string, key: string): string {
  const relative = key.startsWith(root) ? key.slice(root.length) : key;
  const trimmed = relative.endsWith("/") ? relative.slice(0, -1) : relative;
  const cut = trimmed.lastIndexOf("/");
  return cut === -1 ? "" : trimmed.slice(0, cut + 1);
}

/** The last segment of a key, without a trailing "/". */
export function nameOfKey(key: string): string {
  const trimmed = key.endsWith("/") ? key.slice(0, -1) : key;
  return trimmed.slice(trimmed.lastIndexOf("/") + 1);
}

/** `#/files/<folder>`: a folder key opens itself. */
export function folderHref(root: string, key: string): string {
  return `#${folderPath(key.startsWith(root) ? key.slice(root.length) : key)}`;
}

/** `#/files/<parent>?preview=<key>`: the file opens in the viewer over its folder. */
export function fileHref(root: string, key: string): string {
  return `#${folderPath(parentOf(root, key))}?preview=${encodeURIComponent(key)}`;
}

/** The folder shown as a location: "bucket/a/b". */
export function locationLabel(bucket: string, root: string, key: string): string {
  const parent = parentOf(root, key);
  return parent === "" ? bucket : `${bucket}/${parent.slice(0, -1)}`;
}
