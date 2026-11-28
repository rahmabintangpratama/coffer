import { useCallback, useEffect, useRef, useState } from "react";
import { Banner } from "@/components/Banner";
import { Button } from "@/components/Button";
import { t } from "@/lib/i18n";
import { getPreset } from "@/lib/providers";
import { vault } from "@/lib/storage/vault";
import type { ConnectionSummary } from "@/lib/types";
import { type ConnectedResult, ConnectingScreen } from "./ConnectingScreen";
import { CredentialsScreen, type CredentialsSubmit } from "./CredentialsScreen";
import type { EditActions, EditPlan } from "./edit-types";
import { StepFrame } from "./StepFrame";

type Step =
  | { name: "form"; values: Record<string, string>; connectionName: string; bucket: string }
  | { name: "connecting"; submitted: CredentialsSubmit }
  | { name: "review"; next: ConnectionSummary; plan: Exclude<EditPlan, { kind: "same" }>; submitted: CredentialsSubmit }
  | { name: "saving" }
  | { name: "failed"; next: ConnectionSummary; submitted: CredentialsSubmit };

export interface EditConnectionFlowProps {
  connection: ConnectionSummary;
  actions: EditActions;
  onDone: (result: { connection: ConnectionSummary; oldRemoved: boolean }) => void;
  onCancel: () => void;
}

/** The name to keep: a name Coffer made itself follows a new bucket. */
function nameFor(before: ConnectionSummary, typed: string, provider: string, bucket: string): string {
  const generated = before.bucket !== undefined && before.name === t("conn.name", { provider, bucket: before.bucket });
  return generated && typed === before.name ? t("conn.name", { provider, bucket }) : typed;
}

/**
 * Edit a saved connection (FR-11, AC-11.6, OQ-38): the form prefilled from the record, the same six-step test, and
 * only after it passes the save. Until the save succeeds the old record is not touched.
 */
export default function EditConnectionFlow({ connection, actions, onDone, onCancel }: EditConnectionFlowProps) {
  const preset = getPreset(connection.providerId);
  const [step, setStep] = useState<Step>(() => ({ name: "form", values: connection.fields, connectionName: connection.name, bucket: connection.bucket ?? "" }));
  // Keys typed for a test that was not saved are dropped when the flow ends.
  const pendingId = useRef<string | null>(null);
  const discard = useCallback(() => {
    if (pendingId.current !== null) vault.forget(pendingId.current);
    pendingId.current = null;
  }, []);
  useEffect(() => discard, [discard]);

  const toForm = (submitted: CredentialsSubmit) => {
    discard();
    setStep({ name: "form", values: submitted.values, connectionName: submitted.name ?? connection.name, bucket: submitted.bucket });
  };

  const save = (next: ConnectionSummary, submitted: CredentialsSubmit) => {
    setStep({ name: "saving" });
    actions.save(next).then(
      (result) => {
        pendingId.current = null;
        onDone(result);
      },
      () => { setStep({ name: "failed", next, submitted }); },
    );
  };

  const tested = (submitted: CredentialsSubmit, result: ConnectedResult) => {
    const { plan } = result;
    const bucket = plan.bucket ?? submitted.bucket;
    const next: ConnectionSummary = {
      id: submitted.connectionId,
      name: nameFor(connection, submitted.name ?? connection.name, preset.displayName, bucket),
      providerId: connection.providerId,
      fields: submitted.values,
      endpoint: plan.endpoint,
      region: plan.region,
      addressingStyle: plan.addressingStyle,
      bucket,
      ...(plan.prefix === "" ? {} : { prefix: plan.prefix }),
      access: result.access,
      ...(plan.sessionTokenExpiresAt === undefined ? {} : { sessionTokenExpiresAt: plan.sessionTokenExpiresAt }),
      createdAt: connection.createdAt,
    };
    setStep({ name: "saving" });
    actions.plan(next).then(
      (planned) => {
        if (planned.kind === "same") save(next, submitted);
        else setStep({ name: "review", next, plan: planned, submitted });
      },
      () => { setStep({ name: "failed", next, submitted }); },
    );
  };

  switch (step.name) {
    case "form":
      return (
        <CredentialsScreen
          preset={preset}
          initialValues={step.values}
          initialBucket={step.bucket}
          edit={{ connectionId: connection.id, name: step.connectionName }}
          onBack={onCancel}
          onSubmit={(submitted) => {
            pendingId.current = submitted.connectionId;
            setStep({ name: "connecting", submitted });
          }}
        />
      );
    case "connecting":
      return (
        <ConnectingScreen
          preset={preset}
          plan={step.submitted.plan}
          connectionId={step.submitted.connectionId}
          passLabel={t("conn.editSave")}
          onEdit={() => { toForm(step.submitted); }}
          onConnected={(result) => { tested(step.submitted, result); }}
        />
      );
    case "review": {
      const { plan, next, submitted } = step;
      if (plan.kind === "blocked") {
        return (
          <StepFrame key="blocked" title={t("conn.blockedTitle")} onBack={() => { toForm(submitted); }}>
            <Banner tone="warning">{t("conn.editBlocked", { name: connection.name, count: plan.unfinished })}</Banner>
            <Button variant="secondary" onClick={onCancel}>{t("act.cancel")}</Button>
          </StepFrame>
        );
      }
      const lines = [
        plan.transfers > 0 ? t("conn.removeTransfers", { count: plan.transfers }) : null,
        plan.uploads > 0 ? t("conn.removeUploads", { count: plan.uploads }) : null,
        plan.starred > 0 ? t("conn.removeStarred", { count: plan.starred }) : null,
        plan.recent > 0 ? t("conn.removeRecent", { count: plan.recent }) : null,
      ].filter((line): line is string => line !== null);
      return (
        <StepFrame key="replace" title={t("conn.editReplaceTitle")} onBack={() => { toForm(submitted); }}>
          <p>{t("conn.editReplaceBody", { name: connection.name })}</p>
          {lines.length > 0 && (
            <ul className="list-disc pl-5">
              {lines.map((line) => <li key={line}>{line}</li>)}
            </ul>
          )}
          <p className="text-sm text-fg-muted">{t("conn.removeKeep")}</p>
          <div className="flex flex-col-reverse gap-2 @md:flex-row">
            <Button variant="secondary" onClick={onCancel}>{t("act.cancel")}</Button>
            <Button variant="primary" onClick={() => { save(next, submitted); }}>{t("conn.editSave")}</Button>
          </div>
        </StepFrame>
      );
    }
    case "saving":
      return (
        <StepFrame key="saving" title={t("conn.editTitle", { name: connection.name })}>
          <p role="status">{t("conn.editSaving")}</p>
        </StepFrame>
      );
    case "failed":
      return (
        <StepFrame key="failed" title={t("conn.editTitle", { name: connection.name })} onBack={() => { toForm(step.submitted); }}>
          <Banner tone="danger" title={t("conn.editFailed")}>{t("conn.editFailedBody")}</Banner>
          <div className="flex flex-col-reverse gap-2 @md:flex-row">
            <Button variant="secondary" onClick={onCancel}>{t("act.cancel")}</Button>
            <Button variant="primary" onClick={() => { save(step.next, step.submitted); }}>{t("act.retry")}</Button>
          </div>
        </StepFrame>
      );
  }
}
