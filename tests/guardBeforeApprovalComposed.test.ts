import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initActionPolicy } from "../src/governor/actionPolicyEngine.js";
import { codingActionPolicy } from "../src/setup/starterProfiles.js";
import { initApprovalPolicy } from "../src/approvals/approvalPolicyEngine.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { defaultToolsConfig } from "../src/toolhub/toolsSchema.js";
import { initToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { openLedger } from "../src/ledger/ledger.js";
import { runComposedTurn, type ComposedToolSession } from "../src/kernel/agentLoopRunner.js";
import { agentToolset } from "../src/agent/agentToolset.js";
import { approvalModeGatedClasses } from "../src/approvals/approvalModes.js";
import { STUB_PROVIDER_ID, STUB_PROVIDER_MODEL, stubProviderRoute, stubProviderTransport } from "../src/agent/stubProvider.js";
import { loadNativeCommandHooks, trustNativeCommandHooks } from "../src/extensions/nativeCommandHookConfig.js";
import { renderSessionTranscript } from "../src/session/sessionTranscript.js";
import type { EvidenceEvent } from "../src/types.js";
import { decideApprovalForIntent } from "../src/approvals/approvalEngine.js";

/**
 * UX-03 against the REAL composed toolset (B1): the early guard look must judge the same call the real guard stage judges.
 * A bare registry hid that the signed sandbox permit is keyed by the selected definition; these turns use the real guard
 * set, the signed allowlist with a sandboxed bash, and the approval gate the chat composes for --approval-mode default.
 */
let workspace: string;
let credentialsHome: string;
let amcHome: string;
const originalCwd = process.cwd();

beforeEach(() => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "guard-before-approval-composed");
  workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-early-look-")));
  credentialsHome = realpathSync(mkdtempSync(join(tmpdir(), "amc-early-look-cred-")));
  amcHome = realpathSync(mkdtempSync(join(tmpdir(), "amc-early-look-home-")));
  vi.stubEnv("AMC_HOME", amcHome);
  // The coding profile's signed Action Policy: an approved WRITE_LOW / WRITE_HIGH call runs (executeOnApproval).
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  initBudgets(workspace, "default");
  initActionPolicy(workspace, codingActionPolicy());
  initApprovalPolicy(workspace);
  writeRuntimeFirewallPolicy({ workspace, mode: "observe" });
  const config = defaultToolsConfig();
  const bash = config.tools.allowedTools.find((tool) => tool.name === "bash")!;
  Object.assign(bash, { nativeSandbox: { kind: "os-native", writableDirectories: ["."] } });
  initToolsConfig(workspace, config);
  process.chdir(workspace);
});
afterEach(() => {
  process.chdir(originalCwd);
  vi.unstubAllEnvs();
  for (const dir of [workspace, credentialsHome, amcHome]) rmSync(dir, { recursive: true, force: true });
});

const scripted = (tool: string, args: Record<string, unknown>): string => JSON.stringify({ tool, arguments: args });

