import { type SyntheticEvent, useEffect, useState } from "react";
import { Banner } from "@/components/Banner";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { Field, TextInput } from "@/components/Field";
import { StepList } from "@/components/StepList";
import { pendingSteps, stepRows } from "@/features/onboarding";
import { t } from "@/lib/i18n";
import type { ConnectionSummary, ConnectionTestStep } from "@/lib/types";
import type { ConnectionTools } from "./connection-tools-types";

type Outcome = "running" | "pass" | "fail" | "error";

/** Test connection: the six onboarding steps against the saved keys, with a clear result line. */
export function TestConnectionDialog({ connection, tools, onClose }: { connection: ConnectionSummary | null; tools: ConnectionTools; onClose: () => void }) {
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

/** Rename: the label only. Endpoint, region and bucket are bound to the sealed keys (D-49, OQ-38). */
export function RenameConnectionDialog({ connection, tools, onRenamed, onClose }: { connection: ConnectionSummary | null; tools: ConnectionTools; onRenamed: (next: ConnectionSummary) => void; onClose: () => void }) {
  const [name, setName] = useState(connection?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shownFor, setShownFor] = useState<string | null>(null);
  if (connection && shownFor !== connection.id) {
    setShownFor(connection.id);
    setName(connection.name);
    setError(null);
  }
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!connection) return;
    const trimmed = name.trim();
    if (trimmed === "") {
      setError(t("conn.nameEmpty"));
      return;
    }
    setBusy(true);
    tools
      .rename(connection, trimmed)
      .then((next) => { onRenamed(next); onClose(); })
      .catch(() => { setError(t("conn.renameFailed")); })
      .finally(() => { setBusy(false); });
  };
  return (
    <Dialog open={connection !== null} onClose={() => { if (!busy) onClose(); }} title={t("conn.renameTitle", { name: connection?.name ?? "" })} closeLabel={t("act.close")}>
      <form onSubmit={submit}>
        <Field label={t("conn.nameLabel")} hint={t("conn.nameHint")} error={error ?? undefined}>
          <TextInput value={name} autoFocus autoComplete="off" spellCheck={false} maxLength={80} onChange={(event) => { setName(event.target.value); setError(null); }} />
        </Field>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>{t("act.cancel")}</Button>
          <Button type="submit" variant="primary" loading={busy}>{t("act.save")}</Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Both dialogs, as one lazy chunk: the test rows come from onboarding, which the Unlock screen must not load. */
export default function ConnectionToolDialogs(props: {
  testing: ConnectionSummary | null;
  renaming: ConnectionSummary | null;
  tools: ConnectionTools;
  onCloseTest: () => void;
  onCloseRename: () => void;
  onRenamed: (next: ConnectionSummary) => void;
}) {
  return (
    <>
      <TestConnectionDialog connection={props.testing} tools={props.tools} onClose={props.onCloseTest} />
      <RenameConnectionDialog connection={props.renaming} tools={props.tools} onClose={props.onCloseRename} onRenamed={props.onRenamed} />
    </>
  );
}
