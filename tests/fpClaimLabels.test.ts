import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { RESULT_COMMAND_BY_PATH } from "../src/cli/resultCommandRegistry.js";
import { initWorkspace } from "../src/workspace.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function strictRun(args: string[]) {
  const root = mkdtempSync(join(tmpdir(), "amc-fp-claims-"));
  roots.push(root);
  const workspace = join(root, "workspace"), passphrase = "fp-claim-labels";
  process.env.AMC_VAULT_PASSPHRASE = passphrase;
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  return spawnSync(process.execPath, [resolve("dist/cli.js"), ...args], { cwd: workspace, encoding: "utf8", timeout: 60_000,
    env: { PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ""}`, HOME: join(root, "home"), NO_COLOR: "1",
      AMC_VAULT_PASSPHRASE: passphrase, AMC_CLAIM_LABELS_STRICT: "1", AMC_CONTROL_CHECKPOINT_DIR: join(root, "checkpoints") } });
}

describe("false-positive result commands carry the registry's claim label (WP37 review)", () => {
  test("fp-cost and fp-tuning-report are self-reported result commands", () => {
    for (const path of ["fp-cost", "fp-tuning-report"]) {
      expect(RESULT_COMMAND_BY_PATH.get(path), path).toMatchObject({ producer: "assurance:falsePositiveTracker", defaultKind: "self_reported" });
    }
  });

  test.each(["fp-cost", "fp-tuning-report"])("%s prints a self-reported claim line under AMC_CLAIM_LABELS_STRICT=1", (command) => {
    const result = strictRun([command]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/^(?:\*\*Claim:\*\* |Claim: )Self-reported/m);
  }, 90_000);
});
