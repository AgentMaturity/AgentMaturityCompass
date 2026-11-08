/**
 * Doctor checks on the secret files inside a workspace's .amc directory.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { permissionsAreEnforced } from "../credentials/credentialsFilePermissions.js";
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

/** LIVE-VAULT-12: the Studio admin token is a bearer secret, kept as `amc up` writes it: 0600 and 64 hex characters. Null when absent. */
export function adminTokenCheck(workspace: string): DoctorCheck | null {
  const id = "studio-admin-token", file = join(workspace, ".amc", "studio", "admin.token");
  if (!existsSync(file)) return null;
  if (!permissionsAreEnforced()) return { id, status: "INFO", message: ".amc/studio/admin.token: POSIX modes are not checked on this platform" };
  const mode = statSync(file).mode & 0o777;
  if ((mode & 0o077) !== 0) {
    return { id, status: "FAIL", message: `.amc/studio/admin.token is open to group or other users (mode ${mode.toString(8)})`, fixHint: "Run: chmod 600 .amc/studio/admin.token" };
  }
  if (!/^[0-9a-f]{64}$/.test(readFileSync(file, "utf8").trim())) {
    return { id, status: "FAIL", message: ".amc/studio/admin.token is not 64 hexadecimal characters",
      fixHint: "Run: amc down, delete .amc/studio/admin.token, then amc up (a new token is written)" };
  }
  return { id, status: "PASS", message: ".amc/studio/admin.token is private and well formed" };
}
