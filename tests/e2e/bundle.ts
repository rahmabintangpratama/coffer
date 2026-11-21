import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url));

/** Bundle a harness entry for the browser as one script, in memory. */
export async function bundleForBrowser(entry: string): Promise<string> {
  const output = await build({
    configFile: false,
    logLevel: "silent",
    resolve: { alias: { "@": root("src"), "@design": root("design") } },
    build: {
      write: false,
      minify: false,
      target: "es2022",
      lib: { entry: root(entry), formats: ["iife"], name: "CofferHarness", fileName: "harness" },
    },
  });
  const outputs = Array.isArray(output) ? output : [output];
  const chunk = outputs.flatMap((result) => ("output" in result ? result.output : [])).find((item) => item.type === "chunk");
  if (chunk?.type !== "chunk") throw new Error(`Could not bundle ${entry}`);
  return chunk.code;
}
