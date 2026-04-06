import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadGatewayConfig: vi.fn(() => ({
    listen: { port: 3210 },
    proxy: { port: 3211 },
    routes: [{ prefix: "/openai" }]
  })),
  readStudioState: vi.fn(() => ({ gatewayPort: 3210, proxyPort: 3211 })),
  loadAdaptersConfig: vi.fn(() => ({ adapters: { perAgent: {} } })),
  loadAgentConfig: vi.fn(() => ({ provider: { routePrefix: "/anthropic" } })),
  latestActiveWorkOrder: vi.fn(() => ({ workOrderId: "wo-1" })),
  issueLeaseForCli: vi.fn(() => ({ token: "lease-token-1" })),
  workspaceIdFromDirectory: vi.fn(() => "ws-1"),
  resolveAgentId: vi.fn((_workspace: string, agentId?: string) => agentId ?? "default"),
  getBuiltInAdapter: vi.fn(() => ({ envStrategy: { leaseCarrier: "ENV_API_KEY" } })),
  inquirerPrompt: vi.fn(async () => ({ mode: "sandbox" })),

  verifyGatewayConfigSignature: vi.fn(() => ({ valid: false, reason: "tampered", configPath: "gateway.yaml", sigPath: "gateway.sig" })),
  signGatewayConfig: vi.fn(() => "gateway.sig.new"),
  verifyActionPolicySignature: vi.fn(() => ({ valid: false, reason: "tampered", path: "action.yaml", sigPath: "action.sig" })),
  signActionPolicy: vi.fn(() => "action.sig.new"),
  verifyToolsConfigSignature: vi.fn(() => ({ valid: true, reason: null, path: "tools.yaml", sigPath: "tools.sig" })),
  signToolsConfig: vi.fn(() => "tools.sig.new"),
  verifyFleetConfigSignature: vi.fn(() => ({ valid: false, reason: "tampered", path: "fleet.yaml", sigPath: "fleet.sig" })),
  signFleetConfig: vi.fn(() => ({ sigPath: "fleet.sig.new" })),
  verifyAgentConfigSignature: vi.fn(() => ({ valid: false, reason: "tampered", configPath: "agent.yaml", sigPath: "agent.sig" })),
  signAgentConfig: vi.fn(() => ({ sigPath: "agent.sig.new" })),
  openLedger: vi.fn(() => ({
    startSession: mocks.startSession,
    appendEvidenceWithReceipt: mocks.appendEvidenceWithReceipt,
    sealSession: mocks.sealSession,
    close: mocks.closeLedger
  })),
  startSession: vi.fn(),
  appendEvidenceWithReceipt: vi.fn(() => ({ id: "audit-event-1" })),
  sealSession: vi.fn(),
  closeLedger: vi.fn(),
  sha256Hex: vi.fn(() => "a".repeat(64)),
  spawn: vi.fn()
}));

vi.mock("../src/gateway/config.js", () => ({
  loadGatewayConfig: mocks.loadGatewayConfig,
  verifyGatewayConfigSignature: mocks.verifyGatewayConfigSignature,
  signGatewayConfig: mocks.signGatewayConfig
}));
vi.mock("../src/studio/studioState.js", () => ({ readStudioState: mocks.readStudioState }));
vi.mock("../src/adapters/adapterConfigStore.js", () => ({ loadAdaptersConfig: mocks.loadAdaptersConfig }));
vi.mock("../src/fleet/registry.js", () => ({
  loadAgentConfig: mocks.loadAgentConfig,
  verifyFleetConfigSignature: mocks.verifyFleetConfigSignature,
  verifyAgentConfigSignature: mocks.verifyAgentConfigSignature,
  signFleetConfig: mocks.signFleetConfig,
  signAgentConfig: mocks.signAgentConfig
}));
vi.mock("../src/workorders/workorderEngine.js", () => ({ latestActiveWorkOrder: mocks.latestActiveWorkOrder }));
vi.mock("../src/leases/leaseCli.js", () => ({ issueLeaseForCli: mocks.issueLeaseForCli }));
vi.mock("../src/workspaces/workspaceId.js", () => ({ workspaceIdFromDirectory: mocks.workspaceIdFromDirectory }));
vi.mock("../src/fleet/paths.js", () => ({ resolveAgentId: mocks.resolveAgentId }));
vi.mock("../src/adapters/registry.js", () => ({ getBuiltInAdapter: mocks.getBuiltInAdapter }));
vi.mock("inquirer", () => ({ default: { prompt: mocks.inquirerPrompt } }));
vi.mock("../src/governor/actionPolicyEngine.js", () => ({
  verifyActionPolicySignature: mocks.verifyActionPolicySignature,
  signActionPolicy: mocks.signActionPolicy
}));
vi.mock("../src/toolhub/toolhubValidators.js", () => ({
  verifyToolsConfigSignature: mocks.verifyToolsConfigSignature,
  signToolsConfig: mocks.signToolsConfig
}));
vi.mock("../src/ledger/ledger.js", () => ({ openLedger: mocks.openLedger }));
vi.mock("../src/utils/hash.js", () => ({ sha256Hex: mocks.sha256Hex }));
vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<any>("node:child_process");
  return { ...actual, spawn: mocks.spawn };
});

