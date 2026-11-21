import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";

export interface SelectionAction {
  id: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  onSelect: () => void;
}

/**
 * The toolbar that replaces the app bar while items are selected (design:
 * SelectionBar): ✕, a live count and the actions. role=toolbar; the count is a
 * live region.
 */
export function SelectionBar({ count, countLabel, toolbarLabel, clearLabel, onClear, actions, className }: { count: number; countLabel: string; toolbarLabel: string; clearLabel: string; onClear: () => void; actions: SelectionAction[]; className?: string }) {
  return (
    <div role="toolbar" aria-label={toolbarLabel} data-component="SelectionBar" data-count={count} className={cn("flex w-full items-center gap-2 rounded-full border border-line bg-elevated px-2 py-1 shadow-overlay", className)}>
      <Button variant="ghost" iconOnly aria-label={clearLabel} icon={<X aria-hidden="true" className="size-5" />} onClick={onClear} />
      <p role="status" className="flex-1 font-semibold">{countLabel}</p>
      {actions.map((action) => (
        <Button key={action.id} variant="ghost" icon={action.icon} disabled={action.disabled ?? false} onClick={action.onSelect}>
          {action.label}
        </Button>
      ))}
    </div>
  );
}
