import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The number of provider presets, read at build time so Welcome can say "Works with N+ providers"
 * without loading the provider list itself (D-40). It is a compile-time constant, not a runtime read.
 */
export function providerCount(): number {
  const file = fileURLToPath(new URL("../../design/providers.json", import.meta.url));
  const parsed = JSON.parse(readFileSync(file, "utf8")) as { providers: unknown[] };
  return parsed.providers.length;
}
