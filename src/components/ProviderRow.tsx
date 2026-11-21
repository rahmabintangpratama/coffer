import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ProviderRowProps {
  /** Two-letter mark from the preset. A mark, not a logo. */
  glyph: string;
  name: string;
  /** A warning or note such as "Virtual-hosted only". Part of the accessible name. */
  badge?: string | undefined;
  /** Popular providers get a taller row. */
  large?: boolean;
  onSelect: () => void;
}

/** One provider in the list. A button; its name and badge together name it. */
export function ProviderRow({ glyph, name, badge, large = false, onSelect }: ProviderRowProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      data-component="ProviderRow"
      className={cn(
        "state-layer flex w-full cursor-pointer items-center gap-3 rounded-md border border-line bg-surface px-3 text-left",
        large ? "min-h-16" : "min-h-14",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-accent-subtle font-semibold text-accent-fg"
      >
        {glyph}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-medium">{name}</span>
        {badge ? <span className="block truncate text-sm text-warning-fg">{badge}</span> : null}
      </span>
      <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-fg-muted" />
    </button>
  );
}
