import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";

function runCli(args: string[], cwd: string = process.cwd()) {
  const env = { ...process.env, NO_COLOR: "1" };
  delete env.AMC_VAULT_PASSPHRASE;
  delete env.AMC_VAULT_PASSPHRASE_FILE;
  return spawnSync(process.execPath, [resolve(process.cwd(), "dist/cli.js"), ...args], {
    cwd,
    env,
    encoding: "utf8"
  });
}

describe("ci init --no-sign", () => {
  test("writes an unsigned workflow and policy without a vault passphrase", () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-ci-nosign-"));

    const result = runCli(["ci", "init", "--no-sign", "--agent", "ci-agent"], workspace);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("CI workflow created:");
    expect(result.stdout).toContain("Status: UNSIGNED");
    expect(result.stdout).toContain("not verifier-ready");
    expect(result.stdout).toContain("Signed CI rollout:");
    expect(result.stdout).toContain("AMC_VAULT_PASSPHRASE");
    expect(result.stdout).toContain("re-run `amc ci init --agent ci-agent` without --no-sign");

    const workflow = readFileSync(join(workspace, ".github", "workflows", "amc.yml"), "utf8");
    expect(workflow).toContain("amc gate --bundle .amc/agents/ci-agent/bundles/latest.amcbundle --policy .amc/agents/ci-agent/gatePolicy.json --no-sign");
    expect(workflow).not.toContain("amc bom sign");

    expect(existsSync(join(workspace, ".amc", "agents", "ci-agent", "gatePolicy.json"))).toBe(true);
    expect(existsSync(join(workspace, ".amc", "agents", "ci-agent", "gatePolicy.json.sig"))).toBe(false);
  });

  test("gate help advertises the matching unsigned verification mode", () => {
    const result = runCli(["gate", "--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("--no-sign");
    expect(result.stdout).toContain("Skip gate policy signature verification");
  });

  test("keeps the UX audit aligned with vault-less CI setup", () => {
    const audit = readFileSync(resolve(process.cwd(), "docs/UX_AUDIT_REPORT.md"), "utf8");

    expect(audit).toContain("ci init --no-sign generates unsigned CI policy/workflow");
    expect(audit).toContain("Signed CI setup still requires vault initialization");
    expect(audit).toContain("R22 — signed CI rollout guidance is documented");
    expect(audit).not.toContain("`ci init` still vault-blocked");
    expect(audit).not.toContain("Document signed CI rollout, secret handling, and when to graduate from `--no-sign`");
    expect(audit).not.toContain("Vault blocks ci init");
  });

  test("documents how to graduate from unsigned to signed CI", () => {
    const docs = readFileSync(resolve(process.cwd(), "docs/CI_TEMPLATES.md"), "utf8");

    expect(docs).toContain("## Unsigned Starter vs Signed Rollout");
    expect(docs).toContain("amc ci init --no-sign --agent <agentId>");
    expect(docs).toContain("amc setup");
    expect(docs).toContain("AMC_VAULT_PASSPHRASE");
    expect(docs).toContain("amc ci init --agent <agentId>");
    expect(docs).toContain("Remove `--no-sign` only after");
  });

  test("documents provider-specific signed CI secret setup", () => {
    const docs = readFileSync(resolve(process.cwd(), "docs/CI_TEMPLATES.md"), "utf8");
    const audit = readFileSync(resolve(process.cwd(), "docs/UX_AUDIT_REPORT.md"), "utf8");

    expect(docs).toContain("## Provider-Specific Signed CI Secret Examples");
    expect(docs).toContain("### GitHub Actions");
    expect(docs).toContain("gh secret set AMC_VAULT_PASSPHRASE");
    expect(docs).toContain("${{ secrets.AMC_VAULT_PASSPHRASE }}");
    expect(docs).toContain("### GitLab CI/CD");
    expect(docs).toContain("Settings > CI/CD > Variables");
    expect(docs).toContain("$AMC_VAULT_PASSPHRASE");
    expect(docs).toContain("### CircleCI");
    expect(docs).toContain("circleci env var set AMC_VAULT_PASSPHRASE");
    expect(docs).toContain("AMC_VAULT_PASSPHRASE_FILE");

    expect(audit).toContain("R26 — provider-specific signed CI secret examples are documented");
    expect(audit).not.toContain("Add provider-specific CI secret examples for GitHub, GitLab, and CircleCI");
  });
});
