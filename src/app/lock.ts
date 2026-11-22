import { forgetDevice, releaseStorage } from "@/lib/storage/forget";
import { tabSync, type TabMessage } from "@/lib/storage/tabsync";
import { vault } from "@/lib/storage/vault";
import { queryClient } from "./query";
import { useSession } from "./session";
import { useSettings } from "./settings";

/**
 * Lock, auto-lock and Forget, as the app applies them (FR-9, FR-10). Each one that happens here is told to the
 * other tabs of the origin, which apply it themselves within a moment; a message carries no key, and unlocking in one
 * tab does not unlock another.
 */

/** Drop what the keys opened in this tab: the vault's key and keys, the cached listings, and the screen. */
function applyLock(reason: "manual" | "auto" | "remote"): void {
  const minutes = useSettings.getState().autoLockMinutes;
  vault.lock();
  queryClient.clear();
  useSession.getState().lock({ reason, ...(reason === "auto" ? { minutes } : {}) });
}

/** Lock this tab and tell the others. Running transfers keep their leases and finish (C-27). */
export function lockNow(reason: "manual" | "auto"): void {
  applyLock(reason);
  tabSync().post({ type: "lock", stop: false });
}

/** "Stop transfers and lock" (C-38): abort every running transfer here and in the other tabs, then lock. */
export function stopTransfersAndLock(): void {
  vault.stopLeases();
  applyLock("manual");
  tabSync().post({ type: "lock", stop: true });
}

/**
 * Forget this device (FR-10): everything Coffer stored is removed and the page returns to Welcome. The other tabs are
 * told first, so they close their database handles and reload; the delete then completes by itself.
 */
export async function forgetThisDevice(): Promise<void> {
  tabSync().post({ type: "forget" });
  await forgetDevice();
  queryClient.clear();
  returnToWelcome();
}

function returnToWelcome(): void {
  window.location.hash = "";
  window.location.reload();
}

/**
 * What another tab told this one (FR-9, FR-10). The App listens with the small tab-sync module and loads this code only when a
 * message arrives, so Unlock's first screen does not carry the lock, forget and query code.
 */
export function applyTabMessage(message: TabMessage): void {
  if (message.type === "lock") {
    if (message.stop) vault.stopLeases();
    applyLock("remote");
    return;
  }
  // Another tab forgot the device: let go of the database so its delete can finish, then start over at Welcome.
  void releaseStorage().finally(() => {
    queryClient.clear();
    returnToWelcome();
  });
}
