import { type ReactNode, type SubmitEvent, useEffect, useRef, useState } from "react";
import { Banner } from "@/components/Banner";
import { Button } from "@/components/Button";
import { EndpointPreview } from "@/components/EndpointPreview";
import { ComboInput, Field, Segmented, SelectInput, TextArea, TextInput } from "@/components/Field";
import { HelpInline } from "@/components/HelpInline";
import { t } from "@/lib/i18n";
import {
  ADVANCED_FIELDS,
  buildEndpoint,
  defaultValues,
  hostLooksRight,
  needsGenericSessionToken,
  parsePaste,
  resolveConnection,
  resolveRegion,
  visibleFields,
} from "@/lib/providers";
import { vault } from "@/lib/storage/vault";
import type { AddressingStyle, ProviderField, ProviderPreset } from "@/lib/types";
import { type ConnectionPlan, describeProblems, type FieldProblem, optionLabel, planOf, withoutSecrets } from "./form-model";
import { StepFrame } from "./StepFrame";

export interface CredentialsSubmit {
  /** Every value except the keys. */
  values: Record<string, string>;
  bucket: string;
  plan: ConnectionPlan;
  /** The keys are already in the vault under this id. */
  connectionId: string;
}

interface CredentialsScreenProps {
  preset: ProviderPreset;
  /** Values to start from. The keys are never among them. */
  initialValues?: Record<string, string>;
  initialBucket?: string;
  onBack: () => void;
  onSubmit: (result: CredentialsSubmit) => void;
}

const ADDRESSING: readonly AddressingStyle[] = ["auto", "path", "virtual"];
const hasTemplate = (preset: ProviderPreset) => preset.endpointTemplate !== null;

