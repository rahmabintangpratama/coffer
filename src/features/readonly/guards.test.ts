import { describe, expect, it, vi } from "vitest";
import { startDelete, startRestore, startTrash } from "@/features/operations";
import { startOperation } from "@/features/operations/run";
import { useTransfers } from "@/features/transfers";
import { startUploads } from "@/features/transfers/queue";
import type { ConnectionSummary } from "@/lib/types";

// FR-111: a call that gets past the screens still changes nothing on a read-only connection.
const readOnly: ConnectionSummary = {
  id: "ro1", name: "n", providerId: "custom", fields: {}, endpoint: "https://s3.example.test", region: "us-east-1",
  addressingStyle: "path", bucket: "photos", access: "readOnly", createdAt: "2026-01-01T00:00:00Z",
};
const hooks = () => ({ notify: vi.fn(), onChanged: vi.fn(), onFailures: vi.fn() });

describe("write entry points refuse a read-only connection", () => {
  it("uploads queue nothing", () => {
    startUploads(readOnly, [{ key: "a.txt", name: "a.txt", file: new Blob(["x"]) }], "");
    expect(useTransfers.getState().transfers).toEqual([]);
  });

  it.each([
    ["move", (h: ReturnType<typeof hooks>) => { startOperation({ connection: readOnly, kind: "move", source: "a", target: "b" }, h); }],
    ["trash", (h: ReturnType<typeof hooks>) => { startTrash({ connection: readOnly, root: "", keys: ["a"] }, h); }],
    ["restore", (h: ReturnType<typeof hooks>) => { startRestore({ connection: readOnly, moves: [{ source: "a", target: "b" }] }, h); }],
    ["delete", (h: ReturnType<typeof hooks>) => { startDelete({ connection: readOnly, total: 1, keys: ["a"] }, h); }],
  ])("%s says why and starts nothing", (_name, run) => {
    const h = hooks();
    run(h);
    expect(h.notify).toHaveBeenCalledWith("This key is read-only");
    expect(h.onChanged).not.toHaveBeenCalled();
    expect(useTransfers.getState().operations).toEqual([]);
  });
});
