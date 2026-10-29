// WP36 (AXR-04, AXR-05, DXB-14, DXC-38): AMC-held secrets never reach a launched process's argv, a model-run shell,
// the SDK child or stored evidence, and a sandboxed run reports the container's real exit status.
// Studio liveness is the only stubbed seam for the adapter run; docker is a fake binary on PATH that records what it got.
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ToolRegistry } from "../src/tools/toolRegistry.js";
import { ToolPipeline } from "../src/tools/toolPipeline.js";
import { bashTool } from "../src/tools/builtin/bashTool.js";
import { stripAmcSecrets, stripProviderKeys } from "../src/utils/providerKeys.js";
import { initWorkspace } from "../src/workspace.js";
import { adaptersConfigureCli } from "../src/adapters/adapterCli.js";
import { runAdapterCommand } from "../src/adapters/adapterRunner.js";
import { openLedger } from "../src/ledger/ledger.js";
import { AMCNativeClient } from "../src/sdk/nativeAgentClient.js";
import { ensureBlobKey } from "../src/storage/blobs/blobKeys.js";

vi.mock("../src/studio/studioSupervisor.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/studio/studioSupervisor.js")>(),
  studioStatus: () => ({ running: true, vaultUnlocked: true,
    state: { host: "127.0.0.1", gatewayPort: 9, proxyPort: 9, dashboardPort: 9 } as never })
}));

const SECRETS = {
  AMC_VAULT_PASSPHRASE: "wp36-vault-passphrase-value",
  AMC_NOTARY_PASSPHRASE: "wp36-notary-passphrase-value",
  AMC_BACKUP_PASSPHRASE: "wp36-backup-passphrase-value",
  AMC_RELEASE_SIGNING_KEY: "wp36-release-signing-key-value",
  GH_TOKEN: "wp36-unlisted-github-token-value"
} as const;

