import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** The version in package.json, read at build time so About can show it without shipping package.json (AC-100.3). */
export function appVersion(): string {
  const file = fileURLToPath(new URL("../../package.json", import.meta.url));
  return (JSON.parse(readFileSync(file, "utf8")) as { version: string }).version;
}

/** The source repository in package.json, for the link on About (M11). Only an https URL is used. */
export function sourceUrl(): string {
  const file = fileURLToPath(new URL("../../package.json", import.meta.url));
  const { repository } = JSON.parse(readFileSync(file, "utf8")) as { repository?: { url?: string } | string };
  const url = typeof repository === "string" ? repository : (repository?.url ?? "");
  return url.startsWith("https://") ? url : "";
}
