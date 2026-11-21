/** Waits are cancelled by the caller's signal. */
const abortError = () => Object.assign(new Error("aborted"), { name: "AbortError" });

/**
 * One pool for every running upload: at most `limit` part requests in flight
 * across all files (Settings.uploadConcurrency). A `SlowDown` halves the limit
 * for a while so the provider can recover (technical-spec 7).
 */
export class RequestPool {
  private active = 0;
  private waiting: (() => void)[] = [];
  private throttledUntil = 0;

  private readonly baseLimit: () => number;
  private readonly now: () => number;

  constructor(baseLimit: () => number, now: () => number = Date.now) {
    this.baseLimit = baseLimit;
    this.now = now;
  }

  get limit(): number {
    const base = Math.max(1, this.baseLimit());
    return this.now() < this.throttledUntil ? Math.max(1, Math.floor(base / 2)) : base;
  }

  /** Halve the limit for `ms` (30 s by default). */
  throttle(ms = 30_000): void {
    this.throttledUntil = Math.max(this.throttledUntil, this.now() + ms);
  }

  async run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) throw abortError();
    if (this.active < this.limit) {
      this.active += 1;
    } else {
      // The slot is counted by whoever wakes this waiter (drain), so it is never double-booked.
      await new Promise<void>((resolve, reject) => {
        const wake = () => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        };
        const onAbort = () => {
          this.waiting = this.waiting.filter((entry) => entry !== wake);
          reject(abortError());
        };
        this.waiting.push(wake);
        signal?.addEventListener("abort", onAbort, { once: true });
      });
    }
    try {
      return await task();
    } finally {
      this.active -= 1;
      this.drain();
    }
  }

  private drain(): void {
    while (this.active < this.limit) {
      const wake = this.waiting.shift();
      if (!wake) return;
      this.active += 1;
      wake();
    }
  }
}
