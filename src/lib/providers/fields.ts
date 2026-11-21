import type { ProviderField, ProviderPreset } from "@/lib/types";

/**
 * Fields every connection can have in addition to a preset's own. They sit under
 * Advanced in the form (C-13, C-39) and are not part of providers.json.
 */
export const ADVANCED_FIELDS = {
  sessionToken: "sessionToken",
  sessionTokenExpiresAt: "sessionTokenExpiresAt",
  /** "Start in folder": the connection root (ConnectionProfile.prefix). */
  prefix: "prefix",
  addressingStyle: "addressingStyle",
} as const;

export type FieldValues = Readonly<Record<string, string>>;

export interface FieldError {
  fieldId: string;
  rule: "required" | "pattern" | "length" | "prefix";
  /** The provider's own message from providers.json. */
  message: string;
}

/** A field is shown while its showWhen condition holds (or it has none). */
export function isVisible(field: ProviderField, values: FieldValues): boolean {
  return !field.showWhen || (values[field.showWhen.field] ?? "") === field.showWhen.equals;
}

export function visibleFields(preset: ProviderPreset, values: FieldValues): ProviderField[] {
  return preset.fields.filter((field) => isVisible(field, values));
}

/** Starting values: each field's default, so a form opens with the provider's usual choice. */
export function defaultValues(preset: ProviderPreset): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of preset.fields) {
    if (field.default !== undefined) values[field.id] = field.default;
  }
  return values;
}

/** True when the preset takes a session token but has no field for it (AWS, R2, MinIO, custom). */
export function needsGenericSessionToken(preset: ProviderPreset): boolean {
  return preset.sessionToken && !preset.fields.some((field) => field.role === "sessionToken");
}

/** Check required fields and the provider's own rules. Hidden fields are skipped. */
export function validateFields(preset: ProviderPreset, values: FieldValues): FieldError[] {
  const errors: FieldError[] = [];
  for (const field of visibleFields(preset, values)) {
    const value = (values[field.id] ?? "").trim();
    if (value === "") {
      if (field.required) errors.push({ fieldId: field.id, rule: "required", message: "" });
      continue;
    }
    const rule = field.validation;
    if (!rule) continue;
    if (rule.pattern !== undefined && !new RegExp(rule.pattern).test(value)) {
      errors.push({ fieldId: field.id, rule: "pattern", message: rule.message });
    } else if (rule.length !== undefined && value.length !== rule.length) {
      errors.push({ fieldId: field.id, rule: "length", message: rule.message });
    } else if (rule.prefix !== undefined && !value.startsWith(rule.prefix)) {
      errors.push({ fieldId: field.id, rule: "prefix", message: rule.message });
    }
  }
  return errors;
}

/** "Start in folder": no leading slash, one trailing slash, no empty or relative segments. Empty means the bucket root. */
export function normalizePrefix(input: string): string | null {
  const segments = input
    .trim()
    .split("/")
    .filter((segment) => segment !== "");
  if (segments.some((segment) => segment === "." || segment === "..")) return null;
  return segments.length === 0 ? "" : `${segments.join("/")}/`;
}
