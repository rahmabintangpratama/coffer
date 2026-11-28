import { useEffect, useState } from "react";
import { Banner } from "@/components/Banner";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { StepList } from "@/components/StepList";
import { pendingSteps, stepRows } from "@/features/onboarding";
import { t } from "@/lib/i18n";
import type { ConnectionSummary, ConnectionTestStep } from "@/lib/types";
import type { ConnectionTools } from "./connection-tools-types";

type Outcome = "running" | "pass" | "fail" | "error";

/** Test connection: the six onboarding steps against the saved keys, with a clear result line. */
function TestConnectionDialog({ connection, tools, onClose }: { connection: ConnectionSummary | null; tools: ConnectionTools; onClose: () => void }) {
  const [attempt, setAttempt] = useState(0);
  return (
    <Dialog open={connection !== null} onClose={onClose} title={t("conn.testTitle", { name: connection?.name ?? "" })} closeLabel={t("act.close")}>
      {/* A new run per connection and per Try again, so its state starts fresh. */}
      {connection && <TestRun key={`${connection.id}:${attempt.toString()}`} connection={connection} tools={tools} onRetry={() => { setAttempt((value) => value + 1); }} onClose={onClose} />}
    </Dialog>
  );
}

function TestRun({ connection, tools, onRetry, onClose }: { connection: ConnectionSummary; tools: ConnectionTools; onRetry: () => void; onClose: () => void }) {
  const [steps, setSteps] = useState<ConnectionTestStep[]>(pendingSteps);
  const [outcome, setOutcome] = useState<Outcome>("running");
  useEffect(() => {
    const controller = new AbortController();
    tools
      .test(connection, (step) => { setSteps((current) => current.map((candidate) => (candidate.id === step.id ? step : candidate))); }, controller.signal)
      .then((run) => {
        if (controller.signal.aborted) return;
        setSteps(run.steps);
        setOutcome(run.steps.some((step) => step.status === "fail") ? "fail" : "pass");
      })
      .catch(() => { if (!controller.signal.aborted) setOutcome("error"); });
    return () => { controller.abort(); };
  }, [connection, tools]);
  return (
    <div data-component="ConnectionTestResult" className="flex flex-col gap-4">
      <StepList label={t("ob.stepsLabel")} rows={stepRows(steps, connection.bucket !== undefined)} />
      {outcome === "pass" && <Banner tone="success" title={t("conn.testPassed")}>{t("conn.testPassedBody")}</Banner>}
      {(outcome === "fail" || outcome === "error") && <Banner tone="danger" title={t("conn.testFailed")}>{t("conn.testFailedBody")}</Banner>}
      <div className="flex justify-end gap-2">
        {outcome !== "running" && <Button onClick={onRetry}>{t("act.retry")}</Button>}
        <Button variant="primary" onClick={onClose}>{t("act.done")}</Button>
      </div>
    </div>
  );
}

/** The test dialog as its own lazy chunk: its rows come from onboarding, which the Unlock screen must not load. */
export default TestConnectionDialog;
