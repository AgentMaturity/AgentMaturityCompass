import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-up-demo-"));
  roots.push(dir);
  return dir;
}

function runCli(cwd: string, args: string[]) {
  const env = { ...process.env, NO_COLOR: "1" };
  delete env.AMC_VAULT_PASSPHRASE;
  delete env.AMC_VAULT_PASSPHRASE_FILE;
  return spawnSync(process.execPath, [resolve(process.cwd(), "dist/cli.js"), ...args], {
    cwd,
    env,
    encoding: "utf8"
  });
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("amc up demo/read-only mode", () => {
  test("advertises a no-vault demo path and dry-runs it without starting sockets", () => {
    const dir = workspace();

    const help = runCli(dir, ["up", "--help"]);
    expect(help.status, `${help.stdout}\n${help.stderr}`).toBe(0);
    expect(help.stdout).toContain("--demo");
    expect(help.stdout).toContain("--read-only");
    expect(help.stdout).toContain("--dry-run");
    expect(help.stdout).toContain("--no-open");

    const plan = runCli(dir, ["up", "--demo", "--dry-run"]);
    expect(plan.status, `${plan.stdout}\n${plan.stderr}`).toBe(0);
    expect(plan.stdout).toContain("AMC Studio demo/read-only mode");
    expect(plan.stdout).toContain("No vault passphrase required");
    expect(plan.stdout).toContain("amc up --demo");
    expect(plan.stdout).toContain("Auto-open: Compass Console after startup");
    expect(plan.stdout).toContain("API examples: Compass Console home > API Quickstart");
    expect(plan.stdout).toContain("Disable auto-open: amc up --demo --no-open");
    expect(plan.stdout).toContain("not verifier-ready");
    expect(plan.stderr).toBe("");
  });

  test("daemon wiring supports host-mode demo startup", () => {
    const cli = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
    const supervisor = readFileSync(resolve(process.cwd(), "src/studio/studioSupervisor.ts"), "utf8");

    expect(cli).toContain("_studio-daemon");
    expect(cli).toContain("--host-dir");
    expect(cli).toContain("--default-workspace-id");
    expect(cli).toContain("openExternalUrl(consoleUrl)");
    expect(supervisor).toContain("startStudioDaemon(workspace: string, options");
    expect(supervisor).toContain("hostDir");
    expect(supervisor).toContain("writeStudioState(params.workspace, state)");
  });

  test("Console home includes copy-paste API quickstart examples for demo users", () => {
    const home = readFileSync(resolve(process.cwd(), "src/console/pages/home.html"), "utf8");
    const app = readFileSync(resolve(process.cwd(), "src/console/assets/app.js"), "utf8");
    const styles = readFileSync(resolve(process.cwd(), "src/console/assets/styles.css"), "utf8");

    expect(home).toContain("Compass Console");
    expect(app).toContain("API Quickstart");
    expect(app).toContain("GET /status");
    expect(app).toContain("GET /api/v1/score/latest");
    expect(app).toContain("POST /api/v1/score/quickscore");
    expect(app).toContain("x-amc-admin-token");
    expect(app).toContain("curl -s");
    expect(app).toContain("Response shape");
    expect(styles).toContain(".api-quickstart-grid");
    expect(styles).toContain(".api-example-card");
  });

  test("keeps the UX audit aligned with the current demo startup behavior", () => {
    const audit = readFileSync(resolve(process.cwd(), "docs/UX_AUDIT_REPORT.md"), "utf8");

    expect(audit).toContain("R4 — amc up --demo starts no-vault exploratory Studio");
    expect(audit).toContain("`amc up --demo --dry-run` previews the ports and no-vault boundary");
    expect(audit).toContain("R15 — up demo opens the Compass Console by default");
    expect(audit).toContain("R33 — demo Console includes API quickstart examples");
    expect(audit).toContain("| 8 | Carlos | API Dev | ⭐⭐ 2/5 | ⭐⭐⭐⭐⭐ 5/5 | +3 | Demo Studio opens the Console with copy-paste API examples, auth headers, endpoint URLs, and response shapes |");
    expect(audit).not.toContain("`amc up` still requires vault passphrase in non-interactive shells");
    expect(audit).not.toContain("No demo/dry-run mode");
    expect(audit).not.toContain("Carlos (⭐⭐⭐⭐) | Add richer API examples inside the demo Console after startup");
  });
});
