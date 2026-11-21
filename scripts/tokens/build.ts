import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { generate, type TokenTree } from "./generate.ts";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = join(repo, "design", "tokens.json");
const outputs = {
  tokensCss: join(repo, "src", "styles", "tokens.css"),
  tailwindCss: join(repo, "src", "styles", "tailwind.css"),
} as const;

const tokens = JSON.parse(readFileSync(source, "utf8")) as TokenTree;
const generated = generate(tokens);
const check = process.argv.includes("--check");

if (check) {
  // Regenerate in memory and compare with the committed files. Never writes.
  const stale = (Object.keys(outputs) as Array<keyof typeof outputs>).filter((key) => {
    try {
      return readFileSync(outputs[key], "utf8") !== generated[key];
    } catch {
      return true;
    }
  });
  if (stale.length > 0) {
    const names = stale.map((key) => relative(repo, outputs[key])).join(", ");
    console.error(`Generated token CSS is out of date: ${names}. Run \`pnpm tokens:build\` and commit the result.`);
    process.exit(1);
  }
  console.log("Token CSS matches design/tokens.json.");
} else {
  mkdirSync(dirname(outputs.tokensCss), { recursive: true });
  for (const key of Object.keys(outputs) as Array<keyof typeof outputs>) {
    writeFileSync(outputs[key], generated[key]);
    console.log(`Wrote ${relative(repo, outputs[key])}`);
  }
}
