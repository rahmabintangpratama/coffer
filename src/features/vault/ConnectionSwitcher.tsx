import { Check, Database, Lock, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { t } from "@/lib/i18n";
import { vault } from "@/lib/storage/vault";
import { cn } from "@/lib/utils";
import type { ConnectionSummary } from "@/lib/types";

export interface ConnectionSwitcherProps {
  active: ConnectionSummary;
  onSwitch: (connection: ConnectionSummary) => void;
  onAdd: () => void;
  /** Absent while nothing is saved: there is no passphrase to lock with. */
  onLock?: () => void;
  /** "icon" for the rail, "block" for the sidebar and the drawer. */
  variant: "icon" | "block";
  className?: string;
}

const stateLabel = (connection: ConnectionSummary): string => (vault.has(connection.id) ? t("conn.state.unlocked") : t("conn.state.locked"));
const providerOf = (connection: ConnectionSummary): string => connection.name.split(" · ")[0] ?? connection.name;

/**
 * The connection switcher (FR-11, S37). Its button names the active connection and its lock state; the dialog lists the
 * connections with their state, and offers Add connection and, when something is saved, Lock. Choosing a connection
 * whose keys are not open sends the person to Unlock.
 */
export function ConnectionSwitcher({ active, onSwitch, onAdd, onLock, variant, className }: ConnectionSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<readonly ConnectionSummary[]>([]);
  const trigger = useRef<HTMLButtonElement>(null);
  // The list is read when the dialog opens, so it is right after a save, a removal or a lock in another tab.
  useEffect(() => {
    if (!open) return;
    let current = true;
    void vault.saved().then((found) => { if (current) setSaved(found); }, () => undefined);
    return () => { current = false; };
  }, [open]);
  const connections = saved.some((connection) => connection.id === active.id) ? saved : [active, ...saved];
  const label = `${t("conn.switchLabel")}: ${active.name}, ${stateLabel(active)}`;
  const close = () => { setOpen(false); };

  return (
    <>
      {variant === "icon" ? (
        <Button ref={trigger} variant="ghost" iconOnly aria-label={label} aria-haspopup="dialog" icon={<Database aria-hidden="true" className="size-5" />} onClick={() => { setOpen(true); }} className={className} />
      ) : (
        <Button ref={trigger} variant="ghost" aria-label={label} aria-haspopup="dialog" icon={<Database aria-hidden="true" className="size-5 shrink-0" />} onClick={() => { setOpen(true); }} className={cn("min-w-0 justify-start", className)}>
          <span className="min-w-0 truncate">{active.name}</span>
        </Button>
      )}
      <Dialog open={open} onClose={close} title={t("conn.switcherTitle")} closeLabel={t("act.close")} returnFocusRef={trigger}>
        <ul aria-label={t("conn.listLabel")} className="flex flex-col gap-1">
          {connections.map((connection) => {
            const current = connection.id === active.id;
            return (
              <li key={connection.id}>
                <button
                  type="button"
                  aria-current={current || undefined}
                  onClick={() => { close(); if (!current) onSwitch(connection); }}
                  className="flex min-h-(--cf-size-touch-min) w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-base">{connection.name}</span>
                    <span className="truncate text-sm text-fg-muted">{vault.has(connection.id) && !saved.some((entry) => entry.id === connection.id) ? t("conn.notSaved") : t("conn.meta", { provider: providerOf(connection), state: stateLabel(connection) })}</span>
                  </span>
                  {current ? <Check aria-hidden="true" className="size-5 text-accent" /> : null}
                  {current ? <span className="sr-only">{t("conn.active")}</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
          <Button variant="secondary" icon={<Plus aria-hidden="true" className="size-5" />} onClick={() => { close(); onAdd(); }}>{t("act.addConn")}</Button>
          {onLock && <Button variant="secondary" icon={<Lock aria-hidden="true" className="size-5" />} onClick={() => { close(); onLock(); }}>{t("act.lock")}</Button>}
        </div>
      </Dialog>
    </>
  );
}
