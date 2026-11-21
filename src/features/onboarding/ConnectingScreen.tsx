import { useEffect, useState } from "react";
import { Banner } from "@/components/Banner";
import { Button } from "@/components/Button";
import { StepList } from "@/components/StepList";
import { t } from "@/lib/i18n";
import type { ConnectionTestRun } from "@/lib/s3";
import { localNetworkPermission, needsLocalNetworkPermission } from "@/lib/s3/local-network";
import { vault } from "@/lib/storage/vault";
import type { ConnectionTestStep, ProviderPreset } from "@/lib/types";
import { CorsHelp } from "./CorsHelp";
import { FailureCard } from "./FailureCard";
import type { ConnectionPlan } from "./form-model";
import { ReadOnlyOffer } from "./ReadOnlyOffer";
import { StepFrame } from "./StepFrame";
import { pendingSteps, stepRows } from "./test-rows";

export interface ConnectedResult {
  /** The plan that passed, with the region the test ended on. */
  plan: ConnectionPlan;
  access: "readWrite" | "readOnly";
  /** The buckets the key can list, or null when it cannot list them. */
  buckets: string[] | null;
}

interface ConnectingScreenProps {
  preset: ProviderPreset;
  plan: ConnectionPlan;
  connectionId: string;
  /** Back to the form. */
  onEdit: () => void;
  onConnected: (result: ConnectedResult) => void;
  /** For tests: the page origin shown in the CORS help. Default: window.location.origin. */
  origin?: string;
  /** For tests: the host of the page, which decides whether the browser will ask about local network access. */
  pageHost?: string;
}

type Phase =
  | { kind: "running" }
  | { kind: "gate"; permission: "prompt" | "denied" }
  | { kind: "done"; run: ConnectionTestRun }
  | { kind: "error" };

