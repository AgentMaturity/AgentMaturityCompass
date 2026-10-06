import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { agentToolset, checkToolsetReadiness } from "../src/agent/agentToolset.js";
import { NATIVE_DELEGATION_CAPABILITIES, selectSupportedNativeTools } from "../src/agent/nativeToolCapabilities.js";
import { defaultToolsConfig, type ToolDefinition } from "../src/toolhub/toolsSchema.js";
import { initToolsConfig, loadVerifiedToolsConfigSnapshot, toolsConfigPath } from "../src/toolhub/toolhubValidators.js";
import { SessionService } from "../src/session/sessionService.js";
import { extractEnvelope } from "../src/session/sessionTypes.js";
import { openLedger } from "../src/ledger/ledger.js";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";

const cleanups: Array<() => void> = [];
const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); vi.unstubAllEnvs(); });
/**
 * Pin the host-dependent native shell (P0-06): macOS with the explicit opt-in
 * registers the shell on every host, so a guessed shell call reaches the signed
 * allowlist instead of depending on whether this machine has Bubblewrap.
 */
function fixture(allowedTools: ToolDefinition[], mode?: "code", unconfinedShellHost = false) {
  if (unconfinedShellHost) {
    Object.defineProperty(process, "platform", { ...platform, value: "darwin" });
    cleanups.push(() => Object.defineProperty(process, "platform", platform));
  }
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-native-subset-passphrase");
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-signed-subset-")));
  cleanups.push(() => rmSync(workspace, { recursive: true, force: true }));
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  initBudgets(workspace, "default"); writeRuntimeFirewallPolicy({ workspace, mode: "observe" });
  const config = defaultToolsConfig(); config.tools.allowedTools = allowedTools;
  // Absence must still mean no native capability, even in a legacy permissive policy.
  config.tools.denyByDefault = false; initToolsConfig(workspace, config);
  mkdirSync(join(workspace, "workspace"), { recursive: true });
  writeFileSync(join(workspace, "workspace", "review.txt"), "read-only review fixture");
  const session = new SessionService(workspace);
  session.open({ agentId: "default", harnessVersion: "subset-fixture", compositionDigest: "fixture", policyDigest: "fixture" });
  session.startTurn({ trigger: "user" }); session.startStep();
  const tools = agentToolset({ workspace, agentId: "default", sessionId: session.sessionId, recorder: session, ...(mode ? { mode } : {}),
    ...(unconfinedShellHost ? { unconfinedShell: "cli-flag" as const } : {}) });
  cleanups.push(() => { tools.close(); session.disposeWithoutClosing(); });
  let sequence = 0;
  return { workspace, config, tools, session, names: () => tools.seam.schemas()?.map(tool => tool.name).sort() ?? [],
    call: (name: string, args: object) => tools.seam.execute({ callId: `subset-${++sequence}`, toolName: name,
      rawArguments: JSON.stringify(args), sessionId: session.sessionId, turn: 1, step: 1, parentToken: null,
      dispatch: "native", signal: new AbortController().signal }) };
}
const read: ToolDefinition = { name: "fs.read", actionClass: "READ_ONLY", allow: { paths: ["./workspace/**"] } };

test("a signed read subset is ready without writes, while guessed writes and shell calls are signed denials", async () => {
  const f = fixture([read, { name: "glob", actionClass: "READ_ONLY" }, { name: "grep", actionClass: "READ_ONLY" }], undefined, true);
  const original = readFileSync(toolsConfigPath(f.workspace));
  expect(f.tools.readiness.ready).toBe(true); expect(f.tools.readiness.writeScope).toEqual([]);
  expect(f.names()).toEqual(["fs.read", "glob", "grep"]);
  const result = await f.call("fs.read", { path: "workspace/review.txt" });
  expect(result).toMatchObject({ outcome: "OK", content: "read-only review fixture" });
  expect((await f.call("fs.write", { path: "workspace/forbidden.txt", content: "must not write" })).outcome).toBe("DENIED");
  expect((await f.call("bash", { command: "touch workspace/forbidden-shell.txt" })).outcome).toBe("DENIED");
  expect(existsSync(join(f.workspace, "workspace", "forbidden.txt"))).toBe(false);
  expect(existsSync(join(f.workspace, "workspace", "forbidden-shell.txt"))).toBe(false);
  expect(readFileSync(toolsConfigPath(f.workspace))).toEqual(original);
  f.session.endStep({ stopReason: "end_turn", usage: null }); f.session.endTurn({ reason: "complete" });
  f.session.sealTurn(); f.session.close({ reason: "completed" });
  const ledger = openLedger(f.workspace, { readonly: true });
  try {
    const denied = ledger.getAllEvents().filter(row => JSON.parse(row.meta_json).auditType === "TOOL_CALL_DENIED");
    expect(denied.map(row => JSON.parse(row.meta_json).toolName).sort()).toEqual(["bash", "fs.write"]);
    for (const row of denied) { expect(extractEnvelope(row.meta_json)?.sessionId).toBe(f.session.sessionId); expect(row.writer_sig).not.toBe("unsigned"); }
  } finally { ledger.close(); }
  const verified = await verifyLedgerIntegrity(f.workspace); expect(verified.ok, JSON.stringify(verified)).toBe(true);
});

