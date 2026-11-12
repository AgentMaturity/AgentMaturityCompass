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

function runCli(cwd: string, args: string[], vaultPassphrase = "") {
  return spawnSync(process.execPath, [join(process.cwd(), "dist", "cli.js"), ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      AMC_VAULT_PASSPHRASE: vaultPassphrase
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
    // The same local vault-backed workspace `amc up` and bare `amc` create, so the same trust boundary: the first score is not INVALID.
    expect(config.security.trustBoundaryMode).toBe("isolated");
  });

  test("init writes the isolated trust boundary; --trust-boundary shared is honoured", () => {
    const isolated = tempRoot();
    const plain = runCli(isolated, ["init"], "synthetic-init-trust-boundary");
    expect(plain.status, plain.stderr || plain.stdout).toBe(0);
    expect(YAML.parse(readFileSync(join(isolated, ".amc", "amc.config.yaml"), "utf8")).security.trustBoundaryMode).toBe("isolated");
    const shared = tempRoot();
    const asked = runCli(shared, ["init", "--minimal", "--trust-boundary", "shared"]);
    expect(asked.status, asked.stderr || asked.stdout).toBe(0);
    expect(YAML.parse(readFileSync(join(shared, ".amc", "amc.config.yaml"), "utf8")).security.trustBoundaryMode).toBe("shared");
  });

  test("init without a terminal or passphrase names every way forward", () => {
    const root = tempRoot();
    const result = runCli(root, ["init"]);
    expect(result.status).toBe(1);
    for (const way of ["AMC_VAULT_PASSPHRASE", "AMC_VAULT_PASSPHRASE_FILE", "--skip-vault", "--minimal"]) expect(result.stderr).toContain(way);
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
    expect(read("docs/archive/AUDIT_50_AGENTS_BATCH5.md")).toContain("Minimal startup path — ✅ Resolved 2026-06-16");
  });
});
