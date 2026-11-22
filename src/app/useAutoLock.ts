import { useEffect, useSyncExternalStore } from "react";
import { vault } from "@/lib/storage/vault";
import { useSettings } from "./settings";

const ACTIVITY = ["pointerdown", "pointermove", "keydown", "touchstart", "wheel"] as const;

/**
 * The e2e build shortens the 5-minute choice (and only that one) to this many milliseconds, so a test can watch an
 * auto-lock fire. Other choices, and every real build, use the real minutes.
 */
const testDelay = Number.parseInt(import.meta.env.VITE_COFFER_AUTOLOCK_TEST_MS ?? "", 10);

export const autoLockDelayMs = (minutes: number): number => (minutes === 5 && Number.isFinite(testDelay) && testDelay > 0 ? testDelay : minutes * 60_000);

const subscribe = (listener: () => void) => {
  const offUnlock = vault.onUnlock(listener);
  const offLock = vault.onLock(listener);
  return () => { offUnlock(); offLock(); };
};
const isUnlocked = () => vault.isUnlocked();

/**
 * Auto-lock (FR-9): after N minutes with no pointer, key or touch input the keys and the derived key are cleared and
 * the Locked screen shows. Running transfers do not count as activity (C-27), and a connection that is only in memory has
 * no passphrase to unlock with, so nothing locks while nothing is saved.
 */
export function useAutoLock(): void {
  const minutes = useSettings((state) => state.autoLockMinutes);
  const unlocked = useSyncExternalStore(subscribe, isUnlocked);

  useEffect(() => {
    if (minutes === 0 || !unlocked) return;
    const delay = autoLockDelayMs(minutes);
    const fire = () => {
      if (vault.isUnlocked()) void import("./lock").then((module) => { module.lockNow("auto"); });
    };
    let timer = setTimeout(fire, delay);
    let last = 0;
    const reset = () => {
      const now = Date.now();
      // Moving the pointer fires many events; one reset per quarter second is enough.
      if (now - last < 250) return;
      last = now;
      clearTimeout(timer);
      timer = setTimeout(fire, delay);
    };
    for (const name of ACTIVITY) document.addEventListener(name, reset, { passive: true });
    return () => {
      clearTimeout(timer);
      for (const name of ACTIVITY) document.removeEventListener(name, reset);
    };
  }, [minutes, unlocked]);
}
