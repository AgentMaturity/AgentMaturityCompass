#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { initApprovalPolicy } from "../dist/approvals/approvalPolicyEngine.js";
import { setGuardrailRequested } from "../dist/enforce/guardrailControlState.js";
import { initActionPolicy } from "../dist/governor/actionPolicyEngine.js";
import { writeRuntimeFirewallPolicy } from "../dist/runtime/firewall.js";
import { initWorkspace } from "../dist/workspace.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = join(repoRoot, "fixtures/policy/amc-ci-policy-fixtures.yaml");
const reportPath = join(repoRoot, "tmp/policy-fixtures/ci-report.json");
const workspace = mkdtempSync(join(tmpdir(), "amc-policy-fixtures-ci-"));
const previousPassphrase = process.env.AMC_VAULT_PASSPHRASE;

function runFixture() {
  return spawnSync(
    process.execPath,
    [join(repoRoot, "dist/cli.js"), "policy", "test", fixturePath, "--json"],
    {
      cwd: workspace,
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
      timeout: 30_000,
    },
  );
}

try {
  process.env.AMC_VAULT_PASSPHRASE = randomBytes(24).toString("hex");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  writeRuntimeFirewallPolicy({ workspace, mode: "warn" });
  setGuardrailRequested({
    workspace,
    name: "prompt-injection-detection",
    enabled: true,
    source: "cli",
    actor: "amc-policy-fixtures-ci",
  });
  initActionPolicy(workspace);
  initApprovalPolicy(workspace);

  const first = runFixture();
  const second = runFixture();
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, first.stdout || "{}\n", "utf8");

  if (first.error || second.error) throw first.error ?? second.error;
  if (first.stdout !== second.stdout) {
    throw new Error("Policy fixture report is not byte-for-byte deterministic");
  }
  if (first.status !== 0 || second.status !== 0) {
    throw new Error(`Policy fixture command failed: ${first.stderr || second.stderr || `exit ${first.status}`}`);
  }
  const report = JSON.parse(first.stdout);
  if (report.status !== "passed" || report.proofEligible !== false) {
    throw new Error("Policy fixture report did not pass its non-proof contract");
  }
  console.log(`Policy fixture regression passed: ${report.total} cases (${report.reportSha256})`);
  console.log(`Report: ${reportPath}`);
} finally {
  if (previousPassphrase === undefined) delete process.env.AMC_VAULT_PASSPHRASE;
  else process.env.AMC_VAULT_PASSPHRASE = previousPassphrase;
  rmSync(workspace, { recursive: true, force: true });
}
