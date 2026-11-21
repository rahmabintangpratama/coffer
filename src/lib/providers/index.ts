import providersJson from "@design/providers.json";
import type { ProviderPreset, ProvidersFile } from "@/lib/types";
import { parseProvidersFile } from "./validate";

export {
  credentialsFromValues,
  effectiveBucket,
  FALLBACK_REGION,
  jwtExpiry,
  regionFieldId,
  resolveAddressing,
  resolveConnection,
  resolveRegion,
  sessionTokenExpiry,
  type Credentials,
  type Problem,
  type ResolvedConnection,
  type ResolveResult,
} from "./connection";
export {
  addressSpaceOf,
  buildEndpoint,
  hostLooksRight,
  normalizeEndpoint,
  type AddressSpace,
  type EndpointProblem,
} from "./endpoint";
export {
  ADVANCED_FIELDS,
  defaultValues,
  needsGenericSessionToken,
  normalizePrefix,
  validateFields,
  visibleFields,
  type FieldError,
  type FieldValues,
} from "./fields";
export { parsePaste, type PasteResult } from "./paste";
export { parseProvidersFile, validateProvidersFile } from "./validate";

/** The presets from design/providers.json, checked when this module loads. */
export const providersFile: ProvidersFile = parseProvidersFile(providersJson);

export function getPreset(id: string): ProviderPreset {
  const preset = providersFile.providers.find((candidate) => candidate.id === id);
  if (!preset) throw new Error(`Unknown provider preset: ${id}`);
  return preset;
}
