/**
 * Hidden characters in object names (S-10). A name is bucket data and may carry
 * direction controls that reorder what is drawn (`invoice<RLO>fdp.exe` looks
 * like `invoiceexe.pdf`) or zero-width characters that make two names look the
 * same. Plain lists only isolate the name; the places where someone decides
 * about a name (Details, Rename, delete) draw each character as a marker.
 */

/** U+202A-202E, U+2066-2069, U+200E, U+200F, U+061C and the zero-width U+200B-200D and U+FEFF. */
const HIDDEN = /[\u202A-\u202E\u2066-\u2069\u200E\u200F\u061C\u200B-\u200D\uFEFF]/gu;
const HIDDEN_ONE = /[\u202A-\u202E\u2066-\u2069\u200E\u200F\u061C\u200B-\u200D\uFEFF]/u;

const FSI = "\u2068";
const PDI = "\u2069";
const PDF = "\u202C";
const EMBEDDINGS = new Set(["\u202A", "\u202B", "\u202D", "\u202E"]);
const ISOLATES = new Set(["\u2066", "\u2067", FSI]);

export const hasHiddenChars = (text: string): boolean => HIDDEN_ONE.test(text);

/** The text with every hidden character removed. */
export const stripHiddenChars = (text: string): string => text.replace(HIDDEN, "");

const marker = (char: string): string => `⟨U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}⟩`;

/** The text with each hidden character replaced by a visible `⟨U+202E⟩`, so what is drawn is the logical order. */
export const revealHiddenChars = (text: string): string => text.replace(HIDDEN, marker);

/** The distinct hidden characters in a text, as `U+202E`, in order of first use. */
export function hiddenCodePoints(text: string): string[] {
  return [...new Set(text.match(HIDDEN) ?? [])].map((char) => marker(char).slice(1, -1));
}

/**
 * Wrap a text in a first-strong isolate (U+2068 ... U+2069) so its direction
 * controls cannot reach the text around it. Controls the text leaves open are
 * closed, and a stray closer is dropped, so the isolate ends where we put it.
 * A text without hidden characters is returned as is.
 */
export function isolate(text: string): string {
  if (!hasHiddenChars(text)) return text;
  const open: string[] = [];
  let body = "";
  for (const char of text) {
    if (EMBEDDINGS.has(char)) open.push(PDF);
    else if (ISOLATES.has(char)) open.push(PDI);
    else if (char === PDF) {
      if (open.at(-1) !== PDF) continue;
      open.pop();
    } else if (char === PDI) {
      // A PDI with no isolate to close is ignored by the bidi algorithm; drop it so it cannot end ours.
      if (!open.includes(PDI)) continue;
      // It also closes the embeddings opened inside that isolate.
      while (open.at(-1) === PDF) {
        open.pop();
        body += PDF;
      }
      open.pop();
    }
    body += char;
  }
  return `${FSI}${body}${open.reverse().join("")}${PDI}`;
}
