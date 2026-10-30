import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Command } from "commander";
import { afterEach, describe, expect, test, vi } from "vitest";
import { registerAcpCommands } from "../src/acp/acpCli.js";
import * as acp from "../src/acp/acpStdioMain.js";
import { AMCNativeClient } from "../src/sdk/nativeAgentClient.js";
import { readNativeSessionEvents } from "../src/session/readNativeSessionEvents.js";
import { readAgentRunSummary, verifyAgentRun } from "../src/agent/runReport.js";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";

// The scripted ACP peer proves subprocess argv only. The final test uses the
// built SDK and real native stub runtime, with no tools or repair execution.
const PEER = String.raw`
import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
const capture = process.argv[2];
createInterface({ input: process.stdin }).on('line', line => {
  const frame = JSON.parse(line);
  writeFileSync(capture, JSON.stringify({ method: frame.method, argv: process.argv.slice(3) }));
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: frame.id, result: {
    protocolVersion: 1, agentInfo: { name: 'agent-maturity-compass' },
    agentCapabilities: { _meta: { 'dev.agentmaturity.amc': { executionApi: 1 } } }
  } }) + '\n');
});
`;
const policy = { maxRounds: 1, maxRequests: 2, maxTokens: 256, timeoutMs: 5000, allowedEditPaths: ["calculation.txt"] };
const roots: string[] = [], clients: AMCNativeClient[] = [];
afterEach(async () => {
  try { for (const client of clients.splice(0)) await client.close(); }
  finally {
    vi.restoreAllMocks(); vi.unstubAllEnvs();
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  }
});
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-validation-repair-sdk-"))); roots.push(root);
  const checks = join(root, "checks.json"), peer = join(root, "peer.mjs"), capture = join(root, "captured.json");
  writeFileSync(checks, JSON.stringify({ schemaVersion: 1, checks: [
    { id: "public", title: "Public check", command: "printf unexpected > must-not-run", timeoutMs: 1000 }
  ] }));
  writeFileSync(join(root, "calculation.txt"), "broken\n"); writeFileSync(peer, PEER);
  const sha256 = createHash("sha256").update(readFileSync(checks)).digest("hex");
  return { root, checks, peer, capture, sha256 };
}
const option = (argv: readonly string[], flag: string) => { const at = argv.indexOf(flag); return at < 0 ? undefined : argv[at + 1]; };

describe("native SDK and ACP repair policy forwarding", () => {
  test.each([undefined, JSON.stringify(policy, null, 2)])("SDK preserves explicit policy argv without inventing an absent policy: %s", async validationRepair => {
    const f = fixture();
    const client = await AMCNativeClient.start({ workspace: f.root, provider: "stub", validationConfig: f.checks,
      validationConfigSha256: f.sha256, validate: ["public"], validationRepair,
      command: [process.execPath, f.peer, f.capture], timeoutMs: 5000 });
    clients.push(client);
    const observed = JSON.parse(readFileSync(f.capture, "utf8")) as { method: string; argv: string[] };
    expect(observed.method).toBe("initialize");
    expect(option(observed.argv, "--validation-repair")).toBe(validationRepair);
    expect(option(observed.argv, "--validation-config")).toBe(f.checks);
    expect(option(observed.argv, "--validation-config-sha256")).toBe(f.sha256);
    expect(option(observed.argv, "--validate")).toBe("public");
  });

  test.each([undefined, ""])("SDK requires an explicit config before spawning a child for repair: %s", async validationConfig => {
    const f = fixture();
    const starting = AMCNativeClient.start({ workspace: f.root, provider: "stub", validationConfig,
      validationRepair: JSON.stringify(policy), command: [process.execPath, f.peer, f.capture], timeoutMs: 5000 });
    void starting.then(client => clients.push(client), () => {});
    await expect(starting).rejects.toThrow("explicit operator config file");
    expect(existsSync(f.capture)).toBe(false);
  });

  test("existing ACP command forwards operator policy and validation pins to the shared startup admission", async () => {
    const f = fixture(), validationRepair = JSON.stringify(policy);
    const start = vi.spyOn(acp, "startAcpStdio").mockReturnValue({ agent: {} as acp.AcpStdioHandle["agent"], close: async () => {} });
    // The fake runtime owns no process resources; avoid installing signal handlers.
    vi.spyOn(process, "on").mockReturnValue(process);
    const program = new Command().exitOverride().configureOutput({ writeErr: () => {} });
    registerAcpCommands(program);
    await program.parseAsync(["acp", "--provider", "stub", "--validation-config", f.checks,
      "--validation-config-sha256", f.sha256, "--validate", "public", "--validation-repair", validationRepair], { from: "user" });
    expect(start).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ validationConfig: f.checks,
      validationConfigSha256: f.sha256, validate: ["public"], validationRepair }));
  });

  test("built SDK admits the policy into signed evidence while unavailable tools prevent validation and repair effects", async () => {
    const f = fixture(), workspace = join(f.root, "workspace"), home = join(f.root, "home");
    mkdirSync(workspace); mkdirSync(home); writeFileSync(join(workspace, "calculation.txt"), "broken\n");
    const pass = "synthetic-native-validation-repair-sdk";
    vi.stubEnv("AMC_VAULT_PASSPHRASE", pass);
    vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(f.root, "checkpoints"));
    initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" }); initBudgets(workspace, "default");
    const { AMCNativeClient: BuiltClient } = await import(pathToFileURL(resolve("dist/sdk/nativeAgentClient.js")).href) as typeof import("../src/sdk/nativeAgentClient.js");
    const client = await BuiltClient.start({ workspace, provider: "stub", tools: "none", timeoutMs: 60000,
      validationConfig: f.checks, validationConfigSha256: f.sha256, validate: ["public"], validationRepair: JSON.stringify(policy),
      env: { HOME: home, PATH: process.env.PATH, AMC_VAULT_PASSPHRASE: pass,
        AMC_CONTROL_CHECKPOINT_DIR: join(f.root, "checkpoints"), NO_COLOR: "1" } });
    clients.push(client);
    const session = await client.newSession(), result = await session.prompt("Complete this synthetic task.").result;
    expect(result.stopReason).toBe("end_turn"); expect(result.verification).toBe("not-verified");
    expect(result.validation.status).toBe("unavailable");
    await client.close();
    const rows = readNativeSessionEvents(workspace, session.sessionId);
    const repair = rows.filter(row => JSON.parse(row.meta_json).kind === "native-validation-repair");
    expect(repair.map(row => JSON.parse(row.meta_json).phase)).toEqual(["requested", "stopped"]);
    expect(JSON.parse(repair[0]!.meta_json)).toMatchObject({ policy, configSha256: f.sha256, independentCorrectness: "not-evaluated" });
    expect(JSON.parse(repair[1]!.meta_json)).toMatchObject({ rounds: 0, reason: "validation-unavailable" });
    const summary = readAgentRunSummary(workspace, session.sessionId, "idle");
    expect(summary.validation).toEqual(result.validation); expect(summary.toolCalls).toBe(0);
    expect(existsSync(join(workspace, "must-not-run"))).toBe(false);
    const verified = await verifyAgentRun(workspace, session.sessionId);
    expect(verified.ok, JSON.stringify(verified)).toBe(true);
  }, 120000);
});
