import { afterEach, describe, expect, test } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { runDoctorRules } from "../src/doctor/doctorRules.js";

const workspaces: string[] = [];

function freshWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), "amc-doctor-fresh-"));
  workspaces.push(workspace);
  return workspace;
}

function runCli(workspace: string, args: string[]) {
  return spawnSync(process.execPath, [resolve(process.cwd(), "dist/cli.js"), ...args], {
    cwd: workspace,
    encoding: "utf8",
    env: {
      ...process.env,
      NO_COLOR: "1",
      AMC_VAULT_PASSPHRASE: ""
    },
    timeout: 20_000
  });
}

afterEach(() => {
  while (workspaces.length > 0) {
    rmSync(workspaces.pop()!, { recursive: true, force: true });
  }
});

describe("fresh-install doctor boundary", () => {
  test("treats a healthy CLI in an uninitialized directory as install-ready", async () => {
    const workspace = freshWorkspace();
    const report = await runDoctorRules(workspace);

    expect(report.ok).toBe(true);
    expect(report.mode).toBe("INSTALL");
    expect(report.workspaceInitialized).toBe(false);
    expect(report.strict).toBe(false);
    expect(report.checks.filter((check) => check.status === "FAIL")).toEqual([]);
    expect(report.checks.find((check) => check.id === "workspace-initialized")).toMatchObject({
      status: "INFO",
      fixHint: "Run: amc"
    });
    expect(report.checks.some((check) => check.id.startsWith("sig-"))).toBe(false);
    expect(report.checks.some((check) => check.id === "gateway-config")).toBe(false);
  });

  test("strict mode fails closed when an initialized workspace is required", async () => {
    const workspace = freshWorkspace();
    const report = await runDoctorRules(workspace, { strict: true });

    expect(report.ok).toBe(false);
    expect(report.mode).toBe("INSTALL");
    expect(report.strict).toBe(true);
    expect(report.checks.filter((check) => check.status === "FAIL").map((check) => check.id)).toEqual([
      "workspace-initialized"
    ]);
    expect(JSON.stringify(report)).not.toContain(workspace);
  });

  test("an initialized workspace with no gateway configuration still fails closed", async () => {
    const workspace = freshWorkspace();
    mkdirSync(join(workspace, ".amc"), { recursive: true });
    writeFileSync(join(workspace, ".amc", "amc.config.yaml"), "{}\n", "utf8");

    const report = await runDoctorRules(workspace);

    expect(report.mode).toBe("WORKSPACE");
    expect(report.workspaceInitialized).toBe(true);
    expect(report.ok).toBe(false);
    expect(report.checks.find((check) => check.id === "workspace-initialized")?.status).toBe("PASS");
    expect(report.checks.find((check) => check.id === "gateway-config")).toMatchObject({
      status: "FAIL",
      message: "Gateway config missing",
      fixHint: "Run: amc gateway init"
    });
    expect(JSON.stringify(report)).not.toContain(workspace);
  });

  test("plain text and JSON use the same install-ready and strict exit contract", () => {
    const workspace = freshWorkspace();

    const text = runCli(workspace, ["doctor"]);
    expect(text.status).toBe(0);
    expect(text.stdout).toContain("Doctor mode: INSTALL");
    expect(text.stdout).toContain("CLI installation is ready");

    const json = runCli(workspace, ["doctor", "--json"]);
    expect(json.status).toBe(0);
    expect(JSON.parse(json.stdout)).toMatchObject({
      ok: true,
      mode: "INSTALL",
      workspaceInitialized: false,
      strict: false
    });

    const strict = runCli(workspace, ["doctor", "--strict", "--json"]);
    expect(strict.status).toBe(1);
    expect(JSON.parse(strict.stdout)).toMatchObject({
      ok: false,
      mode: "INSTALL",
      workspaceInitialized: false,
      strict: true
    });
    expect(strict.stdout).not.toContain(workspace);
    expect(existsSync(join(workspace, ".amc"))).toBe(false);
  });

  test("public onboarding keeps default doctor while deployment guidance requires strict mode", () => {
    const install = readFileSync(resolve(process.cwd(), "website/install.sh"), "utf8");
    const installPowerShell = readFileSync(resolve(process.cwd(), "website/install.ps1"), "utf8");
    const doctor = readFileSync(resolve(process.cwd(), "docs/DOCTOR.md"), "utf8");
    const deployment = readFileSync(resolve(process.cwd(), "docs/DEPLOYMENT_CHECKLIST.md"), "utf8");

    expect(install).toContain("amc --version && amc doctor");
    expect(installPowerShell).toContain("amc --version; amc doctor");
    expect(doctor).toContain("Install readiness");
    expect(doctor).toContain("amc doctor --strict");
    expect(deployment).toContain("amc doctor --strict");
  });
});
