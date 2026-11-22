import { Eye } from "lucide-react";

/**
 * The "Read-only" chip in the app bar of a read-only connection (ReadOnlyBadge). Icon and words, never colour alone; the
 * title carries the reason.
 */
export function ReadOnlyBadge({ label, title }: { label: string; title: string }) {
  return (
    <span
      data-component="ReadOnlyBadge"
      title={title}
      className="inline-flex h-(--cf-size-chip-height) shrink-0 items-center gap-1 rounded-full border border-info-line bg-info-subtle px-2 text-sm font-medium text-info-fg"
    >
      <Eye aria-hidden="true" className="size-4 shrink-0" />
      {label}
    </span>
  );
}
