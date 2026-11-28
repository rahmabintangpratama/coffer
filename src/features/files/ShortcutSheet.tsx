import { Dialog } from "@/components/Dialog";
import { t } from "@/lib/i18n";
import { SHORTCUT_GROUPS } from "./shortcuts";

/** The `?` sheet (FR-26, AC-26.3, `S34_Shortcuts`): every shortcut, in groups. */
export function ShortcutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title={t("kb.title")} closeLabel={t("act.close")}>
      <div data-component="ShortcutSheet" className="flex flex-col gap-4">
        <p className="text-sm text-fg-muted">{t("kb.note")}</p>
        {SHORTCUT_GROUPS.map((group) => (
          <section key={group.title} aria-label={t(group.title)}>
            <h3 className="text-sm font-semibold text-fg-muted">{t(group.title)}</h3>
            <dl className="mt-1 flex flex-col">
              {group.rows.map((row) => (
                <div key={row.label} className="flex min-h-10 items-center justify-between gap-4 border-b border-line py-1 last:border-b-0">
                  <dt>{t(row.label)}</dt>
                  <dd className="flex shrink-0 flex-wrap justify-end gap-1">
                    {row.keys.map((key) => (
                      <kbd key={key} className="rounded-sm border border-line-strong bg-subtle px-1.5 py-0.5 font-sans text-sm">{key}</kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
