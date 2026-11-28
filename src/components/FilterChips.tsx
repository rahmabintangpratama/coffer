import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ActionMenu, type MenuAction } from "./ActionMenu";

export interface ChipSpec {
  id: string;
  /** The chip's name, for example "Type". */
  name: string;
  /** The chosen value's label, or null when none is set. */
  valueLabel: string | null;
  options: MenuAction[];
  /** Clears this filter; the × beside an active chip calls it. */
  onClear: () => void;
  /** The ×'s name, for example "Clear Type filter". */
  clearLabel: string;
}

/**
 * Filter chips under the search (design: FilterChips). Each chip is a button with
 * aria-pressed once a value is set; its options open as a menu lined up with the chip's
 * start edge (a sheet below 768 px). An active chip gets an × that clears it.
 */
export function FilterChips({ label, closeLabel, chips, className }: { label: string; closeLabel: string; chips: ChipSpec[]; className?: string }) {
  return (
    <div role="group" aria-label={label} data-component="FilterChips" className={cn("flex gap-2 overflow-x-auto py-1", className)}>
      {chips.map((chip) => (
        <span key={chip.id} className="inline-flex shrink-0 items-center">
          <ActionMenu
            align="start"
            groups={[{ id: chip.id, actions: chip.options }]}
            triggerLabel={chip.name}
            title={chip.name}
            closeLabel={closeLabel}
            component="FilterChips"
            trigger={(props) => (
              <button
                type="button"
                aria-pressed={chip.valueLabel !== null}
                aria-haspopup="menu"
                {...props}
                className={cn(
                  "inline-flex h-(--cf-size-chip-height) shrink-0 items-center rounded-full border px-3 text-sm whitespace-nowrap",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                  chip.valueLabel !== null ? "border-accent-line bg-accent-subtle text-fg" : "border-line bg-surface text-fg hover:bg-hover",
                )}
              >
                {chip.valueLabel === null ? chip.name : `${chip.name}: ${chip.valueLabel}`}
              </button>
            )}
          />
          {chip.valueLabel !== null && (
            <button
              type="button"
              aria-label={chip.clearLabel}
              title={chip.clearLabel}
              onClick={chip.onClear}
              className="-ml-px inline-flex size-(--cf-size-chip-height) items-center justify-center rounded-full border border-accent-line bg-accent-subtle text-fg hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          )}
        </span>
      ))}
    </div>
  );
}
