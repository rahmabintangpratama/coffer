import { afterEach, describe, expect, it, vi } from "vitest";
import { heldUploadIds, UPLOAD_LOCK_PREFIX, withUploadLock } from "./locks";

/** A minimal Web Locks stand-in: exclusive, named, released when the task settles. */
function fakeLocks() {
  const held = new Set<string>();
  return {
    held,
    request: vi.fn(async (name: string, task: () => Promise<unknown>) => {
      held.add(name);
      try {
        return await task();
      } finally {
        held.delete(name);
      }
    }),
    query: vi.fn(() => Promise.resolve({ held: [...held].map((name) => ({ name })), pending: [] })),
  };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("D-36 upload locks", () => {
  it("holds the lock while the upload runs and releases it after", async () => {
    const locks = fakeLocks();
    vi.stubGlobal("navigator", { locks });
    const during: string[] = [];
    await withUploadLock("u1", async () => { during.push(...((await heldUploadIds()) ?? [])); });
    expect(locks.request).toHaveBeenCalledWith(`${UPLOAD_LOCK_PREFIX}u1`, expect.any(Function));
    expect(during).toEqual(["u1"]);
    expect([...((await heldUploadIds()) ?? [])]).toEqual([]);
  });

  it("releases the lock when the upload fails", async () => {
    const locks = fakeLocks();
    vi.stubGlobal("navigator", { locks });
    await expect(withUploadLock("u1", () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(locks.held.size).toBe(0);
  });

  it("ignores locks that are not upload locks", async () => {
    const locks = fakeLocks();
    locks.held.add("something-else");
    vi.stubGlobal("navigator", { locks });
    expect([...((await heldUploadIds()) ?? [])]).toEqual([]);
  });

  it("runs the task and reports unknown state when the Web Locks API is missing", async () => {
    vi.stubGlobal("navigator", {});
    expect(await withUploadLock("u1", () => Promise.resolve("ran"))).toBe("ran");
    expect(await heldUploadIds()).toBeNull();
  });
});
