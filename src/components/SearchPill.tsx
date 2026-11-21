import { Search, X } from "lucide-react";
import { useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";

/** The id the `/` shortcut looks for: the pill lives in the app bar, away from the list that owns the shortcut. */
export const SEARCH_PILL_ID = "coffer-search";

/**
 * Pill search field (design: SearchPill). Esc clears, then blurs. The label is the
 * placeholder, as the design asks; the clear button's name comes in as a prop.
 */
export function SearchPill({ value, onChange, placeholder, clearLabel, className }: { value: string; onChange: (value: string) => void; placeholder: string; clearLabel: string; className?: string }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div data-component="SearchPill" className={cn("relative w-full @md:max-w-180", className)}>
      <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-fg-muted" />
      <input
        ref={input}
        id={SEARCH_PILL_ID}
        type="search"
        value={value}
        aria-label={placeholder}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => { onChange(event.target.value); }}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          if (value === "") input.current?.blur();
          else onChange("");
        }}
        className={cn(
          "h-12 w-full rounded-full border border-line bg-surface pr-11 pl-10 text-md text-fg placeholder:text-fg-muted @md:h-11 @md:text-base",
          "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [&::-webkit-search-cancel-button]:hidden",
        )}
      />
      {value !== "" && (
        <Button
          variant="ghost"
          iconOnly
          aria-label={clearLabel}
          icon={<X aria-hidden="true" className="size-4" />}
          onClick={() => { onChange(""); input.current?.focus(); }}
          className="absolute top-1/2 right-1 -translate-y-1/2"
        />
      )}
    </div>
  );
}
