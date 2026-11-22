import { useCallback, useEffect, useState } from "react";
import type { ConnectionSummary, FileItem, FileKind } from "@/lib/types";

/** Over this many bytes a file is not read into memory to be shown (loopback endpoints only; see useMediaSource). */
export const BLOB_CAP = 200 * 1024 * 1024;
/** Text and code show the first 1 MiB (AC-54.1). */
export const TEXT_LIMIT = 1024 * 1024;
/** An SVG over 2 MiB is not drawn (AC-57.2). */
export const SVG_LIMIT = 2 * 1024 * 1024;
const SNIFF_BYTES = 512;

async function client(connection: ConnectionSummary) {
  const { clientFor } = await import("@/lib/s3");
  return clientFor(connection);
}

export type Loaded<T> = { state: "loading" } | { state: "error" } | { state: "ready"; value: T };

/** The first bytes (or all) of a file, read through the signed API. Resets when the file changes. */
export function useObjectBytes(connection: ConnectionSummary, file: FileItem, length: number | undefined, enabled = true): Loaded<Uint8Array> {
  const [result, setResult] = useState<{ key: string; loaded: Loaded<Uint8Array> } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const { readObject } = await import("@/lib/s3");
        const value = await readObject(await client(connection), { bucket: connection.bucket ?? "", key: file.key, ...(length === undefined ? {} : { length }), signal: controller.signal });
        if (!controller.signal.aborted) setResult({ key: file.key, loaded: { state: "ready", value } });
      } catch {
        if (!controller.signal.aborted) setResult({ key: file.key, loaded: { state: "error" } });
      }
    })();
    return () => { controller.abort(); };
  }, [connection, file.key, length, enabled]);
  return result?.key === file.key ? result.loaded : { state: "loading" };
}

/**
 * What the file really is: the extension decides, and only a file with no
 * telling extension has its first bytes read (FR-50 "extension plus magic bytes").
 */
export function useKind(connection: ConnectionSummary, file: FileItem): FileKind | "loading" {
  const needsSniff = file.fileKind === "unknown";
  const head = useObjectBytes(connection, file, SNIFF_BYTES, needsSniff);
  const [kind, setKind] = useState<{ key: string; kind: FileKind } | null>(null);
  useEffect(() => {
    if (!needsSniff || head.state === "loading") return;
    let cancelled = false;
    void import("@/lib/s3").then(({ sniffKind }) => {
      if (!cancelled) setKind({ key: file.key, kind: head.state === "ready" ? sniffKind(head.value) : "unknown" });
    });
    return () => { cancelled = true; };
  }, [needsSniff, head, file.key]);
  if (!needsSniff) return file.fileKind;
  return kind?.key === file.key ? kind.kind : "loading";
}

const REVOKE_DELAY_MS = 1000;

/**
 * A URL an <img>, <video> or <audio> can use. On an https endpoint it is a
 * presigned link (technical-spec 6.5), so the browser streams from the provider
 * and nothing passes through memory. The CSP allows https: for media but http only
 * for loopback in connect-src, not in img-src or media-src, so on a loopback http
 * endpoint (a local MinIO or the test fixture) the file is read through the signed
 * API into a blob: URL instead, up to BLOB_CAP (D-38). `retry` signs a new link.
 */
export function useMediaSource(connection: ConnectionSummary, file: FileItem, seconds: number): { source: Loaded<string>; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; attempt: number; loaded: Loaded<string> } | null>(null);
  useEffect(() => {
    // Held in an object so the cleanup sees what the async work did.
    const made: { url: string | null; cancelled: boolean } = { url: null, cancelled: false };
    void (async () => {
      try {
        const s3 = await import("@/lib/s3");
        const handle = s3.clientFor(connection);
        const bucket = connection.bucket ?? "";
        let value: string;
        if (new URL(connection.endpoint).protocol === "https:") {
          value = await s3.presignView(handle, { bucket, key: file.key, name: file.name, seconds });
        } else {
          if (file.size > BLOB_CAP) throw new Error("too large");
          const bytes = await s3.readObject(handle, { bucket, key: file.key });
          const type = s3.mimeOf(file.name);
          made.url = URL.createObjectURL(new Blob([bytes as BlobPart], type === undefined ? {} : { type }));
          value = made.url;
        }
        if (made.cancelled) {
          if (made.url !== null) URL.revokeObjectURL(made.url);
          return;
        }
        setResult({ key: file.key, attempt, loaded: { state: "ready", value } });
      } catch {
        if (!made.cancelled) setResult({ key: file.key, attempt, loaded: { state: "error" } });
      }
    })();
    return () => {
      made.cancelled = true;
      // Revoked a moment after the element is gone: WebKit logs "WebKitBlobResource error 1" when a blob it is still
      // loading is revoked in the same task that removes its <img> or <audio>.
      const url = made.url;
      if (url !== null) setTimeout(() => { URL.revokeObjectURL(url); }, REVOKE_DELAY_MS);
    };
  }, [connection, file.key, file.name, file.size, seconds, attempt]);
  const retry = useCallback(() => { setAttempt((value) => value + 1); }, []);
  const current = result?.key === file.key && result.attempt === attempt ? result.loaded : ({ state: "loading" } as const);
  return { source: current, retry };
}
