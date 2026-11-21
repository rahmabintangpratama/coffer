import design from "@design/copy.en.json";
import additions from "./copy.additions.en.json";

interface CopyTree { [key: string]: string | CopyTree }

/** Dotted paths of every string in a copy tree: `"ob.cors.title"`. */
type Leaves<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type CopyKey = Leaves<typeof design> | Leaves<typeof additions>;

function flatten(tree: CopyTree, prefix = ""): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]): [string, string][] =>
    typeof value === "string" ? [[`${prefix}${key}`, value]] : flatten(value, `${prefix}${key}.`),
  );
}

// The additions file is merged over the design copy. `scripts/copy/check.ts`
// limits which design keys it may override.
const messages = new Map<string, string>([
  ...flatten(design),
  ...flatten(additions),
]);

export function messageFor(key: string): string {
  const message = messages.get(key);
  if (message === undefined) throw new Error(`Unknown copy key: ${key}`);
  return message;
}

export function allMessages(): ReadonlyMap<string, string> {
  return messages;
}
