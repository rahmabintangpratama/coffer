import { useCallback, useState } from "react";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { HiddenCharsNotice } from "@/components/HiddenCharsNotice";
import { t } from "@/lib/i18n";
import type { ConnectionSummary } from "@/lib/types";
import { type RunHooks, startTrash } from "./run";
import type { ItemRef } from "./targets";

interface Options {
  connection: ConnectionSummary;
  root: string;
  hooks: RunHooks;
  /** The `confirmTrash` setting: ask first (AC-36.2). Off by default; Undo is always offered. */
  confirm: boolean;
}

/** Move to trash (FR-36): no question by default, a confirmation when `confirmTrash` is on. */
export function useTrashAction({ connection, root, hooks, confirm }: Options) {
  const [asking, setAsking] = useState<ItemRef[] | null>(null);
  const run = useCallback((items: readonly ItemRef[]) => { startTrash({ connection, root, keys: items.map((item) => item.key) }, hooks); }, [connection, root, hooks]);
  const trash = useCallback(
    (items: ItemRef[]) => {
      if (items.length === 0) return;
      if (confirm) setAsking(items);
      else run(items);
    },
    [confirm, run],
  );
  const close = () => { setAsking(null); };
  const dialog = (
    <Dialog open={asking !== null} onClose={close} title={t("dlg.trash.title")} closeLabel={t("act.close")}>
      <p className="text-base">{t("dlg.trash.body", { count: asking?.length ?? 0, name: asking?.[0]?.name ?? "" })}</p>
      <HiddenCharsNotice names={asking?.map((item) => item.name) ?? []} className="mt-3" />
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={close}>{t("act.cancel")}</Button>
        <Button
          variant="primary"
          onClick={() => {
            if (asking) run(asking);
            close();
          }}
        >
          {t("act.trash")}
        </Button>
      </div>
    </Dialog>
  );
  return { trash, dialog };
}