async function turn(prompt: string) {
  const sessionId = `early-look-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let writer: ComposedToolSession | undefined;
  const asked: string[] = [];
  // A signed-in approver decides each raised request through the approvals engine, as the console or a terminal would.
  const onRaised = (event: { approvalRequestId: string; toolName?: string | null }) => {
    asked.push(event.toolName ?? "?");
    // Two distinct people, enough for the signed rule of every class used here (WRITE_HIGH asks for two).
    setTimeout(() => {
      for (const userId of ["approver-1", "approver-2"]) {
        const decided = decideApprovalForIntent({ reviewerAuthentication: "authenticated", workspace, agentId: "default", approvalId: event.approvalRequestId,
          decision: "APPROVED", mode: "EXECUTE", reason: "composed early-look fixture", userId, username: userId, userRoles: ["OWNER"] });
        if (decided.approval.status !== "PENDING") break;
      }
    }, 50);
  };
  const toolset = agentToolset({ workspace, agentId: "default", sessionId, recorder: { recordProjectedEvidence: (row) => writer!.recordProjectedEvidence(row) } });
  try {
    const outcome = await runComposedTurn({
      workspace, agentId: "default", sessionId, systemPrompt: "You are an AMC-governed agent.", prompt,
      route: { providerId: STUB_PROVIDER_ID, model: STUB_PROVIDER_MODEL, params: { max_tokens: 256, stream: true } },
      routes: [stubProviderRoute()], transport: stubProviderTransport(),
      tools: toolset.seam, bindToolSession: (selected) => { writer = selected; },
      credentials: { homeDir: credentialsHome, env: {}, watch: false, projectDir: null },
      approvalMode: "default",
      approvalGate: { actionClass: "WRITE_HIGH", riskTier: "high", gatesClasses: approvalModeGatedClasses("default")!, onRaised: onRaised as never }
    });
    const ledger = openLedger(workspace, { readonly: true });
    try {
      return { asked, rows: ledger.getAllEvents().filter((row) => row.session_id === outcome.sessionId) as EvidenceEvent[] };
    } finally { ledger.close(); }
  } finally { toolset.close(); }
}

const results = (rows: readonly EvidenceEvent[]) => rows.filter((row) => row.event_type === "tool/result").map((row) => JSON.parse(row.meta_json) as { outcome: string; denied: boolean });
const reasonOf = (rows: readonly EvidenceEvent[]) => rows.filter((row) => row.event_type === "audit")
  .map((row) => JSON.parse(row.meta_json) as Record<string, unknown>).find((meta) => meta.auditType === "TOOL_CALL_DENIED");

describe("UX-03 early look on the real composed toolset", () => {
  it("a sandboxed bash call is asked about, approved and not refused for a missing approval", async () => {
    const { asked, rows } = await turn(scripted("bash", { command: "echo early-look" }));
    expect(asked).toEqual(["bash"]);
    expect(rows.filter((row) => row.event_type === "approval/request")).toHaveLength(1);
    expect(results(rows)[0]!.outcome).not.toBe("DENIED");
    expect(JSON.stringify(rows.map((row) => row.meta_json))).not.toContain("approval_missing");
  });

  it("an fs.write is asked about, approved and runs", async () => {
    const { asked } = await turn(scripted("fs.write", { path: "workspace/output/early.txt", content: "ok\n" }));
    expect(asked).toEqual(["fs.write"]);
    expect(readFileSync(join(workspace, "workspace", "output", "early.txt"), "utf8")).toBe("ok\n");
  });

  it("a hook that allows before the question and refuses after: the person's approval stands, the check's refusal is recorded", async () => {
    const log = join(amcHome, "hook-inputs.jsonl");
    mkdirSync(join(workspace, ".amc", "hooks"), { recursive: true });
    writeFileSync(join(workspace, ".amc", "hooks", "flip.js"), `const fs=require("fs");let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{`
      + `const i=JSON.parse(d);fs.appendFileSync(${JSON.stringify(log)},JSON.stringify({pre:i.pre_approval})+"\\n");`
      + `if(i.pre_approval===false){process.stderr.write("flip guard: refused after approval\\n");process.exit(2);}process.exit(0);});`);
    writeFileSync(join(workspace, ".amc", "hooks.json"), JSON.stringify({ hooks: { PreToolUse: [{ matcher: "fs.write", hooks: [{ type: "command", command: [process.execPath, ".amc/hooks/flip.js"], timeout: 10 }] }] } }));
    const load = loadNativeCommandHooks(workspace);
    if (load.status !== "untrusted" && load.status !== "trusted") throw new Error(`hooks fixture is ${load.status}`);
    trustNativeCommandHooks(workspace, load.mark);
    const { asked, rows } = await turn(scripted("fs.write", { path: "workspace/output/flip.txt", content: "no\n" }));
    expect(asked).toEqual(["fs.write"]);
    expect(readFileSync(log, "utf8").trim().split("\n").map((line) => JSON.parse(line).pre)).toEqual([true, false]);
    expect(existsSync(join(workspace, "workspace", "output", "flip.txt"))).toBe(false);
    expect(results(rows)[0]).toMatchObject({ outcome: "DENIED", denied: true });
    expect(String(reasonOf(rows)?.denialReason ?? JSON.stringify(reasonOf(rows)))).toContain("flip guard: refused after approval");
    expect(rows.filter((row) => row.event_type === "approval/answer").map((row) => JSON.parse(row.meta_json).answer)).toEqual(["allow"]);
    const shown = renderSessionTranscript(workspace, rows, null).lines.join("\n");
    expect(shown).toContain("then refused by an automatic check before it ran");
  });

  it("a hook that refuses before the question: nobody is asked, the hook runs once, its own reason is recorded", async () => {
    const log = join(amcHome, "hook-once.jsonl");
    mkdirSync(join(workspace, ".amc", "hooks"), { recursive: true });
    writeFileSync(join(workspace, ".amc", "hooks", "deny.js"), `const fs=require("fs");let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{`
      + `fs.appendFileSync(${JSON.stringify(log)},"x\\n");process.stderr.write("deny guard: shell blocked\\n");process.exit(2);});`);
    writeFileSync(join(workspace, ".amc", "hooks.json"), JSON.stringify({ hooks: { PreToolUse: [{ matcher: "bash", hooks: [{ type: "command", command: [process.execPath, ".amc/hooks/deny.js"], timeout: 10 }] }] } }));
    const load = loadNativeCommandHooks(workspace);
    if (load.status !== "untrusted" && load.status !== "trusted") throw new Error(`hooks fixture is ${load.status}`);
    trustNativeCommandHooks(workspace, load.mark);
    const { asked, rows } = await turn(scripted("bash", { command: "ls" }));
    expect(asked).toEqual([]);
    expect(readFileSync(log, "utf8").trim().split("\n")).toHaveLength(1);
    expect(JSON.stringify(reasonOf(rows))).toContain("deny guard: shell blocked");
    expect(JSON.stringify(rows.map((row) => row.meta_json))).not.toContain("approval_missing");
  });
});
