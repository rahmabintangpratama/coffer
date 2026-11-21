import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/Button";
import { Field, TextInput } from "@/components/Field";
import { ProviderRow } from "@/components/ProviderRow";
import { t } from "@/lib/i18n";
import { providersFile } from "@/lib/providers";
import type { ProviderPreset } from "@/lib/types";
import { StepFrame } from "./StepFrame";

const GENERIC_ID = "custom";

/** Presets in the order the screen shows them (AC-2.1): popular by popularOrder, then everything A to Z, the generic one last. */
export function arrangeProviders(presets: readonly ProviderPreset[]) {
  const named = presets.filter((preset) => preset.id !== GENERIC_ID);
  const popular = named.filter((preset) => preset.popular).sort((a, b) => (a.popularOrder ?? 0) - (b.popularOrder ?? 0));
  const all = [...named].sort((a, b) => a.displayName.localeCompare(b.displayName));
  const generic = presets.find((preset) => preset.id === GENERIC_ID);
  return { popular, all, generic };
}

/** Case-insensitive match on the name; the generic option also answers to its own label. */
export function matchesProvider(preset: ProviderPreset, query: string, genericLabel: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  const name = preset.id === GENERIC_ID ? genericLabel : preset.displayName;
  return name.toLowerCase().includes(needle);
}

/** O20 and O21: pick a provider, with search. */
export function ProviderScreen({ onBack, onSelect }: { onBack: () => void; onSelect: (presetId: string) => void }) {
  const [query, setQuery] = useState("");
  const { popular, all, generic } = useMemo(() => arrangeProviders(providersFile.providers), []);
  const genericLabel = t("ob.provider.other");
  const searching = query.trim() !== "";

  const row = (preset: ProviderPreset, large: boolean) => (
    <li key={`${large ? "popular" : "all"}-${preset.id}`}>
      <ProviderRow
        glyph={preset.glyph}
        name={preset.id === GENERIC_ID ? genericLabel : preset.displayName}
        badge={preset.badges?.[0]?.label}
        large={large}
        onSelect={() => {
          onSelect(preset.id);
        }}
      />
    </li>
  );

  const matches = searching ? [...all, ...(generic ? [generic] : [])].filter((preset) => matchesProvider(preset, query, genericLabel)) : [];

  return (
    <StepFrame title={t("ob.provider.title")} onBack={onBack}>
      <Field label={t("ob.provider.search")}>
        <TextInput
          type="search"
          value={query}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
      </Field>

      {searching ? (
        matches.length > 0 ? (
          <ul aria-label={t("ob.provider.listLabel")} className="flex flex-col gap-2">
            {matches.map((preset) => row(preset, false))}
          </ul>
        ) : (
          <div role="status" className="flex flex-col items-start gap-3 rounded-md border border-line p-4" data-state="no-results">
            <Search aria-hidden="true" className="size-6 text-fg-muted" />
            <h2 className="text-lg font-semibold">{t("ob.provider.none.title", { q: query.trim() })}</h2>
            <p className="text-base text-fg-muted">{t("ob.provider.none.body")}</p>
            {generic ? (
              <Button
                variant="primary"
                onClick={() => {
                  onSelect(generic.id);
                }}
              >
                {genericLabel}
              </Button>
            ) : null}
          </div>
        )
      ) : (
        <>
          <section aria-labelledby="providers-popular" className="flex flex-col gap-2">
            <h2 id="providers-popular" className="text-base font-semibold text-fg-muted">
              {t("ob.provider.popular")}
            </h2>
            <ul className="flex flex-col gap-2">{popular.map((preset) => row(preset, true))}</ul>
          </section>
          <section aria-labelledby="providers-all" className="flex flex-col gap-2">
            <h2 id="providers-all" className="text-base font-semibold text-fg-muted">
              {t("ob.provider.all")}
            </h2>
            <ul className="flex flex-col gap-2">
              {all.map((preset) => row(preset, false))}
              {generic ? row(generic, false) : null}
            </ul>
          </section>
        </>
      )}
    </StepFrame>
  );
}
