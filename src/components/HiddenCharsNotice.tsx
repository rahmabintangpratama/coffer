import { Banner } from "@/components/Banner";
import { t } from "@/lib/i18n";
import { hasHiddenChars, revealHiddenChars } from "@/lib/names";

const SHOWN = 5;

/**
 * Names with direction or zero-width characters (S-10), drawn with each character
 * as a visible `⟨U+202E⟩` marker so the order on screen is the order in the key.
 * It renders nothing when no name has such a character. Used where a person
 * decides about a name: Details, Rename and the delete confirmations.
 */
export function HiddenCharsNotice({ names, className, listed = true }: { names: readonly string[]; className?: string; /** False where the screen already draws the revealed text (Details). */ listed?: boolean }) {
  const flagged = names.filter(hasHiddenChars);
  if (flagged.length === 0) return null;
  return (
    <Banner tone="warning" title={t("app.hiddenNames.title", { count: flagged.length })} className={className}>
      <p>{t("app.hiddenNames.body")}</p>
      {listed && (
        <ul data-testid="hidden-names" className="mt-2 font-mono text-sm break-all">
          {flagged.slice(0, SHOWN).map((name, index) => (
            <li key={`${index.toString()}-${name}`}>{revealHiddenChars(name)}</li>
          ))}
        </ul>
      )}
      {listed && flagged.length > SHOWN && <p className="mt-1 text-sm">{t("app.hiddenNames.more", { count: flagged.length - SHOWN })}</p>}
    </Banner>
  );
}
