import type { StepRow } from "@/components/StepList";
import { t } from "@/lib/i18n";
import type { ConnectionTestStep, TestStepId } from "@/lib/types";

export const STEP_IDS: readonly TestStepId[] = ["reach", "cors", "list", "write", "read", "clean"];
/** Without a bucket only these run, and the list step lists buckets. */
const BUCKETLESS_STEPS: readonly TestStepId[] = ["reach", "cors", "list"];

function label(id: TestStepId): string {
  switch (id) {
    case "reach":
      return t("ob.step.reach");
    case "cors":
      return t("ob.step.cors");
    case "list":
      return t("ob.step.list");
    case "write":
      return t("ob.step.write");
    case "read":
      return t("ob.step.read");
    case "clean":
      return t("ob.step.clean");
  }
}

function statusLabel(status: ConnectionTestStep["status"]): string {
  switch (status) {
    case "pending":
      return t("ob.status.pending");
    case "running":
      return t("ob.status.running");
    case "pass":
      return t("ob.status.pass");
    case "fail":
      return t("ob.status.fail");
    case "skipped":
      return t("ob.status.skipped");
  }
}

function note(step: ConnectionTestStep, bucketCount: number | undefined): string | undefined {
  if (step.status === "pass") {
    if (step.id === "list" && bucketCount !== undefined) return t("ob.note.buckets", { count: bucketCount });
    return step.ms === undefined ? t("ob.note.ok") : t("ob.note.latency", { ms: step.ms });
  }
  if (step.status !== "fail") return undefined;
  switch (step.failure) {
    case "cors":
      return t("ob.note.blocked");
    case "accessDenied":
      return t("ob.note.denied");
    case "noSuchBucket":
      return t("ob.note.notFound");
    case "signatureDoesNotMatch":
      return t("ob.note.rejected");
    default:
      return undefined;
  }
}

/** The rows for the progress list, each with a word for its status, never color alone. */
export function stepRows(steps: readonly ConnectionTestStep[], withBucket: boolean, bucketCount?: number): StepRow[] {
  return steps
    .filter((step) => withBucket || BUCKETLESS_STEPS.includes(step.id))
    .map((step) => ({
      id: step.id,
      label: label(step.id),
      status: step.status,
      statusLabel: statusLabel(step.status),
      note: note(step, bucketCount),
    }));
}

export function pendingSteps(): ConnectionTestStep[] {
  return STEP_IDS.map((id) => ({ id, status: "pending" }));
}
