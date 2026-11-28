import { useCallback, useEffect, useRef } from "react";
import { create } from "zustand";
import { vault } from "@/lib/storage/vault";
import type { ConnectionSummary } from "@/lib/types";
import { addPage, emptyUsage, type Usage } from "./usage";

export type ScanPhase = "idle" | "running" | "done" | "cancelled" | "error";

export interface ScanState {
  phase: ScanPhase;
  usage: Usage;
  finishedAt: Date | null;
}

/** Results live in memory for the session, per connection and bucket: nothing about usage is stored on the device. */
const useScans = create<{ scans: Record<string, ScanState>; set: (id: string, state: ScanState) => void }>((set) => ({
  scans: {},
  set: (id, state) => { set((current) => ({ scans: { ...current.scans, [id]: state } })); },
}));

const idle: ScanState = { phase: "idle", usage: emptyUsage(), finishedAt: null };

// Folder names and totals came through the keys; they go with them, like the query cache.
vault.onLock(() => { useScans.setState({ scans: {} }); });

/**
 * The usage scan (FR-90): nothing runs until `start` (AC-90.1); it lists every object under the
 * connection root with no delimiter, page by page, and can be cancelled (AC-90.2). Leaving the
 * screen cancels it; the counts so far are kept as a partial result.
 */
export function useUsageScan(connection: ConnectionSummary) {
  const id = `${connection.id}|${connection.bucket ?? ""}|${connection.prefix ?? ""}`;
  const state = useScans((store) => store.scans[id]) ?? idle;
  const save = useScans((store) => store.set);
  const controller = useRef<AbortController | null>(null);

  const start = useCallback(() => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const root = connection.prefix ?? "";
    let usage = emptyUsage();
    save(id, { phase: "running", usage, finishedAt: null });
    void (async () => {
      try {
        const { clientFor, listUnder } = await import("@/lib/s3");
        for await (const page of listUnder(clientFor(connection), { bucket: connection.bucket ?? "", prefix: root, signal: abort.signal })) {
          usage = addPage(usage, page, root);
          save(id, { phase: "running", usage, finishedAt: null });
        }
        // An empty bucket answers one empty page, which the lister does not yield.
        if (usage.requests === 0) usage = { ...usage, requests: 1 };
        save(id, { phase: "done", usage, finishedAt: new Date() });
      } catch {
        save(id, { phase: abort.signal.aborted ? "cancelled" : "error", usage, finishedAt: new Date() });
      }
    })();
  }, [connection, id, save]);

  const cancel = useCallback(() => { controller.current?.abort(); }, []);
  useEffect(() => () => { controller.current?.abort(); }, []);

  return { state, start, cancel };
}
