import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { effectiveBucket, getPreset } from "@/lib/providers";
import { vault } from "@/lib/storage/vault";
import type { ConnectionSummary, ProviderPreset } from "@/lib/types";
import { type ConnectedResult, ConnectingScreen } from "./ConnectingScreen";
import { CredentialsScreen, type CredentialsSubmit } from "./CredentialsScreen";
import type { ConnectionPlan } from "./form-model";
import { PickBucketScreen } from "./PickBucketScreen";
import { ProviderScreen } from "./ProviderScreen";
import { WelcomeScreen } from "./WelcomeScreen";

type Step =
  | { name: "welcome" }
  | { name: "provider" }
  | { name: "credentials"; preset: ProviderPreset; values: Record<string, string>; bucket: string }
  | {
      name: "connecting";
      /** Changes when the same keys are tested again for another bucket, so the screen starts fresh. */
      run: number;
      preset: ProviderPreset;
      values: Record<string, string>;
      typedBucket: string;
      plan: ConnectionPlan;
      connectionId: string;
    }
  | {
      name: "pick";
      preset: ProviderPreset;
      values: Record<string, string>;
      typedBucket: string;
      plan: ConnectionPlan;
      connectionId: string;
      buckets: string[] | null;
    };

type KeyedStep = Extract<Step, { connectionId: string }>;

/** The connection as the app keeps it: no keys, only a pointer to them in the vault (T-10). */
function summaryOf(step: KeyedStep, result: ConnectedResult, bucket: string): ConnectionSummary {
  const { plan } = result;
  return {
    id: step.connectionId,
    name: t("conn.name", { provider: step.preset.displayName, bucket }),
    providerId: step.preset.id,
    fields: step.values,
    endpoint: plan.endpoint,
    region: plan.region,
    addressingStyle: plan.addressingStyle,
    bucket,
    ...(plan.prefix === "" ? {} : { prefix: plan.prefix }),
    access: result.access,
    ...(plan.sessionTokenExpiresAt === undefined ? {} : { sessionTokenExpiresAt: plan.sessionTokenExpiresAt }),
    createdAt: new Date().toISOString(),
  };
}

/**
 * Welcome to a tested connection (FR-1 to FR-7). The keys go to the vault the
 * moment the form is submitted; this component and its state hold only the
 * plan and the values that are not keys. Going back to the form therefore
 * shows the secret fields empty (decision D-27).
 */
export function OnboardingFlow({ onConnected }: { onConnected: (connection: ConnectionSummary) => void }) {
  return (
    // .cf-root is the container the layout queries measure; .cf-app stays directly inside it, as in the shell.
    <div className="cf-root min-h-dvh">
      <div className="cf-app flex min-h-dvh flex-col bg-app text-fg">
        <OnboardingSteps onConnected={onConnected} />
      </div>
    </div>
  );
}

function OnboardingSteps({ onConnected }: { onConnected: (connection: ConnectionSummary) => void }) {
  const [step, setStep] = useState<Step>({ name: "welcome" });
  // The vault entry of an attempt that did not finish is dropped when the flow ends.
  const pendingId = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (pendingId.current !== null) vault.forget(pendingId.current);
    },
    [],
  );

  const discard = () => {
    if (pendingId.current !== null) vault.forget(pendingId.current);
    pendingId.current = null;
  };

  const toCredentials = (from: KeyedStep) => {
    discard();
    setStep({ name: "credentials", preset: from.preset, values: from.values, bucket: from.typedBucket });
  };

  const startTest = (submitted: CredentialsSubmit, preset: ProviderPreset) => {
    pendingId.current = submitted.connectionId;
    setStep({
      name: "connecting",
      run: 0,
      preset,
      values: submitted.values,
      typedBucket: submitted.bucket,
      plan: submitted.plan,
      connectionId: submitted.connectionId,
    });
  };

  const retestWithBucket = (from: KeyedStep, plan: ConnectionPlan, bucket: string) => {
    setStep({
      name: "connecting",
      run: (from.name === "connecting" ? from.run : 0) + 1,
      preset: from.preset,
      values: from.values,
      typedBucket: from.typedBucket,
      plan: { ...plan, bucket },
      connectionId: from.connectionId,
    });
  };

  const handleConnected = (from: Extract<Step, { name: "connecting" }>, result: ConnectedResult) => {
    const bucket = result.plan.bucket;
    if (bucket !== undefined) {
      // Done: the keys stay in the vault for the connection that now exists.
      pendingId.current = null;
      onConnected(summaryOf(from, result, bucket));
      return;
    }
    const buckets = result.buckets;
    const only = buckets?.length === 1 ? buckets[0] : undefined;
    if (only !== undefined) {
      // One bucket: nothing to choose (AC-7.2).
      retestWithBucket(from, result.plan, only);
      return;
    }
    setStep({ ...from, name: "pick", plan: result.plan, buckets });
  };

  switch (step.name) {
    case "welcome":
      return <WelcomeScreen onConnect={() => { setStep({ name: "provider" }); }} />;
    case "provider":
      return (
        <ProviderScreen
          onBack={() => { setStep({ name: "welcome" }); }}
          onSelect={(id) => {
            setStep({ name: "credentials", preset: getPreset(id), values: {}, bucket: "" });
          }}
        />
      );
    case "credentials": {
      const { preset } = step;
      return (
        <CredentialsScreen
          key={preset.id}
          preset={preset}
          initialValues={step.values}
          initialBucket={step.bucket}
          onBack={() => { setStep({ name: "provider" }); }}
          onSubmit={(submitted) => {
            startTest(submitted, preset);
          }}
        />
      );
    }
    case "connecting":
      return (
        <ConnectingScreen
          key={`${step.connectionId}-${step.run}`}
          preset={step.preset}
          plan={step.plan}
          connectionId={step.connectionId}
          onEdit={() => { toCredentials(step); }}
          onConnected={(result) => { handleConnected(step, result); }}
        />
      );
    case "pick":
      return (
        <PickBucketScreen
          buckets={step.buckets}
          onBack={() => { toCredentials(step); }}
          onPick={(bucket, typed) => {
            retestWithBucket(step, step.plan, typed ? effectiveBucket(step.preset, step.values, bucket) : bucket);
          }}
        />
      );
  }
}