/** O40 to O44: runs the six checks and shows what to do with the outcome (FR-5, FR-6, FR-110). */
export function ConnectingScreen({ preset, plan, connectionId, onEdit, onConnected, origin, pageHost = window.location.hostname }: ConnectingScreenProps) {
  const [region, setRegion] = useState(plan.region);
  const [attempt, setAttempt] = useState(0);
  // The person confirmed the local network pre-prompt, so the next request may trigger the browser's own.
  const [allowed, setAllowed] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "running" });
  const [steps, setSteps] = useState<ConnectionTestStep[]>(pendingSteps);

  const { endpoint, forcePathStyle, bucket, prefix } = plan;

  useEffect(() => {
    const controller = new AbortController();
    // A function, so the compiler does not assume the answer stays the same across awaits.
    const stale = () => controller.signal.aborted;
    void (async () => {
      try {
        // A loopback or private address may need the browser's permission. Ask it first, and never before the person pressed Connect.
        if (!allowed && needsLocalNetworkPermission(pageHost, new URL(endpoint).hostname)) {
          const permission = await localNetworkPermission(endpoint);
          if (stale()) return;
          if (permission === "prompt" || permission === "denied") {
            setPhase({ kind: "gate", permission });
            return;
          }
        }
        const { createClient, runConnectionTest } = await import("@/lib/s3");
        if (stale()) return;
        const client = createClient({
          endpoint,
          region,
          forcePathStyle,
          credentials: () => vault.credentialsFor(connectionId),
          maxAttempts: 1,
        });
        const run = await runConnectionTest({
          client,
          endpoint,
          ...(bucket === undefined ? {} : { bucket }),
          prefix,
          signal: controller.signal,
          onStep: (step) => {
            if (!stale()) setSteps((current) => current.map((candidate) => (candidate.id === step.id ? step : candidate)));
          },
        });
        if (stale()) return;
        setSteps(run.steps);
        setPhase({ kind: "done", run });
      } catch {
        if (!stale()) setPhase({ kind: "error" });
      }
    })();
    return () => {
      controller.abort();
    };
  }, [attempt, allowed, pageHost, endpoint, forcePathStyle, bucket, prefix, region, connectionId]);

  const rerun = (nextRegion?: string) => {
    if (nextRegion !== undefined) setRegion(nextRegion);
    setAllowed(false);
    setSteps(pendingSteps());
    setPhase({ kind: "running" });
    setAttempt((value) => value + 1);
  };
  const finish = (access: ConnectedResult["access"], buckets: string[] | null) => {
    onConnected({ plan: { ...plan, region }, access, buckets });
  };

  const display = bucket === undefined ? preset.displayName : t("conn.name", { provider: preset.displayName, bucket });
  const testTitle = t("ob.testTitle", { name: display });
  const rows = stepRows(steps, bucket !== undefined, phase.kind === "done" ? phase.run.buckets?.length : undefined);
  const list = <StepList label={t("ob.stepsLabel")} rows={rows} />;
  const bucketLabel = bucket ?? t("ob.pick.listLabel").toLowerCase();

  if (phase.kind === "gate") {
    return (
      <StepFrame key="gate" title={testTitle} onBack={onEdit}>
        {phase.permission === "prompt" ? (
          <div className="flex flex-col gap-4">
            <Banner tone="info" title={t("ob.localNetwork.title")}>
              {t("ob.localNetwork.body", { endpoint })}
            </Banner>
            <div>
              <Button
                variant="primary"
                onClick={() => {
                  setAllowed(true);
                  setPhase({ kind: "running" });
                }}
              >
                {t("ob.localNetwork.cta")}
              </Button>
            </div>
          </div>
        ) : (
          <FailureCard
            title={t("ob.fail.localNetwork.title")}
            why={t("ob.fail.localNetwork.why", { endpoint })}
            next={t("ob.fail.localNetwork.next")}
            primary={{ label: t("ob.fail.localNetwork.cta"), onClick: () => { rerun(); } }}
            secondary={{ label: t("ob.fail.net.cta"), onClick: onEdit }}
          />
        )}
      </StepFrame>
    );
  }

  if (phase.kind === "error") {
    return (
      <StepFrame key="error" title={testTitle} onBack={onEdit}>
        {list}
        <FailureCard
          title={t("ob.fail.unknown.title")}
          why={t("ob.fail.unknown.why")}
          next={t("ob.fail.unknown.next")}
          primary={{ label: t("ob.fail.unknown.cta"), onClick: () => { rerun(); } }}
          secondary={{ label: t("ob.fail.missing.cta"), onClick: onEdit }}
        />
      </StepFrame>
    );
  }

  if (phase.kind === "running") {
    return (
      <StepFrame key="running" title={testTitle} onBack={onEdit}>
        {list}
        <p className="text-sm text-fg-muted">{t("ob.test.note")}</p>
      </StepFrame>
    );
  }

  const { run } = phase;
  const failedStep = run.steps.find((step) => step.status === "fail");
  // A key that cannot list buckets is fine when no bucket was given: the person types the name (AC-7.3).
  // Listing buckets is a service-level call, and many providers cannot add CORS headers to it, so a CORS block
  // at this point says nothing about the bucket the person wants; the CORS help comes after they name it (D-28).
  const cannotListBuckets =
    bucket === undefined &&
    ((failedStep?.id === "list" && failedStep.failure === "accessDenied") || (failedStep?.id === "cors" && failedStep.failure === "cors"));

  if (run.outcome === "ok" || cannotListBuckets) {
    return (
      <StepFrame key="ok" title={testTitle} onBack={onEdit}>
        {list}
        <Banner tone="success" title={t("ob.pass.title")}>
          {t("ob.pass.body")}
        </Banner>
        <Button
          variant="primary"
          size="lg"
          block
          onClick={() => {
            finish("readWrite", cannotListBuckets ? null : (run.buckets ?? []));
          }}
        >
          {bucket === undefined ? t("ob.pass.cta") : t("ob.pick.cta")}
        </Button>
      </StepFrame>
    );
  }

  if (run.outcome === "readOnly") {
    return (
      <StepFrame key="readOnly" title={testTitle} onBack={onEdit}>
        {list}
        <ReadOnlyOffer
          readVerified={run.readVerified !== false}
          onConnectReadOnly={() => {
            finish("readOnly", null);
          }}
          onEditKeys={onEdit}
        />
      </StepFrame>
    );
  }

  const failure = failedStep?.failure ?? "unknown";

  if (failure === "cors") {
    return (
      <StepFrame key="cors" title={t("ob.cors.title")} onBack={onEdit} backLabel={t("ob.cors.back")}>
        {list}
        <CorsHelp
          preset={preset}
          origin={origin ?? window.location.origin}
          bucket={bucket}
          onCheckAgain={() => {
            rerun();
          }}
        />
      </StepFrame>
    );
  }

  const retry = () => {
    rerun();
  };
  let card;
  switch (failure) {
    case "accessDenied":
      card =
        failedStep?.id === "clean" ? (
          <FailureCard
            title={t("ob.fail.clean.title")}
            why={t("ob.fail.clean.why")}
            next={t("ob.fail.clean.next")}
            primary={{ label: t("ob.fail.clean.cta"), onClick: retry }}
            secondary={{ label: t("ob.fail.sig.cta"), onClick: onEdit }}
          />
        ) : (
          <FailureCard
            title={t("ob.fail.denied.title")}
            why={t("ob.fail.denied.why", { bucket: bucketLabel })}
            next={t("ob.fail.denied.next")}
            primary={{ label: t("ob.fail.denied.cta"), onClick: retry }}
            secondary={{ label: t("ob.fail.sig.cta"), onClick: onEdit }}
          />
        );
      break;
    case "signatureDoesNotMatch": {
      const minutes = failedStep?.hint?.clockOffsetMinutes;
      card = (
        <FailureCard
          title={t("ob.fail.sig.title")}
          why={minutes === undefined ? t("ob.fail.sig.whyUnknown") : t("ob.fail.sig.why", { minutes: Math.abs(minutes) })}
          next={t("ob.fail.sig.next")}
          primary={{ label: t("ob.fail.sig.cta"), onClick: onEdit }}
          secondary={{ label: t("ob.fail.denied.cta"), onClick: retry }}
        />
      );
      break;
    }
    case "wrongRegion": {
      const suggested = failedStep?.hint?.suggestedRegion;
      card =
        suggested === undefined ? (
          <FailureCard
            title={t("ob.fail.missing.title")}
            why={t("ob.fail.missing.why", { bucket: bucketLabel, endpoint })}
            next={t("ob.fail.missing.next")}
            primary={{ label: t("ob.fail.missing.cta"), onClick: onEdit }}
          />
        ) : (
          <FailureCard
            title={t("ob.fail.bucket.title")}
            why={t("ob.fail.bucket.why", { bucket: bucketLabel, actual: suggested, requested: region })}
            next={t("ob.fail.bucket.next")}
            primary={{ label: t("ob.fail.bucket.cta", { region: suggested }), onClick: () => { rerun(suggested); } }}
            secondary={{ label: t("ob.fail.missing.cta"), onClick: onEdit }}
          />
        );
      break;
    }
    case "noSuchBucket":
      card = (
        <FailureCard
          title={t("ob.fail.missing.title")}
          why={t("ob.fail.missing.why", { bucket: bucketLabel, endpoint })}
          next={t("ob.fail.missing.next")}
          primary={{ label: t("ob.fail.missing.cta"), onClick: onEdit }}
          secondary={{ label: t("ob.fail.denied.cta"), onClick: retry }}
        />
      );
      break;
    case "network":
    case "mixedContent":
      card = (
        <FailureCard
          title={t("ob.fail.net.title", { endpoint })}
          why={t("ob.fail.net.why")}
          next={t("ob.fail.net.next")}
          primary={{ label: t("ob.fail.net.cta"), onClick: onEdit }}
          secondary={{ label: t("ob.fail.denied.cta"), onClick: retry }}
        />
      );
      break;
    case "localNetworkDenied":
      card = (
        <FailureCard
          title={t("ob.fail.localNetwork.title")}
          why={t("ob.fail.localNetwork.why", { endpoint })}
          next={t("ob.fail.localNetwork.next")}
          primary={{ label: t("ob.fail.localNetwork.cta"), onClick: retry }}
          secondary={{ label: t("ob.fail.net.cta"), onClick: onEdit }}
        />
      );
      break;
    default:
      card = (
        <FailureCard
          title={t("ob.fail.unknown.title")}
          why={t("ob.fail.unknown.why")}
          next={t("ob.fail.unknown.next")}
          primary={{ label: t("ob.fail.unknown.cta"), onClick: retry }}
          secondary={{ label: t("ob.fail.missing.cta"), onClick: onEdit }}
        />
      );
  }

  return (
    <StepFrame key="failed" title={testTitle} onBack={onEdit}>
      {list}
      {card}
    </StepFrame>
  );
}
