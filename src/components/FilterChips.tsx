import { cn } from "@/lib/utils";
import { ActionMenu, type MenuAction } from "./ActionMenu";

export interface ChipSpec {
  id: string;
  /** The chip's name, for example "Type". */
  name: string;
  /** The chosen value's label, or null when none is set. */
  valueLabel: string | null;
  options: MenuAction[];
}

/**
 * Filter chips under the search (design: FilterChips). Each chip is a button with
 * aria-pressed once a value is set; its options open as a menu, a sheet below 768 px.
 */
export function FilterChips({ label, closeLabel, chips, className }: { label: string; closeLabel: string; chips: ChipSpec[]; className?: string }) {
  return (
    <div role="group" aria-label={label} data-component="FilterChips" className={cn("flex gap-2 overflow-x-auto py-1", className)}>
      {chips.map((chip) => (
        <ActionMenu
          key={chip.id}
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
      ))}
    </div>
  );
}
