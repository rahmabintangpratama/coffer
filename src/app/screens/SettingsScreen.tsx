import { SecuritySettings } from "@/features/vault";
import { t } from "@/lib/i18n";
import { vault } from "@/lib/storage/vault";
import type { ConnectionSummary, Theme } from "@/lib/types";
import { useSession } from "../session";
import { useSettings } from "../settings";
import { useTheme } from "../theme";

const themes: { value: Theme; labelKey: "app.theme.system" | "app.theme.light" | "app.theme.dark" }[] = [
  { value: "system", labelKey: "app.theme.system" },
  { value: "light", labelKey: "app.theme.light" },
  { value: "dark", labelKey: "app.theme.dark" },
];

/** Settings. Appearance and Security (with Connections) exist so far; the page layout and the other pages arrive in M9. */
export function SettingsScreen({ connection, notify }: { connection: ConnectionSummary; notify: (message: string) => void }) {
  const { theme, setTheme } = useTheme();
  const autoLockMinutes = useSettings((state) => state.autoLockMinutes);
  const update = useSettings((state) => state.update);
  const saved = useSession((state) => state.saved);
  const session = useSession.getState();
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
      <SecuritySettings
        autoLockMinutes={autoLockMinutes}
        onAutoLock={(minutes) => { update({ autoLockMinutes: minutes }); }}
        active={connection}
        saved={saved}
        onLock={() => { void import("../lock").then((module) => { module.lockNow("manual"); }); }}
        onForget={() => import("../lock").then((module) => module.forgetThisDevice())}
        notify={notify}
        onRemoved={(removed) => {
          session.setSaved(saved.filter((entry) => entry.id !== removed.id));
          // Removing the connection that is open ends the session with it; another saved one opens through Unlock.
          if (removed.id === connection.id) {
            void vault.savedCount().then((count) => {
              session.disconnect();
              if (count > 0) session.lock({ reason: "start" });
              else session.leaveLock();
            });
          }
        }}
      />
    </section>
  );
}
