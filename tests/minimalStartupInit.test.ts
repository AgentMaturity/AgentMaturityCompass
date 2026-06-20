import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, test } from "vitest";
import YAML from "yaml";

const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-minimal-startup-"));
  roots.push(root);
  return root;
}

function runCli(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [join(process.cwd(), "dist", "cli.js"), ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      AMC_VAULT_PASSPHRASE: ""
    }
  });
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("minimal startup setup", () => {
  test("init --minimal creates a startup workspace without requiring an external vault passphrase", () => {
    const root = tempRoot();
    const result = runCli(root, ["init", "--minimal"]);

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toContain("Minimal startup workspace initialized");
    expect(result.stdout).toContain("amc quickscore --rapid");
    expect(result.stdout).not.toContain("Generate the full AMC score now?");
    expect(existsSync(join(root, ".amc", "amc.config.yaml"))).toBe(true);

    const config = YAML.parse(readFileSync(join(root, ".amc", "amc.config.yaml"), "utf8"));
    expect(config.profile).toBe("dev");
    expect(config.supervise.extraEnv.AMC_ENV).toBe("dev");
  });

  test("quickstart --minimal uses the same non-interactive startup path", () => {
    const root = tempRoot();
    const result = runCli(root, ["quickstart", "--minimal", "--profile", "ci"]);

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toContain("Startup path: creating a minimal workspace");
    expect(result.stdout).toContain("Minimal startup workspace initialized");

    const config = YAML.parse(readFileSync(join(root, ".amc", "amc.config.yaml"), "utf8"));
    expect(config.profile).toBe("ci");
    expect(config.security.trustBoundaryMode).toBe("isolated");
    expect(config.supervise.extraEnv.CI).toBe("true");
  });

  test("docs and generated command references expose the minimal startup path", () => {
    const read = (path: string): string => readFileSync(join(process.cwd(), path), "utf8");

    expect(read("README.md")).toContain("amc init --minimal");
    expect(read("docs/GETTING_STARTED.md")).toContain("amc quickstart --minimal");
    expect(read("docs/QUICKSTART.md")).toContain("amc init --minimal");
    expect(read("docs/CLI_COMMAND_INVENTORY.md")).toContain("`--minimal`");
    expect(read("docs/API_REFERENCE.md")).toContain("#### `amc init`");
    expect(read("docs/AUDIT_50_AGENTS_BATCH5.md")).toContain("Minimal startup path — ✅ Resolved 2026-06-16");
  });
});
