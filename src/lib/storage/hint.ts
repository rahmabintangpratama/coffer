/**
 * `coffer:saved`: "1" while at least one connection is saved on this device. It lets the first paint choose between
 * Welcome and Unlock without opening IndexedDB, and holds no secret. The `connections` store is the truth: Unlock
 * checks it and falls back to Welcome when the hint was stale.
 */
export const SAVED_HINT_KEY = "coffer:saved";

export function savedHint(): boolean {
  try {
    return window.localStorage.getItem(SAVED_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSavedHint(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(SAVED_HINT_KEY, "1");
    else window.localStorage.removeItem(SAVED_HINT_KEY);
  } catch {
    // Storage can be unavailable (private mode); the hint only saves a lookup.
  }
}
