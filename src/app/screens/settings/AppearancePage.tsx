import { t } from "@/lib/i18n";
import type { Density, Theme } from "@/lib/types";
import { useSettings } from "../../settings";
import { useTheme } from "../../theme";

const themes: { value: Theme; labelKey: "app.theme.system" | "app.theme.light" | "app.theme.dark" }[] = [
  { value: "system", labelKey: "app.theme.system" },
  { value: "light", labelKey: "app.theme.light" },
  { value: "dark", labelKey: "app.theme.dark" },
];
const densities: { value: Density; labelKey: "app.density.comfortable" | "app.density.compact" }[] = [
  { value: "comfortable", labelKey: "app.density.comfortable" },
  { value: "compact", labelKey: "app.density.compact" },
];

const rowClass = "flex min-h-(--cf-size-touch-min) cursor-pointer items-center gap-3 rounded-md px-1 hover:bg-hover";

/** Appearance (AC-100.1, AC-100.2): the theme, which follows the system while it is System, and the row density. */
export function AppearancePage() {
  const { theme, setTheme } = useTheme();
  const density = useSettings((state) => state.density);
  const update = useSettings((state) => state.update);
  return (
    <section data-component="AppearanceSettings" aria-labelledby="appearance-title" className="flex flex-col gap-6">
      <h2 id="appearance-title" className="text-lg font-semibold">{t("set.appearanceLabel")}</h2>
      <fieldset>
        <legend className="mb-1 text-base font-medium">{t("app.themeLabel")}</legend>
        <div className="flex flex-col">
          {themes.map(({ value, labelKey }) => (
            <label key={value} className={rowClass}>
              <input type="radio" name="theme" value={value} checked={theme === value} onChange={() => { setTheme(value); }} className="size-5 cursor-pointer accent-accent" />
              <span>{t(labelKey)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1 text-base font-medium">{t("app.densityLabel")}</legend>
        <div className="flex flex-col">
          {densities.map(({ value, labelKey }) => (
            <label key={value} className={rowClass}>
              <input type="radio" name="density" value={value} checked={density === value} onChange={() => { update({ density: value }); }} className="size-5 cursor-pointer accent-accent" />
              <span>{t(labelKey)}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </section>
  );
}
