import { vault } from "@/lib/storage/vault";
import type { ConnectionSummary, FileItem } from "@/lib/types";

/**
 * Grid thumbnails (FileTile, M11). Only raster images up to THUMB_MAX_BYTES get one: the file is
 * fetched through a presigned GET (connect-src allows the provider), decoded and scaled by
 * `createImageBitmap` (off the main thread where the browser can), drawn to a small canvas and kept
 * as a blob: URL for the session. At most THUMB_CONCURRENCY run at once; a failure falls back to
 * the type icon. No backend, nothing stored on the device; the cache goes on lock.
 */
export const THUMB_MAX_BYTES = 8 * 1024 * 1024;
export const THUMB_CONCURRENCY = 4;
const THUMB_EDGE = 320;
const CACHE_LIMIT = 300;
const PRESIGN_SECONDS = 300;

/** Formats `createImageBitmap` decodes in every supported browser; SVG stays an icon (it is drawn only in the viewer, as <img>). */
const RASTER = /\.(png|jpe?g|gif|webp)$/i;

export function wantsThumbnail(file: Pick<FileItem, "name" | "size" | "fileKind">): boolean {
  return file.fileKind === "image" && file.size > 0 && file.size <= THUMB_MAX_BYTES && RASTER.test(file.name);
}

const cache = new Map<string, Promise<string | null>>();
const made = new Set<string>();
const cacheKey = (connection: ConnectionSummary, file: FileItem) => `${connection.id}|${connection.bucket ?? ""}|${file.key}|${file.etag}`;

vault.onLock(() => {
  cache.clear();
  for (const url of made) URL.revokeObjectURL(url);
  made.clear();
});

let running = 0;
const waiting: (() => void)[] = [];
async function slot<T>(task: () => Promise<T>): Promise<T> {
  if (running >= THUMB_CONCURRENCY) await new Promise<void>((resolve) => { waiting.push(resolve); });
  running += 1;
  try {
    return await task();
  } finally {
    running -= 1;
    waiting.shift()?.();
  }
}

async function render(connection: ConnectionSummary, file: FileItem): Promise<string | null> {
  const { clientFor, mimeOf, presignView, sniffKind } = await import("@/lib/s3");
  const url = await presignView(clientFor(connection), { bucket: connection.bucket ?? "", key: file.key, name: file.name, seconds: PRESIGN_SECONDS });
  const response = await fetch(url, { credentials: "omit", referrerPolicy: "no-referrer" });
  if (!response.ok) return null;
  const raw = await response.blob();
  // Only bytes that start like an image are decoded; a text file named .png keeps its icon (FR-58 does the same in the viewer).
  if (sniffKind(new Uint8Array(await raw.slice(0, 16).arrayBuffer())) !== "image") return null;
  const blob = new Blob([raw], { type: mimeOf(file.name) ?? "application/octet-stream" });
  const objectUrl = (await scaled(blob)) ?? decoded(blob);
  if (objectUrl) made.add(objectUrl);
  return objectUrl;
}

/** Decode and scale with createImageBitmap (off the main thread where supported), re-encoded small. */
async function scaled(blob: Blob): Promise<string | null> {
  try {
    const probe = await createImageBitmap(blob);
    const scale = Math.min(1, THUMB_EDGE / Math.max(probe.width, probe.height));
    const width = Math.max(1, Math.round(probe.width * scale));
    const height = Math.max(1, Math.round(probe.height * scale));
    probe.close();
    const bitmap = await createImageBitmap(blob, { resizeWidth: width, resizeHeight: height, resizeQuality: "medium" });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const small = await new Promise<Blob | null>((resolve) => { canvas.toBlob(resolve, "image/webp", 0.8); });
    return small ? URL.createObjectURL(small) : null;
  } catch {
    return null;
  }
}

/**
 * Where createImageBitmap cannot (some WebKit versions): the original bytes as they are (at most
 * THUMB_MAX_BYTES). The <img> that shows them falls back to the icon if they do not decode.
 */
function decoded(blob: Blob): string {
  return URL.createObjectURL(blob);
}

/** The thumbnail URL for a file, made once per session (and per ETag); null when it cannot be made. */
export function thumbnailFor(connection: ConnectionSummary, file: FileItem): Promise<string | null> {
  const key = cacheKey(connection, file);
  const known = cache.get(key);
  if (known) return known;
  const job = slot(() => render(connection, file)).catch(() => null);
  cache.set(key, job);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) {
      const dropped = cache.get(oldest);
      cache.delete(oldest);
      void dropped?.then((old) => {
        if (old) { URL.revokeObjectURL(old); made.delete(old); }
      });
    }
  }
  return job;
}
