import type design from "@design/copy.en.json";
import coreTree from "virtual:copy/core";
import loaders from "virtual:copy/loaders";
import type additions from "./copy.additions.en.json";
import type { CoreGroup } from "./groups";

interface CopyTree { [key: string]: string | CopyTree }

/** Dotted paths of every string in a copy tree: `"ob.cors.title"`. */
type Leaves<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** Every key in the design copy and the additions file. */
export type CopyKey = Leaves<typeof design> | Leaves<typeof additions>;
/** Groups that are not in the first bundle; load them with loadCopyGroups before rendering their screens. */
export type LazyCopyGroup = Exclude<Extract<keyof typeof design | keyof typeof additions, string>, CoreGroup>;

function flatten(tree: CopyTree, prefix = ""): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]): [string, string][] =>
    typeof value === "string" ? [[`${prefix}${key}`, value]] : flatten(value, `${prefix}${key}.`),
  );
}

const messages = new Map<string, string>();
const loaded = new Set<string>(Object.keys(coreTree));
const inflight = new Map<string, Promise<void>>();

for (const [key, value] of flatten(coreTree as CopyTree)) messages.set(key, value);

function register(group: string, tree: Record<string, unknown>): void {
  for (const [key, value] of flatten({ [group]: tree } as CopyTree)) messages.set(key, value);
  loaded.add(group);
}

/** Names of the groups that load on demand. */
export function lazyCopyGroups(): LazyCopyGroup[] {
  return Object.keys(loaders) as LazyCopyGroup[];
}

export function isCopyGroupLoaded(group: string): boolean {
  return loaded.has(group);
}

/** Load feature groups (each is its own chunk). Safe to call again; concurrent calls share one request. */
export async function loadCopyGroups(...groups: LazyCopyGroup[]): Promise<void> {
  await Promise.all(
    groups.map((group) => {
      if (loaded.has(group)) return Promise.resolve();
      let pending = inflight.get(group);
      if (!pending) {
        const load = loaders[group];
        if (!load) return Promise.reject(new Error(`Unknown copy group: ${group}`));
        pending = load().then((module) => {
          register(group, module.default);
          inflight.delete(group);
        });
        inflight.set(group, pending);
      }
      return pending;
    }),
  );
}

export function messageFor(key: string): string {
  const message = messages.get(key);
  if (message !== undefined) return message;
  const group = key.split(".")[0] ?? "";
  if (group in loaders && !loaded.has(group)) {
    throw new Error(`Copy group "${group}" is not loaded (key ${key}). Call loadCopyGroups("${group}") before rendering it.`);
  }
  throw new Error(`Unknown copy key: ${key}`);
}

/** Every message loaded so far. */
export function allMessages(): ReadonlyMap<string, string> {
  return messages;
}
