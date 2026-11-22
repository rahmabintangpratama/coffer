import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** The version in package.json, read at build time so About can show it without shipping package.json (AC-100.3). */
export function appVersion(): string {
  const file = fileURLToPath(new URL("../../package.json", import.meta.url));
  return (JSON.parse(readFileSync(file, "utf8")) as { version: string }).version;
}