const dirs: string[] = [];
const tempDir = (prefix: string): string => { const dir = mkdtempSync(join(tmpdir(), prefix)); dirs.push(dir); return dir; };
afterEach(() => {
  vi.unstubAllEnvs();
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("DXB-14: the unconfined shell gets an allow-listed environment", () => {
  test("`env` shows none of AMC's secrets nor an unlisted token, and PATH still works", async () => {
    for (const [name, value] of Object.entries(SECRETS)) vi.stubEnv(name, value);
    const workspace = tempDir("amc-wp36-bash-");
    const registry = new ToolRegistry();
    registry.define(bashTool());
    const pipeline = new ToolPipeline({ registry, workspace });
    const outcome = await pipeline.execute({ name: "bash", agentId: "alice", arguments: { command: "env; ls / >/dev/null && echo ls-ok" }, requestedMode: "EXECUTE" });
    expect(outcome.exitCode).toBe(0);
    for (const [name, value] of Object.entries(SECRETS)) {
      expect(outcome.output).not.toContain(name);
      expect(outcome.output).not.toContain(value);
    }
    expect(outcome.output).toMatch(/^PATH=/m);
    expect(outcome.output).toContain("ls-ok");
  });

  test("launched agents (wrap, adapters, probes) lose AMC's own secrets as well as the provider keys", () => {
    const env = stripProviderKeys({ ...SECRETS, AMC_VAULT_PASSPHRASE_FILE: "/x", AMC_NOTARY_AUTH_SECRET: "s", OPENAI_API_KEY: "k", AMC_TOKEN: "agent-bridge-token", PATH: "/bin" });
    expect(Object.keys(env).sort()).toEqual(["AMC_TOKEN", "GH_TOKEN", "PATH"]);
    // A diagnosed runtime that calls its provider directly keeps its own key, never AMC's secrets.
    expect(Object.keys(stripAmcSecrets({ ...SECRETS, OPENAI_API_KEY: "k" })).sort()).toEqual(["GH_TOKEN", "OPENAI_API_KEY"]);
  });
});

describe("AXR-04 / AXR-05: SANDBOX adapter runs", () => {
  function fakeDocker(exitCode: number): { bin: string; out: string } {
    const root = tempDir("amc-wp36-docker-");
    const bin = join(root, "bin"); const out = join(root, "out");
    mkdirSync(bin); mkdirSync(out);
    const script = join(bin, "docker");
    writeFileSync(script, `#!/bin/sh
case "$1" in
  --version) echo "Docker version 0.0.0-fake"; exit 0;;
  run) printf '%s\\n' "$@" > '${out}/argv'; env > '${out}/env'; exit ${exitCode};;
esac
exit 0
`);
    chmodSync(script, 0o755);
    return { bin, out };
  }

  function sandboxWorkspace(): string {
    const workspace = tempDir("amc-wp36-sbx-");
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    adaptersConfigureCli({ workspace, agentId: "default", adapterId: "generic-cli", route: "/openai", model: "fixture-model", mode: "SANDBOX" });
    // A fresh workspace creates its blob key on the first non-inline row, which rewrites the vault mid-launch and
    // (correctly) ends the lease's vault continuity. A workspace that has stored evidence before already has one.
    ensureBlobKey(workspace);
    return workspace;
  }

  test("the container's nonzero exit is the run's exit code", async () => {
    vi.stubEnv("AMC_VAULT_PASSPHRASE", SECRETS.AMC_VAULT_PASSPHRASE);
    const docker = fakeDocker(3);
    vi.stubEnv("PATH", `${docker.bin}:${process.env.PATH ?? ""}`);
    const workspace = sandboxWorkspace();
    const result = await runAdapterCommand({ workspace, agentId: "default", adapterId: "generic-cli", mode: "SANDBOX", command: ["node", "-e", "process.exit(3)"] });
    expect(result.exitCode).toBe(3);
  });

  test("the lease is in no argv or ledger row; only adapter keys enter the container; the attestation names keys and the lease id", async () => {
    for (const [name, value] of Object.entries(SECRETS)) vi.stubEnv(name, value);
    const docker = fakeDocker(0);
    vi.stubEnv("PATH", `${docker.bin}:${process.env.PATH ?? ""}`);
    const workspace = sandboxWorkspace();
    const result = await runAdapterCommand({ workspace, agentId: "default", adapterId: "generic-cli", mode: "SANDBOX", command: ["node", "-v"] });
    expect(result.exitCode).toBe(0);

    const dockerEnv = readFileSync(join(docker.out, "env"), "utf8");
    const lease = /^AMC_LEASE=(.+)$/m.exec(dockerEnv)?.[1];
    expect(lease, "docker receives the lease through its inherited environment").toBeTruthy();
    const argv = readFileSync(join(docker.out, "argv"), "utf8");
    expect(argv).not.toContain(lease!);
    const names = argv.split("\n").flatMap((line, i, all) => all[i - 1] === "-e" ? [line.split("=")[0]!] : []);
    expect(names).toContain("AMC_LEASE");
    for (const name of [...Object.keys(SECRETS), "PATH", "HOME"]) expect(names, name).not.toContain(name);

    const ledger = openLedger(workspace);
    try {
      const rows = ledger.getAllEvents();
      for (const row of rows) {
        expect(row.payload_inline ?? "").not.toContain(lease!);
        expect(row.meta_json).not.toContain(lease!);
        for (const value of Object.values(SECRETS)) expect(`${row.payload_inline ?? ""}${row.meta_json}`).not.toContain(value);
      }
      const attestation = rows.map((row) => JSON.parse(row.meta_json) as Record<string, unknown>)
        .find((meta) => meta.auditType === "SANDBOX_EXECUTION_ENABLED");
      expect(attestation?.envKeys).toContain("AMC_LEASE");
      expect(attestation?.leaseId).toMatch(/^lease_[0-9a-f]+$/);
    } finally { ledger.close(); }
  });
});

describe("DXC-38: the SDK child gets an explicit environment by default", () => {
  async function childEnv(options: { env?: NodeJS.ProcessEnv; inheritEnv?: boolean }): Promise<Record<string, string>> {
    const dir = tempDir("amc-wp36-sdk-");
    const dump = join(dir, "env.json");
    const script = join(dir, "child.mjs");
    writeFileSync(script, `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(dump)}, JSON.stringify(process.env)); process.exit(0);\n`);
    await expect(AMCNativeClient.start({ workspace: dir, provider: "stub", command: [process.execPath, script], timeoutMs: 5_000, ...options } as never)).rejects.toThrow();
    expect(existsSync(dump)).toBe(true);
    return JSON.parse(readFileSync(dump, "utf8")) as Record<string, string>;
  }

  test("an unlisted parent variable is not inherited; explicit env, PATH and the runtime's own AMC_* settings are", async () => {
    vi.stubEnv("OPENAI_API_KEY", "wp36-parent-only-openai-key");
    vi.stubEnv("GH_TOKEN", SECRETS.GH_TOKEN);
    // The child is the AMC runtime, which signs its evidence with the vault: AMC's own settings are its to read.
    vi.stubEnv("AMC_VAULT_PASSPHRASE", SECRETS.AMC_VAULT_PASSPHRASE);
    const env = await childEnv({ env: { WP36_EXPLICIT: "yes" } });
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.GH_TOKEN).toBeUndefined();
    expect(env.WP36_EXPLICIT).toBe("yes");
    expect(env.PATH).toBe(process.env.PATH);
    expect(env.AMC_VAULT_PASSPHRASE).toBe(SECRETS.AMC_VAULT_PASSPHRASE);
  });

  test("inheritEnv: true opts in to the parent environment", async () => {
    vi.stubEnv("WP36_PARENT_ONLY", "inherited");
    const env = await childEnv({ inheritEnv: true });
    expect(env.WP36_PARENT_ONLY).toBe("inherited");
  });
});

describe("every secret-looking AMC_* variable the source reads stays out of model commands and the SDK child", () => {
  // Found independently of AMC's own pattern: a name that looks like a credential, less protocol tags, digests,
  // public keys, diagnostic codes and redaction markers, which are not environment variables.
  const looksSecret = /PASSPHRASE|PASSWORD|SECRET|PRIVATE_KEY|SIGNING_KEY|API_KEY|LICENSE_KEY|TOKEN|AUTH_|CREDENTIALS_FILE|LEASE$/;
  const notEnv = /_V\d+(_|$)|SHA256|PUBLIC_KEY|PUBKEY|REDACTED|^AMC_CREDENTIAL_|^AMC_SECRET_ENV_PATTERN$|_$/;
  const sourceNames = (): string[] => {
    const names = new Set<string>();
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name.endsWith(".ts")) for (const match of readFileSync(path, "utf8").matchAll(/\bAMC_[A-Z0-9_]+/g)) names.add(match[0]);
      }
    };
    walk(join(import.meta.dirname, "..", "src"));
    return [...names].filter((name) => looksSecret.test(name) && !notEnv.test(name)).sort();
  };
  // The SDK child is the AMC runtime: it signs with the vault and reads the credential store (documented exemption).
  const RUNTIME_CHILD_EXEMPT = ["AMC_CREDENTIALS_FILE", "AMC_VAULT_PASSPHRASE", "AMC_VAULT_PASSPHRASE_FILE"];

  test("the scan finds AMC's secrets, and wrapped agents keep only the agent-facing AMC_TOKEN", () => {
    const names = sourceNames();
    expect(names.length).toBeGreaterThanOrEqual(30);
    for (const name of ["AMC_VAULT_PASSPHRASE", "AMC_RELEASE_SIGNING_KEY", "AMC_INDUSTRY_PACKS_LICENSE_PRIVATE_KEY", "AMC_DD_API_KEY", "AMC_A4_SESSION_TOKEN_FILE"]) {
      expect(names).toContain(name);
    }
    const kept = Object.keys(stripProviderKeys(Object.fromEntries(names.map((name) => [name, "v"]))));
    expect(kept).toEqual(["AMC_TOKEN"]);
  });

  test("none reaches an unconfined bash command; only the runtime's own vault and credential path reach the SDK child", async () => {
    const names = sourceNames();
    const value = (name: string): string => `wp36-scan-${name.toLowerCase()}`;
    for (const name of names) vi.stubEnv(name, value(name));
    const workspace = tempDir("amc-wp36-scan-");
    const registry = new ToolRegistry();
    registry.define(bashTool());
    const outcome = await new ToolPipeline({ registry, workspace }).execute({ name: "bash", agentId: "alice", arguments: { command: "env" }, requestedMode: "EXECUTE" });
    for (const name of names) expect(outcome.output, name).not.toContain(value(name));

    const dir = tempDir("amc-wp36-scan-sdk-");
    const dump = join(dir, "env.json"), script = join(dir, "child.mjs");
    writeFileSync(script, `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(dump)}, JSON.stringify(process.env)); process.exit(0);\n`);
    await expect(AMCNativeClient.start({ workspace: dir, provider: "stub", command: [process.execPath, script], timeoutMs: 5_000 } as never)).rejects.toThrow();
    const childEnv = JSON.parse(readFileSync(dump, "utf8")) as Record<string, string>;
    const reached = names.filter((name) => childEnv[name] !== undefined);
    expect(reached).toEqual(RUNTIME_CHILD_EXEMPT.filter((name) => names.includes(name)));
  });
});