/** O30 to O35: the connection form for one provider. */
export function CredentialsScreen({ preset, initialValues, initialBucket = "", onBack, onSubmit }: CredentialsScreenProps) {
  const form = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const { endpoint, ...rest } = initialValues ?? {};
    return { ...defaultValues(preset), ...rest, ...(hasTemplate(preset) || endpoint === undefined ? {} : { endpoint }) };
  });
  const [endpointOverride, setEndpointOverride] = useState<string | null>(
    hasTemplate(preset) ? (initialValues?.endpoint ?? null) : null,
  );
  const [bucket, setBucket] = useState(initialBucket);
  const [detected, setDetected] = useState<readonly string[]>([]);
  const [pasteText, setPasteText] = useState("");
  const [pasteNotes, setPasteNotes] = useState<readonly string[]>([]);
  const [problems, setProblems] = useState<readonly FieldProblem[]>([]);

  // A lock (here, or in another tab) drops the keys: the secret fields and any pasted text are cleared, and everything else
  // (provider, endpoint, region, bucket, start folder) stays, so only the keys have to be typed again.
  useEffect(
    () =>
      vault.onLock(() => {
        setValues((current) => withoutSecrets(preset, current));
        setPasteText("");
        setDetected([]);
      }),
    [preset],
  );

  const set = (id: string, value: string) => {
    setValues((current) => ({ ...current, [id]: value }));
  };
  const problemFor = (id: string) => problems.find((problem) => problem.target === id)?.text;

  // After a failed submit, put focus on the first field with a problem.
  useEffect(() => {
    if (problems.length > 0) form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [problems]);

  const regionDefault = preset.region.default;
  const fields = visibleFields(preset, values);
  const browserWarning = preset.badges?.some((badge) => badge.tone === "warning") ?? false;

  // The endpoint as built from the form, or as the person edited it.
  const builtEndpoint = (() => {
    if (!hasTemplate(preset)) return "";
    const result = buildEndpoint(preset, values, resolveRegion(preset, values).region);
    return result.ok ? result.endpoint : "";
  })();
  const endpointText = endpointOverride ?? builtEndpoint;
  const endpointWarning =
    endpointText !== "" && !hostLooksRight(preset, endpointText) ? t("form.endpointHostWarn", { provider: preset.displayName }) : undefined;

  const fillFromPaste = () => {
    const result = parsePaste(pasteText, preset);
    // Cleared at once: the text may hold keys, and it is not kept or sent anywhere (AC-4.4).
    setPasteText("");
    const notes: string[] = [];
    if (result.detected.length === 0) {
      notes.push(t("ob.paste.noMatch"));
    } else {
      setValues((current) => ({ ...current, ...result.fields }));
      setDetected(result.detected);
      notes.push(t("ob.paste.filled", { count: result.detected.length }));
    }
    if (result.rcloneProviderMismatch) notes.push(t("ob.paste.providerMismatch", { provider: preset.displayName }));
    if (result.expirationIgnored) notes.push(t("ob.paste.expiryIgnored"));
    setPasteNotes(notes);
  };

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    const effective: ProviderPreset =
      endpointOverride === null ? preset : { ...preset, endpointTemplate: null, endpointTemplateByField: {} };
    const runValues = endpointOverride === null ? values : { ...values, endpoint: endpointOverride };
    const style = runValues[ADVANCED_FIELDS.addressingStyle];
    const addressingStyle = ADDRESSING.find((candidate) => candidate === style);
    const result = resolveConnection(effective, runValues, {
      bucket,
      ...(addressingStyle === undefined ? {} : { addressingStyle }),
    });
    if (!result.ok) {
      setProblems(describeProblems(preset, result.problems));
      return;
    }
    setProblems([]);
    const connectionId = crypto.randomUUID();
    vault.put(connectionId, result.value.credentials);
    onSubmit({
      values: withoutSecrets(preset, runValues),
      bucket: bucket.trim(),
      plan: planOf(result.value),
      connectionId,
    });
  };

  const marker = (id: string) => (detected.includes(id) ? t("ob.paste.detected") : undefined);

  const control = (field: ProviderField): ReactNode => {
    const value = values[field.id] ?? "";
    const common = {
      value,
      placeholder: field.placeholder,
      autoComplete: "off",
      autoCapitalize: "none",
      autoCorrect: "off",
      spellCheck: false,
    } as const;
    switch (field.control) {
      case "password":
        return <TextInput {...common} type="password" mono={field.mono} onChange={(event) => { set(field.id, event.target.value); }} />;
      case "select":
        return (
          <SelectInput value={value} onChange={(event) => { set(field.id, event.target.value); }}>
            {(field.options ?? []).map((option) => (
              <option key={option} value={option}>
                {optionLabel(field, option)}
              </option>
            ))}
          </SelectInput>
        );
      case "combobox":
        return <ComboInput {...common} options={field.options ?? []} mono={field.mono} onChange={(event) => { set(field.id, event.target.value); }} />;
      default:
        return (
          <TextInput
            {...common}
            type="text"
            inputMode={field.id === "endpoint" ? "url" : undefined}
            mono={field.mono}
            onChange={(event) => { set(field.id, event.target.value); }}
          />
        );
    }
  };

  const insecure = problems.find((problem) => problem.insecure);
  const advancedHasProblem = problems.some((problem) => problem.target === ADVANCED_FIELDS.prefix);

  return (
    <StepFrame title={t("ob.cred.title", { provider: preset.displayName })} onBack={onBack}>
      {browserWarning ? <Banner tone="warning">{t("ob.cred.browserWarn", { provider: preset.displayName })}</Banner> : null}

      <HelpInline summary={t("ob.pasteLabel")}>
        <div className="flex flex-col gap-3 pt-1">
          <p className="text-sm text-fg-muted">{t("ob.paste.sub")}</p>
          <Field label={t("ob.paste.label")}>
            <TextArea
              mono
              rows={4}
              value={pasteText}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onChange={(event) => {
                setPasteText(event.target.value);
              }}
            />
          </Field>
          <div>
            <Button variant="secondary" disabled={pasteText.trim() === ""} onClick={fillFromPaste}>
              {t("ob.paste.fill")}
            </Button>
          </div>
          <p className="text-sm text-fg-muted">{t("ob.paste.privacy")}</p>
          <div role="status" className="flex flex-col gap-1 text-sm">
            {pasteNotes.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
        </div>
      </HelpInline>

      <HelpInline summary={t("ob.help.title")}>
        <ol className="flex list-decimal flex-col gap-1 pl-5 pt-1">
          {preset.helpSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="mt-2 text-fg-muted">{preset.scopedKeyAdvice === "" ? t("ob.help.scoped") : preset.scopedKeyAdvice}</p>
      </HelpInline>

      <form ref={form} noValidate onSubmit={submit} aria-label={t("ob.cred.formLabel")} className="flex flex-col gap-5">
        {insecure ? (
          <Banner tone="danger" title={t("ob.fail.net.title", { endpoint: endpointText === "" ? (values.endpoint ?? "") : endpointText })}>
            {t("ob.fail.net.why")} {t("ob.fail.net.next")}
          </Banner>
        ) : null}

        {fields.map((field) => {
          if (field.control === "segmented") {
            return (
              <Segmented
                key={field.id}
                name={field.id}
                legend={field.label}
                value={values[field.id] ?? field.default ?? ""}
                options={(field.options ?? []).map((option) => ({ value: option, label: optionLabel(field, option) }))}
                onChange={(value) => {
                  set(field.id, value);
                }}
              />
            );
          }
          const isRegion = field.id === "region" && !field.required && regionDefault !== undefined;
          return (
            <Field
              key={field.id}
              label={field.label}
              caption={field.generic !== undefined && field.generic !== field.label ? field.generic : undefined}
              optionalLabel={field.required ? undefined : t("form.optional")}
              marker={marker(field.id)}
              hint={isRegion ? t("form.regionHint", { region: regionDefault }) : undefined}
              error={problemFor(field.id)}
            >
              {control(field)}
            </Field>
          );
        })}

        {hasTemplate(preset) ? (
          <EndpointPreview
            label={t("form.endpointLabel")}
            note={t("form.endpoint.note")}
            editLabel={t("act.edit")}
            value={endpointText}
            onChange={setEndpointOverride}
            warning={endpointWarning}
            error={problemFor("endpoint")}
          />
        ) : endpointWarning ? (
          <p className="text-sm text-warning-fg">{endpointWarning}</p>
        ) : null}

        <Field
          label={t("form.bucketLabel")}
          optionalLabel={t("form.optional")}
          hint={preset.bucketSuffix ? `${t("form.bucket.hint")} ${t("form.bucket.tencent")}` : t("form.bucket.hint")}
        >
          <TextInput
            value={bucket}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(event) => {
              setBucket(event.target.value);
            }}
          />
        </Field>

        <HelpInline key={String(advancedHasProblem)} summary={t("form.advanced")} defaultOpen={advancedHasProblem}>
          <div className="flex flex-col gap-5 pt-1">
            <p className="text-sm text-fg-muted">{t("ob.cred.advancedHint")}</p>
            <div className="flex flex-col gap-1">
              <Segmented
                name="addressing"
                legend={t("form.addressing")}
                value={values[ADVANCED_FIELDS.addressingStyle] ?? preset.addressingStyle}
                disabled={preset.addressingLocked}
                options={[
                  { value: "auto", label: t("form.addr.auto") },
                  { value: "path", label: t("form.addr.path") },
                  { value: "virtual", label: t("form.addr.virtual") },
                ]}
                onChange={(value) => {
                  set(ADVANCED_FIELDS.addressingStyle, value);
                }}
              />
              <p className="text-sm text-fg-muted">{t("form.addr.hint")}</p>
            </div>
            {needsGenericSessionToken(preset) ? (
              <Field label={t("form.sessionTokenLabel")} optionalLabel={t("form.optional")} marker={marker(ADVANCED_FIELDS.sessionToken)}>
                <TextInput
                  type="password"
                  mono
                  value={values[ADVANCED_FIELDS.sessionToken] ?? ""}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  onChange={(event) => {
                    set(ADVANCED_FIELDS.sessionToken, event.target.value);
                  }}
                />
              </Field>
            ) : null}
            {preset.sessionToken ? (
              <Field
                label={t("form.tokenExpiresLabel")}
                optionalLabel={t("form.optional")}
                marker={marker(ADVANCED_FIELDS.sessionTokenExpiresAt)}
                hint={t("form.tokenExpires.hint")}
              >
                <TextInput
                  mono
                  value={values[ADVANCED_FIELDS.sessionTokenExpiresAt] ?? ""}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => {
                    set(ADVANCED_FIELDS.sessionTokenExpiresAt, event.target.value);
                  }}
                />
              </Field>
            ) : null}
            <Field
              label={t("form.prefixLabel")}
              optionalLabel={t("form.optional")}
              hint={t("form.prefix.hint")}
              error={problemFor(ADVANCED_FIELDS.prefix)}
            >
              <TextInput
                value={values[ADVANCED_FIELDS.prefix] ?? ""}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                onChange={(event) => {
                  set(ADVANCED_FIELDS.prefix, event.target.value);
                }}
              />
            </Field>
          </div>
        </HelpInline>

        <div className="flex flex-col gap-2">
          <Button type="submit" variant="primary" size="lg" block>
            {t("ob.cred.cta")}
          </Button>
          <p className="text-center text-sm text-fg-muted">{t("ob.cred.foot")}</p>
        </div>
      </form>
    </StepFrame>
  );
}
