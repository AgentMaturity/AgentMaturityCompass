/**
 * Doctor checks on the secret files inside a workspace's .amc directory.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { AMC_SECRET_FILES } from "../workspaceGitignore.js";
import type { DoctorCheck } from "./doctorRules.js";

/**
 * LIVE-VAULT-11: in a git work tree, every .amc secret must be git-ignored and untracked. `amc up` writes .amc/.gitignore
 * only through initWorkspace, so an older workspace used through `amc run` or Studio alone may have none, and a secret
 * committed before the ignore file stays tracked whatever it says. Null when there is no .amc directory.
 */
export function amcGitignoreCheck(workspace: string, env: NodeJS.ProcessEnv = process.env): DoctorCheck | null {
  const id = "amc-gitignore";
  if (!existsSync(join(workspace, ".amc"))) return null;
  const git = (...args: string[]) => spawnSync("git", ["-C", workspace, ...args], { env, encoding: "utf8", stdio: "pipe", timeout: 3_000 });
  const inside = git("rev-parse", "--is-inside-work-tree");
  if (inside.error !== undefined || inside.status !== 0 || inside.stdout.trim() !== "true") {
    return { id, status: "INFO", message: "Not a git work tree (or git is not installed): .amc secrets cannot be committed from here" };
  }
  for (const file of AMC_SECRET_FILES.map((name) => `.amc/${name}`)) {
    if (git("ls-files", "--error-unmatch", file).status === 0) {
      return { id, status: "FAIL", message: `${file} is committed to this repository`,
        fixHint: `Run: git rm --cached ${file} && git commit, then rotate it (docs/VAULT.md "When to rotate")` };
    }
    // One path per call: check-ignore --quiet with two paths is a fatal error (exit 128), which is not "not ignored".
    if (git("check-ignore", "-q", file).status === 1) {
      return { id, status: "FAIL", message: `${file} is not git-ignored in this repository`,
        fixHint: "Run: amc up (writes .amc/.gitignore once), or add the lines from docs/VAULT.md to .amc/.gitignore" };
    }
  }
  return { id, status: "PASS", message: ".amc secrets are git-ignored" };
}
