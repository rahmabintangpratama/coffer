import { t } from "@/lib/i18n";
import {
  ADVANCED_FIELDS,
  type FieldValues,
  type Problem,
  type ResolvedConnection,
} from "@/lib/providers";
import type { ProviderField, ProviderPreset } from "@/lib/types";

// Ids that always hold keys, whether or not a preset marks them with a role.
const SECRET_IDS: ReadonlySet<string> = new Set(["accessKeyId", "secretAccessKey", ADVANCED_FIELDS.sessionToken]);

export function isSecretField(field: ProviderField): boolean {
  return field.role !== undefined || field.control === "password" || SECRET_IDS.has(field.id);
}

/**
 * The form values with every key removed. Only these may leave the form: the keys
 * go to the vault, and a screen that is shown again starts with the secret
 * fields empty (spec 9, FR-3).
 */
export function withoutSecrets(preset: ProviderPreset, values: FieldValues): Record<string, string> {
  const secret = new Set<string>(SECRET_IDS);
  for (const field of preset.fields) if (isSecretField(field)) secret.add(field.id);
  return Object.fromEntries(Object.entries(values).filter(([id]) => !secret.has(id)));
}

/** The plan for a connection: everything but the keys. */
export type ConnectionPlan = Omit<ResolvedConnection, "credentials">;

export function planOf(resolved: ResolvedConnection): ConnectionPlan {
  const { endpoint, region, addressingStyle, forcePathStyle, bucket, prefix, sessionTokenExpiresAt, hostMismatch } = resolved;
  return {
    endpoint,
    region,
    addressingStyle,
    forcePathStyle,
    prefix,
    hostMismatch,
    ...(bucket === undefined ? {} : { bucket }),
    ...(sessionTokenExpiresAt === undefined ? {} : { sessionTokenExpiresAt }),
  };
}

export interface FieldProblem {
  /** The form field the message belongs under, or "endpoint" for the endpoint preview. */
  target: string;
  text: string;
  /** An http endpoint on an https page: shown as a banner with the ob.fail.net wording (AC-3.8). */
  insecure?: boolean;
}

/** Turn engine problems into messages. A provider's own validation message is used as written. */
export function describeProblems(preset: ProviderPreset, problems: readonly Problem[]): FieldProblem[] {
  const fieldIds = new Set(preset.fields.map((field) => field.id));
  const labelOf = (id: string) => preset.fields.find((field) => field.id === id)?.label ?? id;
  return problems.map((problem): FieldProblem => {
    switch (problem.kind) {
      case "field":
        return {
          target: problem.fieldId,
          text: problem.message === "" ? t("form.error.required", { field: labelOf(problem.fieldId) }) : problem.message,
        };
      case "region":
        return { target: problem.fieldId, text: t("form.error.region") };
      case "prefix":
        return { target: problem.fieldId, text: t("form.error.prefix") };
      case "endpoint": {
        const target = fieldIds.has(problem.fieldId) ? problem.fieldId : "endpoint";
        switch (problem.problem) {
          case "missing":
            return { target, text: t("form.error.endpoint.missing") };
          case "invalid":
            return { target, text: t("form.error.endpoint.invalid") };
          case "insecure":
            return { target, text: t("form.error.endpoint.insecure"), insecure: true };
          case "credentials":
            return { target, text: t("form.error.endpoint.credentials") };
          case "query":
            return { target, text: t("form.error.endpoint.query") };
          case "label":
            return { target, text: t("form.error.endpoint.label") };
        }
      }
    }
  });
}

/** The label of a select or segmented option: the copy's word where there is one, else the value itself. */
export function optionLabel(field: ProviderField, value: string): string {
  if (field.id === "authMode") return value === "session" ? t("form.auth.session") : t("form.auth.keys");
  if (field.id === "jurisdiction") {
    if (value === "eu") return t("form.jur.eu");
    if (value === "fedramp") return t("form.jur.fedramp");
    if (value === "default") return t("form.jur.default");
  }
  return value;
}
