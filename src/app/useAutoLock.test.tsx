import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { vault } from "@/lib/storage/vault";
import { useSettings } from "./settings";
import { autoLockDelayMs, useAutoLock } from "./useAutoLock";

// FR-9, AC-9.3: auto-lock after N minutes with no input; running transfers are not input.
const lockNow = vi.fn();
vi.mock("./lock", () => ({ lockNow: (reason: string) => { lockNow(reason); } }));

beforeEach(() => {
  vi.useFakeTimers();
  lockNow.mockClear();
  vi.spyOn(vault, "isUnlocked").mockReturnValue(true);
  useSettings.setState({ autoLockMinutes: 15 });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const idle = async (minutes: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(minutes * 60_000); }); };

describe("useAutoLock", () => {
  it("locks after the chosen minutes without input", async () => {
    renderHook(() => { useAutoLock(); });
    await idle(14);
    expect(lockNow).not.toHaveBeenCalled();
    await idle(1.1);
    expect(lockNow).toHaveBeenCalledWith("auto");
  });

  it("pointer, key and touch input each restart the wait", async () => {
    renderHook(() => { useAutoLock(); });
    for (const type of ["pointerdown", "keydown", "touchstart"]) {
      await idle(10);
      act(() => { document.dispatchEvent(new Event(type)); });
    }
    await idle(10);
    expect(lockNow).not.toHaveBeenCalled();
    await idle(6);
    expect(lockNow).toHaveBeenCalledTimes(1);
  });

  it("Never (0) does not lock, and nor does a device with nothing saved", async () => {
    useSettings.setState({ autoLockMinutes: 0 });
    const never = renderHook(() => { useAutoLock(); });
    await idle(120);
    expect(lockNow).not.toHaveBeenCalled();
    never.unmount();
    useSettings.setState({ autoLockMinutes: 15 });
    vi.spyOn(vault, "isUnlocked").mockReturnValue(false);
    renderHook(() => { useAutoLock(); });
    await idle(120);
    expect(lockNow).not.toHaveBeenCalled();
  });

  it("stops watching when the app goes away", async () => {
    const view = renderHook(() => { useAutoLock(); });
    view.unmount();
    await idle(60);
    expect(lockNow).not.toHaveBeenCalled();
  });

  it("uses real minutes: only a test build shortens the 5-minute choice", () => {
    expect(autoLockDelayMs(15)).toBe(15 * 60_000);
    expect(autoLockDelayMs(60)).toBe(3_600_000);
    expect(autoLockDelayMs(5)).toBe(300_000);
  });
});
