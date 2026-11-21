import { t } from "@/lib/i18n";
import type { Theme } from "@/lib/types";
import { useTheme } from "../theme";

const themes: { value: Theme; labelKey: "app.theme.system" | "app.theme.light" | "app.theme.dark" }[] = [
  { value: "system", labelKey: "app.theme.system" },
  { value: "light", labelKey: "app.theme.light" },
  { value: "dark", labelKey: "app.theme.dark" },
];

/** Settings. Only Appearance exists so far; the other pages arrive in M9. */
export function SettingsScreen() {
  const { theme, setTheme } = useTheme();
  return (
    <section data-component="SettingsScreen">
      <h1 className="text-xl font-semibold">{t("nav.settings")}</h1>
      <h2 className="mt-6 text-lg font-semibold">{t("set.appearanceLabel")}</h2>
      <fieldset className="mt-3">
        <legend className="mb-1 text-base font-medium">{t("app.themeLabel")}</legend>
        <div className="flex flex-col">
          {themes.map(({ value, labelKey }) => (
            <label
              key={value}
              className="flex min-h-(--cf-size-touch-min) cursor-pointer items-center gap-3 rounded-md px-1 hover:bg-hover"
            >
              <input
                type="radio"
                name="theme"
                value={value}
                checked={theme === value}
                onChange={() => {
                  setTheme(value);
                }}
                className="size-5 cursor-pointer accent-accent"
              />
              <span>{t(labelKey)}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </section>
  );
}
