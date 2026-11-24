import { stripHiddenChars } from "@/lib/names";

/**
 * A Content-Disposition value with the file's name for a download (RFC 6266 and
 * RFC 5987): an ASCII fallback in `filename` and the exact name in `filename*`.
 * Quotes, backslashes, control characters, `%` and non-ASCII are all encoded, so
 * a hostile file name cannot add a header parameter.
 */
export function attachmentDisposition(rawName: string): string {
  // Direction controls and zero-width characters would let the save dialog show another extension (S-10).
  const name = stripHiddenChars(rawName);
  const fallback = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\%]/g, "_");
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
