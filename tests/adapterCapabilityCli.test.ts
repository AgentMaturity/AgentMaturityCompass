import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, test } from "vitest";
import { adaptersConfigureCli, adaptersInitCli } from "../src/adapters/adapterCli.js";
import { verifyAdapterCapabilityReceipt } from "../src/passport/adapterCapabilityReceipt.js";
import { initWorkspace } from "../src/workspace.js";

const roots: string[] = [];
const cliPath = resolve(process.cwd(), "dist/cli.js");

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-adapter-capability-cli-"));
  roots.push(root);
  process.env.AMC_VAULT_PASSPHRASE = "adapter-capability-cli-passphrase";
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  adaptersInitCli(root);
  adaptersConfigureCli({
    workspace: root,
    agentId: "cli-agent",
    adapterId: "claude-cli",
    route: "/anthropic",
    model: "claude-test",
    mode: "SUPERVISE"
  });
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  const claude = join(bin, "claude");
  writeFileSync(claude, "#!/bin/sh\necho 'claude 2.1.50'\n", { mode: 0o755 });
  chmodSync(claude, 0o755);
  return root;
}

function run(cwd: string, args: string[]): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${join(cwd, "bin")}:${process.env.PATH ?? ""}`,
      NO_COLOR: "1",
      AMC_VAULT_PASSPHRASE: "adapter-capability-cli-passphrase"
    },
    timeout: 30_000
  });
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("amc adapters capabilities CLI", () => {
  test("appears in help and emits one parseable signed JSON document", () => {
    expect(existsSync(cliPath)).toBe(true);
    const cwd = workspace();
    const help = run(cwd, ["adapters", "--help"]);
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("capabilities");

    const result = run(cwd, [
      "adapters",
      "capabilities",
      "--agent",
      "cli-agent",
      "--adapter",
      "claude-cli",
      "--json"
    ]);
    expect(result.status).toBe(0);
    const receipt = JSON.parse(result.stdout);
    expect(receipt).toMatchObject({
      receiptVersion: "amc.adapter-capability-receipt.v1",
      subject: { agentId: "cli-agent", adapterId: "claude-cli" },
      inspection: {
        runtime: { status: "detected", version: "2.1.50" },
        configuration: { status: "signed_selected" },
        hook: { status: "not_installed" }
      },
      verification: { status: "partial", reasons: ["hook:not-installed"] }
    });
    expect(verifyAdapterCapabilityReceipt(receipt, { workspace: cwd }).valid).toBe(true);
  });

  test("writes the same receipt contract without leaking sensitive fields", () => {
    const cwd = workspace();
    const out = join(cwd, "proof", "adapter-capabilities.json");
    const result = run(cwd, [
      "adapters",
      "capabilities",
      "--agent",
      "cli-agent",
      "--adapter",
      "claude-cli",
      "--out",
      out
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(out);
    const body = readFileSync(out, "utf8");
    const receipt = JSON.parse(body);
    expect(verifyAdapterCapabilityReceipt(receipt, { workspace: cwd }).valid).toBe(true);
    expect(body).not.toMatch(/rawInput|tool_input|transcript_path|"cwd"|AMC_VAULT_PASSPHRASE|SECRET/);
  });
});
