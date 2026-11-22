// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createTabSync, SIGNAL_KEY, type TabMessage, type TabSyncDeps } from "./tabsync";

// FR-9, FR-10: lock and forget reach the other tabs, by BroadcastChannel or by storage events, and carry no secret.

/** Two tabs of one origin sharing a channel. */
function channelPair() {
  const tabs: { onmessage: ((event: MessageEvent) => void) | null }[] = [];
  const make = () => {
    const tab = {
      onmessage: null as ((event: MessageEvent) => void) | null,
      postMessage: (data: unknown) => { for (const other of tabs) if (other !== tab) other.onmessage?.({ data } as MessageEvent); },
      close: () => undefined,
    };
    tabs.push(tab);
    return tab;
  };
  return [make(), make(), make()] as const;
}

/** Tabs sharing one storage: a write raises `storage` in every other tab, never in the writer. */
function storagePair() {
  const store = new Map<string, string>();
  const listeners: { id: number; handler: (event: Event) => void }[] = [];
  const make = (id: number): TabSyncDeps => ({
    channel: null,
    storage: {
      setItem: (key, value) => { store.set(key, value); for (const l of listeners) if (l.id !== id) l.handler({ key, newValue: value } as unknown as Event); },
      removeItem: (key) => { store.delete(key); for (const l of listeners) if (l.id !== id) l.handler({ key, newValue: null } as unknown as Event); },
    },
    events: { addEventListener: (_type, handler) => { listeners.push({ id, handler: handler as (event: Event) => void }); }, removeEventListener: () => undefined },
  });
  return { store, a: make(1), b: make(2), c: make(3) };
}

const collect = (sync: ReturnType<typeof createTabSync>) => {
  const got: TabMessage[] = [];
  sync.subscribe((message) => got.push(message));
  return got;
};

describe("BroadcastChannel", () => {
  it("delivers lock and forget to the other tabs and not to the sender", () => {
    const [a, b, c] = channelPair();
    const one = createTabSync({ channel: a, storage: null, events: null });
    const two = createTabSync({ channel: b, storage: null, events: null });
    const three = createTabSync({ channel: c, storage: null, events: null });
    const [fromOne, fromTwo, fromThree] = [collect(one), collect(two), collect(three)];
    one.post({ type: "lock", stop: false });
    two.post({ type: "lock", stop: true });
    three.post({ type: "forget" });
    expect(fromOne).toEqual([{ type: "lock", stop: true }, { type: "forget" }]);
    expect(fromTwo).toEqual([{ type: "lock", stop: false }, { type: "forget" }]);
    expect(fromThree).toEqual([{ type: "lock", stop: false }, { type: "lock", stop: true }]);
  });

  it("an activity message reaches the other tabs and carries nothing", () => {
    const [a, b] = channelPair();
    const one = createTabSync({ channel: a, storage: null, events: null });
    const two = createTabSync({ channel: b, storage: null, events: null });
    const got = collect(two);
    one.post({ type: "activity" });
    expect(got).toEqual([{ type: "activity" }]);
  });

  it("ignores a message it does not understand", () => {
    const [a, b] = channelPair();
    const one = createTabSync({ channel: a, storage: null, events: null });
    const got = collect(one);
    b.postMessage({ id: "x", from: "other", message: { type: "format-disk" } });
    b.postMessage("lock");
    b.postMessage({ id: "y", from: "other", message: { type: "lock" } });
    expect(got).toEqual([]);
  });

  it("an unsubscribed handler hears nothing", () => {
    const [a, b] = channelPair();
    const one = createTabSync({ channel: a, storage: null, events: null });
    const two = createTabSync({ channel: b, storage: null, events: null });
    const handler = vi.fn();
    const stop = one.subscribe(handler);
    stop();
    two.post({ type: "forget" });
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("storage-event fallback", () => {
  it("delivers through a short-lived localStorage write, which is removed again", () => {
    const pair = storagePair();
    const one = createTabSync(pair.a);
    const two = createTabSync(pair.b);
    const three = createTabSync(pair.c);
    const [fromOne, fromTwo, fromThree] = [collect(one), collect(two), collect(three)];
    one.post({ type: "lock", stop: true });
    expect(fromOne).toEqual([]);
    expect(fromTwo).toEqual([{ type: "lock", stop: true }]);
    expect(fromThree).toEqual([{ type: "lock", stop: true }]);
    expect(pair.store.has(SIGNAL_KEY)).toBe(false);
  });

  it("the removal that follows the write is not a second message", () => {
    const pair = storagePair();
    const one = createTabSync(pair.a);
    const two = createTabSync(pair.b);
    const got = collect(two);
    one.post({ type: "forget" });
    one.post({ type: "lock", stop: false });
    expect(got).toEqual([{ type: "forget" }, { type: "lock", stop: false }]);
  });

  it("does not throw when storage refuses the write", () => {
    const sync = createTabSync({ channel: null, storage: { setItem: () => { throw new Error("quota"); }, removeItem: () => undefined }, events: null });
    expect(() => { sync.post({ type: "forget" }); }).not.toThrow();
  });
});

describe("what travels", () => {
  it("is a type and a flag, nothing else", () => {
    const sent: unknown[] = [];
    const sync = createTabSync({ channel: { postMessage: (data) => { sent.push(data); }, close: () => undefined, onmessage: null }, storage: null, events: null });
    sync.post({ type: "lock", stop: true });
    sync.post({ type: "forget" });
    for (const envelope of sent as { id: string; from: string; message: object }[]) {
      expect(Object.keys(envelope).sort()).toEqual(["from", "id", "message"]);
      expect(Object.keys(envelope.message).every((field) => field === "type" || field === "stop")).toBe(true);
    }
    expect(JSON.stringify(sent)).not.toMatch(/key|secret|pass|token|credential/i);
  });
});