import { buildConnectInstructions } from "../src/studio/connectWizard.js";
import { execCliCommand, validateCliExec } from "../src/studio/cliBridge.js";
import { fixSignatures, inspectSignatures } from "../src/studio/signatures.js";

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-studio-utils-test-"));
  roots.push(dir);
  return dir;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadGatewayConfig.mockReturnValue({
    listen: { port: 3210 },
    proxy: { port: 3211 },
    routes: [{ prefix: "/openai" }]
  });
  mocks.readStudioState.mockReturnValue({ gatewayPort: 3210, proxyPort: 3211 });
  mocks.loadAdaptersConfig.mockReturnValue({ adapters: { perAgent: {} } });
  mocks.loadAgentConfig.mockReturnValue({ provider: { routePrefix: "/anthropic" } });
  mocks.latestActiveWorkOrder.mockReturnValue({ workOrderId: "wo-1" });
});

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("studio connect wizard", () => {
  test("builds adapter-specific connect instructions with env carrier hint", async () => {
    mocks.loadAdaptersConfig.mockReturnValue({
      adapters: {
        perAgent: {
          "agent-1": {
            preferredAdapter: "openai-adapter",
            preferredProviderRoute: "/openai"
          }
        }
      }
    });

    const out = await buildConnectInstructions({ workspace: workspace(), agentId: "agent-1", mode: "supervise" });
    expect(out.adapterId).toBe("openai-adapter");
    expect(out.routeUrl).toBe("http://127.0.0.1:3210/openai");
    expect(out.command).toContain("amc adapters run --agent agent-1 --adapter openai-adapter");
    expect(out.leaseCarrierHint).toContain("API key env vars");
    expect(out.envLines.some((line) => line.includes("AMC_LEASE=lease-token-1"))).toBe(true);
    expect(out.workOrderId).toBe("wo-1");
  });

  test("prompts for mode and falls back to gateway route when agent config load fails", async () => {
    mocks.loadAgentConfig.mockImplementation(() => {
      throw new Error("no agent config");
    });

    const out = await buildConnectInstructions({ workspace: workspace(), agentId: "agent-2" });
    expect(mocks.inquirerPrompt).toHaveBeenCalled();
    expect(out.mode).toBe("sandbox");
    expect(out.routeUrl).toBe("http://127.0.0.1:3210/openai");
    expect(out.command).toContain("amc sandbox run --agent agent-2");
    expect(out.leaseCarrierHint).toContain("Authorization Bearer");
  });
});

describe("studio cli bridge", () => {
  test("validateCliExec blocks dangerous, interactive, and shell metacharacter commands", () => {
    expect(validateCliExec({ command: "vault seal" })).toContain("requires confirm:true");
    expect(validateCliExec({ command: "quickscore" })).toContain("cannot run headless");
    expect(validateCliExec({ command: "run; rm -rf /" })).toContain("disallowed shell characters");
    expect(validateCliExec({ command: "help" })).toBeNull();
  });

  test("execCliCommand validates early without spawning", async () => {
    const result = await execCliCommand(workspace(), { command: "vault seal" });
    expect(result.ok).toBe(false);
    expect(result.stderr).toContain("requires confirm:true");
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  test("execCliCommand spawns AMC CLI, appends json flag and args, and parses structured output", async () => {
    const listeners: Record<string, Function[]> = {};
    const child = {
      stdout: { on: vi.fn((event: string, fn: Function) => { (listeners[`stdout:${event}`] ??= []).push(fn); }) },
      stderr: { on: vi.fn((event: string, fn: Function) => { (listeners[`stderr:${event}`] ??= []).push(fn); }) },
      on: vi.fn((event: string, fn: Function) => { (listeners[event] ??= []).push(fn); })
    };
    mocks.spawn.mockReturnValue(child as any);

    const promise = execCliCommand(workspace(), {
      command: "score report run-1",
      format: "json",
      args: { agent: "agent-1", json: "true" }
    });

    for (const fn of listeners["stdout:data"] ?? []) fn(Buffer.from('{"ok":true,"value":1}'));
    for (const fn of listeners["stderr:data"] ?? []) fn(Buffer.from("warning"));
    for (const fn of listeners["close"] ?? []) fn(0);
    const result = await promise;

    expect(result.ok).toBe(true);
    expect(result.structured).toEqual({ ok: true, value: 1 });
    const args = mocks.spawn.mock.calls[0]?.[1] as string[];
    expect(args.some((part) => part.endsWith("dist/cli.js"))).toBe(true);
    expect(args).toContain("score");
    expect(args).toContain("report");
    expect(args).toContain("run-1");
    expect(args).toContain("--json");
    expect(args).toContain("--agent");
    expect(args).toContain("agent-1");
  });
});

describe("studio signatures", () => {
  test("inspectSignatures reports statuses and fixSignatures resigns invalid configs with audit", () => {
    const ws = workspace();
    const inspected = inspectSignatures(ws, "agent-1");
    expect(inspected.agentId).toBe("agent-1");
    expect(inspected.statuses.map((row) => row.kind)).toEqual(["gateway", "action-policy", "tools", "fleet", "agent"]);

    const fixed = fixSignatures(ws, "agent-1");
    expect(fixed.resigned.map((row) => row.kind)).toEqual(["gateway", "action-policy", "fleet", "agent"]);
    expect(fixed.auditEventId).toBe("audit-event-1");
    expect(mocks.startSession).toHaveBeenCalled();
    expect(mocks.appendEvidenceWithReceipt).toHaveBeenCalled();
  });
});
