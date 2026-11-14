import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { runDiagnostic } from "../src/diagnostic/runner.js";
import { lockVault } from "../src/vault/vault.js";

// CLI-15: GETTING_STARTED said `amc bundle export --out evidence.amcbundle` (no --run), and `--run latest` failed with a
// raw ENOENT on .amc/runs/latest.json.
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); } });

describe("amc bundle export as GETTING_STARTED shows it", () => {
  test("the documented command names a run, and --run latest exports the newest run", async () => {
    const guide = readFileSync(resolve("docs/GETTING_STARTED.md"), "utf8");
    for (const line of guide.split("\n").filter((row) => row.startsWith("amc bundle export"))) expect(line).toContain("--run ");

    const passphrase = "synthetic-bundle-export-latest";
    const root = mkdtempSync(join(tmpdir(), "amc-bundle-latest-"));
    roots.push(root);
    const previous = process.env.AMC_VAULT_PASSPHRASE;
    process.env.AMC_VAULT_PASSPHRASE = passphrase;
    try {
      initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
      await runDiagnostic({ workspace: root, window: "14d", targetName: "default", claimMode: "auto" });
    } finally { if (previous === undefined) delete process.env.AMC_VAULT_PASSPHRASE; else process.env.AMC_VAULT_PASSPHRASE = previous; }
    const run = spawnSync(process.execPath, ["--import", resolve("node_modules/tsx/dist/loader.mjs"), resolve("src/cli.ts"),
      "bundle", "export", "--run", "latest", "--out", "evidence.amcbundle"],
      { cwd: root, env: { ...process.env, NO_COLOR: "1", HOME: root, AMC_VAULT_PASSPHRASE: passphrase }, encoding: "utf8", timeout: 120_000 });
    expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0);
    expect(`${run.stdout}${run.stderr}`).not.toContain("ENOENT");
    expect(existsSync(join(root, "evidence.amcbundle"))).toBe(true);
  }, 180_000);
});
