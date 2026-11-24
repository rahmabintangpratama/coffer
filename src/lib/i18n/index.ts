import { IntlMessageFormat } from "intl-messageformat";
import { isolate } from "@/lib/names";
import { type CopyKey, messageFor } from "./messages";

export { isCopyGroupLoaded, lazyCopyGroups, loadCopyGroups } from "./messages";
export type { CopyKey, LazyCopyGroup } from "./messages";
export type CopyValues = Record<string, string | number | Date>;

const LOCALE = "en";
const compiled = new Map<string, IntlMessageFormat>();

/** Text values (file names, folder names) are isolated, so direction controls in them cannot reorder the sentence (S-10). */
function isolateValues(values: CopyValues): CopyValues {
  const out: CopyValues = {};
  for (const [name, value] of Object.entries(values)) out[name] = typeof value === "string" ? isolate(value) : value;
  return out;
}

/**
 * Translate a copy key, filling ICU placeholders and plurals. Pass the key as a
 * string literal so `pnpm copy:check` can find it. Messages are compiled once.
 */
export function t(key: CopyKey, values?: CopyValues): string {
  let format = compiled.get(key);
  if (!format) {
    format = new IntlMessageFormat(messageFor(key), LOCALE);
    compiled.set(key, format);
  }
  return String(format.format(values && isolateValues(values)));
}
