import { IntlMessageFormat } from "intl-messageformat";
import { type CopyKey, messageFor } from "./messages";

export type { CopyKey } from "./messages";
export type CopyValues = Record<string, string | number | Date>;

const LOCALE = "en";
const compiled = new Map<string, IntlMessageFormat>();

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
  return String(format.format(values));
}
