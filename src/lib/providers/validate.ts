import type { ProviderPreset, ProvidersFile } from "@/lib/types";

const PLACEHOLDER = /\{(\w+)\}/g;
const REGION_ROLE_FIELD = "region";

function compiles(pattern: string): boolean {
  try {
    new RegExp(pattern, "i");
    return true;
  } catch {
    return false;
  }
}

function placeholders(template: string): string[] {
  return [...template.matchAll(PLACEHOLDER)].map((match) => match[1] ?? "");
}

function checkPreset(preset: ProviderPreset, groups: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  const at = (message: string) => problems.push(`${preset.id}: ${message}`);
  const ids = new Set(preset.fields.map((field) => field.id));

  if (!groups.has(preset.group)) at(`unknown group "${preset.group}"`);

  // Every {placeholder} in a template is a field id (or the region, which may be a field).
  const templates = [
    ...(preset.endpointTemplate ? [preset.endpointTemplate] : []),
    ...Object.values(preset.endpointTemplateByField ?? {}).flatMap((byValue) => Object.values(byValue)),
  ];
  for (const template of templates) {
    for (const name of placeholders(template)) {
      if (!ids.has(name) && name !== REGION_ROLE_FIELD) at(`template placeholder {${name}} is not a field`);
    }
  }
  for (const controller of Object.keys(preset.endpointTemplateByField ?? {})) {
    if (!ids.has(controller)) at(`endpointTemplateByField names unknown field "${controller}"`);
  }
  if (preset.bucketSuffix) {
    for (const name of placeholders(preset.bucketSuffix)) {
      if (!ids.has(name)) at(`bucketSuffix placeholder {${name}} is not a field`);
    }
  }
  if (preset.region.field !== undefined && !ids.has(preset.region.field)) {
    at(`region.field names unknown field "${preset.region.field}"`);
  }
  if (!preset.endpointTemplate && !ids.has("endpoint")) at("has no endpoint template and no endpoint field");

  for (const field of preset.fields) {
    for (const key of ["showWhen", "roleWhen"] as const) {
      const condition = field[key];
      if (condition && !ids.has(condition.field)) at(`${field.id}.${key} names unknown field "${condition.field}"`);
    }
    if (field.validation?.pattern !== undefined && !compiles(field.validation.pattern)) {
      at(`${field.id}.validation.pattern does not compile`);
    }
    if (field.control === "select" && (field.options?.length ?? 0) === 0) at(`${field.id} is a select with no options`);
  }

  if (preset.expectedHostPattern !== null && !compiles(preset.expectedHostPattern)) {
    at("expectedHostPattern does not compile");
  }
  const endpointPattern = preset.pasteHints.endpointPattern;
  if (endpointPattern !== null) {
    if (!compiles(endpointPattern)) {
      at("endpointPattern does not compile");
    } else {
      for (const match of endpointPattern.matchAll(/\(\?<(\w+)>/g)) {
        const name = match[1] ?? "";
        if (!ids.has(name)) at(`endpointPattern group (?<${name}>) is not a field`);
      }
    }
  }

  // The preset must supply an access key and a secret, directly or through a role.
  for (const role of ["accessKeyId", "secretAccessKey"] as const) {
    const supplied = preset.fields.some((field) => field.role === role || field.id === role);
    if (!supplied) at(`nothing supplies the ${role}`);
  }
  return problems;
}

/** Cross-checks that the JSON Schema of the preset type cannot express. Empty means valid. */
export function validateProvidersFile(file: ProvidersFile): string[] {
  const problems: string[] = [];
  const groups = new Set(file.groups.map((group) => group.id));

  const seen = new Set<string>();
  for (const preset of file.providers) {
    if (seen.has(preset.id)) problems.push(`${preset.id}: duplicate preset id`);
    seen.add(preset.id);
    problems.push(...checkPreset(preset, groups));
  }

  const orders = file.providers.filter((preset) => preset.popular).map((preset) => preset.popularOrder);
  if (orders.some((order) => order === null)) problems.push("a popular preset has no popularOrder");
  if (new Set(orders).size !== orders.length) problems.push("popularOrder is not unique among popular presets");
  return problems;
}

/** Validate, then return the typed file. Throws with every problem listed. */
export function parseProvidersFile(raw: unknown): ProvidersFile {
  const file = raw as ProvidersFile;
  const problems = validateProvidersFile(file);
  if (problems.length > 0) throw new Error(`providers.json is invalid:\n${problems.join("\n")}`);
  return file;
}
