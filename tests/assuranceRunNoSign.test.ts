import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

const roots: string[] = [];
const CLI_TIMEOUT_MS = 90_000;

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-assurance-nosign-"));
  roots.push(dir);
  return dir;
}

function runCli(cwd: string, args: string[]) {
  const env = { ...process.env, NO_COLOR: "1" };
  delete env.AMC_VAULT_PASSPHRASE;
  delete env.AMC_VAULT_PASSPHRASE_FILE;
  delete env.AMC_NO_SIGN;
  return spawnSync(process.execPath, [resolve(process.cwd(), "dist/cli.js"), ...args], {
    cwd,
    env,
    encoding: "utf8",
    timeout: CLI_TIMEOUT_MS
  });
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("assurance run --all --no-sign", () => {
  test("runs all assurance packs without a vault passphrase and marks the run unsigned", () => {
    const dir = workspace();

    const help = runCli(dir, ["assurance", "run", "--help"]);
    expect(help.status, `${help.stdout}\n${help.stderr}`).toBe(0);
    expect(help.stdout).toContain("--no-sign");

    const unsigned = runCli(dir, ["assurance", "run", "--all", "--no-sign"]);
    expect(unsigned.status, `${unsigned.stdout}\n${unsigned.stderr}`).toBe(0);
    expect(unsigned.stdout).toContain("Running without artifact signing");
    expect(unsigned.stdout).toContain("Assurance run complete:");
    expect(unsigned.stdout).toContain("Status: UNSIGNED");
    expect(unsigned.stdout).toContain("Total:");
    expect(unsigned.stdout).not.toContain("Vault locked");
  }, CLI_TIMEOUT_MS);

  test("runs a single pack without a vault passphrase and marks the run unsigned", () => {
    const dir = workspace();

    const unsigned = runCli(dir, ["assurance", "run", "--pack", "injection", "--no-sign"]);

    expect(unsigned.status, `${unsigned.stdout}\n${unsigned.stderr}`).toBe(0);
    expect(unsigned.stdout).toContain("Running without artifact signing");
    expect(unsigned.stdout).toContain("Assurance run complete:");
    expect(unsigned.stdout).toContain("Status: UNSIGNED");
    expect(unsigned.stderr).not.toContain("AMC_VAULT_PASSPHRASE");
  });

  test("runs a short curated demo suite without requiring the full assurance pack set", () => {
    const dir = workspace();

    const help = runCli(dir, ["assurance", "run", "--help"]);
    expect(help.status, `${help.stdout}\n${help.stderr}`).toBe(0);
    expect(help.stdout).toContain("--demo");

    const demo = runCli(dir, ["assurance", "run", "--demo", "--no-sign"]);

    expect(demo.status, `${demo.stdout}\n${demo.stderr}`).toBe(0);
    expect(demo.stdout).toContain("Demo mode: running curated assurance packs");
    expect(demo.stdout).toContain("injection, truthfulness, unsafe_tooling");
    expect(demo.stdout).toContain("Status: UNSIGNED");
    expect(demo.stdout).toContain("Total:");
    expect(demo.stderr).not.toContain("AMC_VAULT_PASSPHRASE");
  });

  test("prints a prioritized remediation plan after a demo run", () => {
    const dir = workspace();

    const demo = runCli(dir, ["assurance", "run", "--demo", "--no-sign"]);

    expect(demo.status, `${demo.stdout}\n${demo.stderr}`).toBe(0);
    expect(demo.stdout).toContain("Remediation priority:");
    expect(demo.stdout).toContain("1. CRITICAL");
    expect(demo.stdout).toContain("injection/");
    expect(demo.stdout).toContain("Fix:");
    expect(demo.stdout).toContain("Evidence:");
    expect(demo.stdout).toContain("Next: amc assurance run --demo --no-sign --verbose");
  });

  test("keeps the UX audit aligned with the current no-sign assurance behavior", () => {
    const audit = readFileSync(resolve(process.cwd(), "docs/UX_AUDIT_REPORT.md"), "utf8");

    expect(audit).toContain("R2 — assurance run --all --no-sign runs unsigned");
    expect(audit).toContain("Signed assurance artifacts still require vault setup");
    expect(audit).toContain("R14 — assurance demo mode runs a short curated no-sign suite");
    expect(audit).toContain("R21 — assurance run prints remediation priority");
    expect(audit).not.toContain("add a shorter demo/curated pack mode");
    expect(audit).not.toContain("Add richer post-run interpretation and recommended remediation order");
    expect(audit).not.toContain("Vault lock still blocks `assurance run --all` with no bypass");
    expect(audit).not.toContain("There is still no `--demo`, `--dry-run`, or `--no-sign` bypass");
  });

  test("documents signed certificate walkthrough and threshold tuning", () => {
    const docs = readFileSync(resolve(process.cwd(), "docs/ASSURANCE_LAB.md"), "utf8");
    const audit = readFileSync(resolve(process.cwd(), "docs/UX_AUDIT_REPORT.md"), "utf8");

    expect(docs).toContain("## Signed Certificate Walkthrough");
    expect(docs).toContain("amc setup");
    expect(docs).toContain("amc assurance run --demo --no-sign");
    expect(docs).toContain("amc assurance run --demo");
    expect(docs).toContain("amc assurance cert issue --run <runId>");
    expect(docs).toContain("amc assurance cert verify .amc/assurance/certificates/latest.amccert");
    expect(docs).toContain("## Policy Threshold Tuning");
    expect(docs).toContain("minRiskAssuranceScore");
    expect(docs).toContain("maxCriticalFindings");
    expect(docs).toContain("maxHighFindings");
    expect(docs).toContain("failClosedIfBelowThresholds");
    expect(docs).toContain("amc assurance policy apply --file .amc/assurance/policy.yaml --reason");
    expect(docs).toContain("Do not relax thresholds to hide known failures");

    expect(audit).toContain("R28 — signed assurance certificate walkthrough and threshold tuning guide are documented");
    expect(audit).not.toContain("Add signed assurance certificate walkthrough and policy threshold tuning guide");
  });
});