test.each([
  { label: "empty", tools: [] },
  { label: "unknown", tools: [{ name: "unimplemented", actionClass: "READ_ONLY" }] },
  { label: "misclassified", tools: [{ name: "fs.write", actionClass: "READ_ONLY" }] },
  { label: "MCP identity on native body", tools: [{ ...read, context: { kind: "mcp", server: { id: "foreign", name: "Foreign" } } }] },
  { label: "ambiguous names", tools: [read, { ...read }] }
] satisfies Array<{ label: string; tools: ToolDefinition[] }>) ("$label does not claim native readiness or publish built-ins", ({ tools }) => {
  const f = fixture(tools);
  expect(f.tools.readiness.ready).toBe(false); expect(f.names()).toEqual([]);
});

test("schema projection and dispatch reject live revocation, class changes and invalid signatures", async () => {
  const f = fixture([read]); expect(f.names()).toEqual(["fs.read"]);
  for (const allowed of [[], [{ ...read, actionClass: "WRITE_LOW" as const }]]) {
    f.config.tools.allowedTools = allowed; initToolsConfig(f.workspace, f.config);
    expect(f.names()).toEqual([]);
    expect((await f.call("fs.read", { path: "workspace/review.txt" })).outcome).toBe("DENIED");
  }
  f.config.tools.allowedTools = [read]; initToolsConfig(f.workspace, f.config);
  writeFileSync(toolsConfigPath(f.workspace), readFileSync(toolsConfigPath(f.workspace), "utf8") + "\n");
  const snapshot = loadVerifiedToolsConfigSnapshot(f.workspace);
  expect(snapshot.signatureValid).toBe(false); expect(selectSupportedNativeTools(snapshot)).toEqual([]);
  expect(checkToolsetReadiness(f.workspace, { snapshot }).ready).toBe(false);
  expect(f.names()).toEqual([]);
});

test("late delegation/workflow registrations remain signed per tool and code transport stays reserved", () => {
  const f = fixture([read, { name: "delegate", actionClass: "READ_ONLY" }], "code");
  const define = (name: string) => f.tools.registry.define({ name, actionClass: "READ_ONLY", description: "Synthetic registered capability",
    parameters: { type: "object", properties: {} }, body: () => ({ output: "fixture" }) });
  define("delegate"); define("workflow");
  expect(f.names()).toEqual(["delegate", "fs.read", "run_code"]);
  f.config.tools.allowedTools.push({ name: "workflow", actionClass: "READ_ONLY" }); initToolsConfig(f.workspace, f.config);
  expect(f.names()).toEqual(["delegate", "fs.read", "run_code", "workflow"]);
  expect(() => f.tools.registry.restrict({ deny: new Set(["run_code"]) })).toThrow();
  f.config.tools.allowedTools = [{ name: "delegate", actionClass: "READ_ONLY" }]; initToolsConfig(f.workspace, f.config);
  const snapshot = loadVerifiedToolsConfigSnapshot(f.workspace);
  expect(selectSupportedNativeTools(snapshot)).toEqual([]);
  expect(checkToolsetReadiness(f.workspace, { snapshot, additionalCapabilities: NATIVE_DELEGATION_CAPABILITIES }).ready).toBe(true);
});
