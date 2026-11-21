import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

/** A disclosure ("Where do I find these?"), collapsed until opened. Native details and summary. */
export function HelpInline({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details data-component="HelpInline" className="group rounded-md border border-line bg-surface">
      <summary className="flex min-h-(--cf-size-touch-min) cursor-pointer list-none items-center gap-2 rounded-md px-3 text-base font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 transition-transform group-open:rotate-90 motion-reduce:transition-none" />
        {summary}
      </summary>
      <div className="px-3 pb-3 text-base">{children}</div>
    </details>
  );
}
