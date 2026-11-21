import { Check, LoaderCircle, Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type StepStatus = "pending" | "running" | "pass" | "fail" | "skipped";

export interface StepRow {
  id: string;
  label: string;
  status: StepStatus;
  /** Text for the status, in words: "Passed", "Failed". Never only an icon or a color. */
  statusLabel: string;
  /** Extra detail such as "48 ms" or "Blocked". */
  note?: string | undefined;
}

const icons: Record<StepStatus, typeof Check | null> = {
  pending: null,
  running: LoaderCircle,
  pass: Check,
  fail: X,
  skipped: Minus,
};

/**
 * The progress list for the connection test. The list is a polite live region
 * and every row says its status in text.
 */
export function StepList({ label, rows }: { label: string; rows: readonly StepRow[] }) {
  return (
    <ol aria-label={label} aria-live="polite" data-component="ConnectionTest" className="flex flex-col divide-y divide-line rounded-md border border-line">
      {rows.map((row) => {
        const Icon = icons[row.status];
        return (
          <li key={row.id} data-step={row.id} data-status={row.status} className="flex items-center gap-3 px-3 py-3">
            <span
              aria-hidden="true"
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border",
                row.status === "pass" && "border-success-line bg-success-subtle text-success-fg",
                row.status === "fail" && "border-danger-line bg-danger-subtle text-danger-fg",
                row.status === "running" && "border-info-line text-info-fg",
                (row.status === "pending" || row.status === "skipped") && "border-line text-fg-muted",
              )}
            >
              {Icon ? <Icon className={cn("size-4", row.status === "running" && "animate-spin motion-reduce:animate-none")} /> : null}
            </span>
            <span className="min-w-0 flex-1 text-base">{row.label}</span>
            <span className="text-sm text-fg-muted">
              {row.statusLabel}
              {row.note ? ` · ${row.note}` : ""}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
