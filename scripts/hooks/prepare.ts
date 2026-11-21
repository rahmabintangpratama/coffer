import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

// Runs on `pnpm install`. Installs the Git hooks from lefthook.yml when this is
// a Git checkout; does nothing in an exported source tree (no .git).
if (existsSync(".git")) {
  execFileSync("pnpm", ["exec", "lefthook", "install"], { stdio: "inherit" });
}
