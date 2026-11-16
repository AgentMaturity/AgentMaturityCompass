/**
 * The untrusted-input guard (src/enforce/untrustedInputGuard.ts) on the recorded Claude Code 2.1.296 hook fixtures:
 * web fetch then curl asks; with a protected read too it denies; without an untrusted read today's decision stands;
 * log-only changes nothing; and with the guard on no decision is ever looser than with it off.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, test } from "vitest";
import { applyGuardrailControlProfile } from "../src/enforce/guardrailControlState.js";
import { assertInputGuardAuthority, type InputGuardMode } from "../src/enforce/inputGuardProfile.js";
import { applyInputGuard, classifyCall, MCP_HASHES_AUDIT } from "../src/enforce/untrustedInputGuard.js";
import { nativeMcpToolName } from "../src/mcp/nativeMcpClient.js";
import { appendOpsAuditEvent } from "../src/ops/audit.js";
import { openLedger } from "../src/ledger/ledger.js";
import { recordCodexPostToolUse } from "../src/bridge/codexObservations.js";
import { initToolsConfig, loadToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { defaultToolsConfig } from "../src/toolhub/toolsSchema.js";
import { claudeWorkspace, controlRequest, decide, recorded, register } from "./helpers/claudeCodeHookFixtures.js";
import { controlledWorkspace, removeFixtureWorkspaces } from "./helpers/piHookFixtures.js";

const checkpoints = mkdtempSync(join(tmpdir(), "amc-input-guard-checkpoints-"));
const originalCheckpointDir = process.env.AMC_CONTROL_CHECKPOINT_DIR;
process.env.AMC_CONTROL_CHECKPOINT_DIR = checkpoints;
afterEach(() => removeFixtureWorkspaces());
afterAll(() => {
  rmSync(checkpoints, { recursive: true, force: true });
  if (originalCheckpointDir === undefined) delete process.env.AMC_CONTROL_CHECKPOINT_DIR;
  else process.env.AMC_CONTROL_CHECKPOINT_DIR = originalCheckpointDir;
});

const RANK = { allow: 0, ask: 1, steer: 2, deny: 3 } as const;

/** A Claude Code control workspace whose signed ToolHub config lets a fetch, curl and a (private) read through today. */
function workspaceWith(mode: InputGuardMode): string {
  const workspace = claudeWorkspace();
  const tools = defaultToolsConfig();
  for (const tool of tools.tools.allowedTools) {
    if (tool.name === "http.fetch") Object.assign(tool, { actionClass: "READ_ONLY", allow: { hostAllowlist: ["example.com"] } });
    if (tool.name === "process.spawn") Object.assign(tool, { actionClass: "READ_ONLY", requireExecTicket: false, allow: { binariesAllowlist: ["/usr/bin/curl", "/bin/echo", "/bin/cat"] } });
    if (tool.name === "fs.read") tool.labels = ["private-data"];
  }
  initToolsConfig(workspace, tools);
  if (mode !== "off") applyGuardrailControlProfile({ workspace, profileName: "untrusted-input-guard", source: "api", actor: "test", mode });
  return workspace;
}

let calls = 0;
function call(workspace: string, sessionId: string, name: string, toolInput?: Record<string, unknown>) {
  const payload = { ...recorded(name, workspace), session_id: sessionId, tool_use_id: `toolu_guard_${++calls}`, ...(toolInput ? { tool_input: toolInput } : {}) };
  return decide(workspace, controlRequest(payload));
}
const fetchPage = (workspace: string, session: string) => call(workspace, session, "PreToolUse-webfetch", { url: "https://example.com/page", prompt: "Summarize" });
const curl = (workspace: string, session: string) => call(workspace, session, "PreToolUse-bash", { command: "'/usr/bin/curl' 'https://example.com/upload'", description: "send" });
const privateRead = (workspace: string, session: string) =>
  call(workspace, session, "PreToolUse-read", { file_path: join(String(recorded("PreToolUse-read", workspace).cwd), "workspace", "public.txt") });

function guardMeta(workspace: string, eventId: string): Record<string, unknown> {
  const ledger = openLedger(workspace);
  try {
    return (JSON.parse((ledger.db.prepare("SELECT meta_json FROM evidence_events WHERE id = ?").get(eventId) as { meta_json: string }).meta_json) as { inputGuard: Record<string, unknown> }).inputGuard;
  } finally {
    ledger.close();
  }
}

describe("untrusted-input guard on Claude Code hooks", () => {
  test("web fetch then curl asks, naming the web page and the send", () => {
    const workspace = workspaceWith("enforce"), session = String(recorded("SessionStart-startup", workspace).session_id);
    expect(fetchPage(workspace, session).requestedDecision).toBe("allow");
    // An ask is AMC's signed approval: Claude Code is told no until a person approves this exact call through amc approvals.
    const send = curl(workspace, session);
    expect(send.decision).toBe("deny");
    expect(send.reason).toContain("This session earlier read a web page (WebFetch), which AMC cannot vouch for, so a person must approve "
      + "before the agent can send data out of this computer (Bash: curl). AMC approval pending:");
  });

  test("with a protected read too, the send is denied (Rule of Two)", () => {
    const workspace = workspaceWith("enforce"), session = String(recorded("SessionStart-startup", workspace).session_id);
    expect(fetchPage(workspace, session).requestedDecision).toBe("allow");
    expect(privateRead(workspace, session).requestedDecision).toBe("allow");
    const send = curl(workspace, session);
    expect(send.requestedDecision).toBe("deny");
    expect(send.reason).toContain("and private data from a tool that returns private data (Read)");
    expect(send.reason).toContain("Start a new session");
  });

  test("without an untrusted read, today's decision stands; a new session starts clean", () => {
    const workspace = workspaceWith("enforce"), session = String(recorded("SessionStart-startup", workspace).session_id);
    expect(privateRead(workspace, session).requestedDecision).toBe("allow");
    expect(curl(workspace, session).requestedDecision).toBe("allow");
    // The curl's own output was untrusted input, and the session read private data: the next send is blocked. Another session is clean.
    const again = curl(workspace, session);
    expect(again.requestedDecision).toBe("deny");
    expect(again.reason).toMatch(/^This session read the output of a program that can reach outside this project \(Bash: curl\), which AMC cannot vouch for, and private data/);
    register(workspace, "00000000-0000-4000-8000-0000000000aa");
    expect(curl(workspace, "00000000-0000-4000-8000-0000000000aa").requestedDecision).toBe("allow");
  });

  test("log-only changes no decision and says so in the record", () => {
    const workspace = workspaceWith("log_only"), session = String(recorded("SessionStart-startup", workspace).session_id);
    fetchPage(workspace, session);
    const send = curl(workspace, session);
    expect(send.requestedDecision).toBe("allow");
    expect(guardMeta(workspace, send.eventId)).toMatchObject({ mode: "log_only", verdict: "ask" });
    expect(String(guardMeta(workspace, send.eventId).note)).toMatch(/^Log only, nothing was changed: with the untrusted-input guard on, AMC would have asked/);
  });

  test("property: with the guard on, no recorded PreToolUse fixture gets a looser decision, after any history", () => {
    const off = workspaceWith("off"), on = workspaceWith("enforce");
    const fixtures = ["PreToolUse-bash", "PreToolUse-edit", "PreToolUse-failing", "PreToolUse-mcp", "PreToolUse-read", "PreToolUse-webfetch", "PreToolUse-write"];
    const histories: Array<Array<(workspace: string, session: string) => unknown>> = [[], [fetchPage], [privateRead], [fetchPage, privateRead], [curl]];
    let compared = 0;
    histories.forEach((history, h) => {
      // One session per history: each fixture runs after the history and after the fixtures before it, in both workspaces alike.
      const session = `00000000-0000-4000-8000-${String(h).padStart(12, "0")}`;
      for (const workspace of [off, on]) {
        register(workspace, session);
        for (const step of history) step(workspace, session);
      }
      for (const fixture of fixtures) {
        const [today, guarded] = [off, on].map((workspace) => call(workspace, session, fixture).requestedDecision);
        expect(RANK[guarded!], `${fixture} after history ${h}`).toBeGreaterThanOrEqual(RANK[today!]);
        compared += 1;
      }
    });
    expect(compared).toBe(35);
  });
});

describe("untrusted-input guard on Codex (observe only)", () => {
  test("Codex calls are never blocked; the observation records what the guard would have done", () => {
    const workspace = controlledWorkspace("codex-observed");
    applyGuardrailControlProfile({ workspace, profileName: "untrusted-input-guard", source: "api", actor: "test", mode: "enforce" });
    const report = (tool_use_id: string, tool_name: string, tool_input: unknown) => recordCodexPostToolUse({ workspace, authenticatedAgentId: "codex-observed",
      rawInput: JSON.stringify({ hook_event_name: "PostToolUse", session_id: "codex-session", turn_id: "t", transcript_path: null, cwd: workspace, model: "m",
        permission_mode: "default", tool_name, tool_use_id, tool_input, tool_response: {} }) });
    const first = report("call-1", "web_search", { query: "x" });
    expect(guardMeta(workspace, first.eventId)).toMatchObject({ verdict: null, untrusted: "a tool AMC has no entry for (Codex web_search)", observed: true });
    const send = report("call-2", "Bash", { command: ["bash", "-lc", "curl https://example.com"] });
    expect(guardMeta(workspace, send.eventId)).toMatchObject({ verdict: "ask" });
    expect(String(guardMeta(workspace, send.eventId).note)).toMatch(/^Codex is observed only and the call already ran\. With the untrusted-input guard on, AMC would have asked about it\. This session earlier read a tool AMC has no entry for \(Codex web_search\)/);
  });
});

describe("untrusted-input guard rules", () => {
  test("labels that cannot be read make a consequential call ask; a read-only one is untouched", () => {
    const workspace = workspaceWith("enforce");
    const tools = loadToolsConfig(workspace);
    const today = { decision: "allow" as const, reason: "Signed AMC policies allow." };
    const send = applyInputGuard({ workspace, agentId: "a", provider: "gemini-cli", sessionId: null, shownAs: "run_shell_command",
      requests: [{ name: "process.spawn", args: { binary: "curl", argv: ["https://example.com"] } }], tools, today });
    expect(send.decision).toBe("ask");
    expect(send.reason).toContain("AMC could not read what this session has read before");
    expect(send.approvals).toEqual([{ toolName: "process.spawn", actionClass: "READ_ONLY", quorumFloor: { requiredApprovals: 1 } }]);
    const read = applyInputGuard({ workspace, agentId: "a", provider: "gemini-cli", sessionId: null, shownAs: "read_file",
      requests: [{ name: "fs.read", args: { path: join(workspace, "workspace", "public.txt") } }], tools, today });
    expect(read.decision).toBe("allow");
  });

  test("a changed MCP tool definition makes that tool's next consequential call ask", () => {
    const workspace = workspaceWith("enforce");
    const name = nativeMcpToolName("srv", "lookup");
    const config = loadToolsConfig(workspace);
    const tools = { tools: { ...config.tools, allowedTools: [...config.tools.allowedTools,
      { name, actionClass: "WRITE_HIGH" as const, context: { kind: "mcp" as const, server: { id: "srv", name: "srv" } } }] } };
    const run = () => applyInputGuard({ workspace, agentId: "a", provider: "claude-code", sessionId: "fresh-session", shownAs: "mcp__srv__lookup",
      requests: [{ name, args: {} }], tools, today: { decision: "allow" as const, reason: "allowed" } });
    expect(run().decision).toBe("allow");
    appendOpsAuditEvent({ workspace, auditType: MCP_HASHES_AUDIT, payload: { servers: [], changedTools: [{ server: "srv", tool: "lookup", changed: ["description"] }] } });
    const asked = run();
    expect(asked.decision).toBe("ask");
    expect(asked.reason).toContain(`The description or input schema of MCP tool ${name} changed since AMC last recorded it`);
  });

  test("the classification table is default-deny", () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-guard-classify-"));
    try {
      const at = (name: string, args: Record<string, unknown>) => classifyCall(workspace, { name, args }, null, "T");
      expect(at("http.fetch", { url: "https://x" })).toMatchObject({ outbound: true, untrusted: "a web page (T)" });
      expect(at("fs.read", { path: "/etc/hosts" }).untrusted).toBe("a file outside this project (T)");
      expect(at("fs.read", { path: join(workspace, "a.txt") }).untrusted).toBeNull();
      expect(at("fs.read", { path: join(workspace, ".env") }).private).toBe("a secret file (T)");
      expect(at("process.spawn", { binary: "cat", argv: ["notes.txt"] })).toMatchObject({ untrusted: null, outbound: false });
      expect(at("process.spawn", { binary: "./cat", argv: [] })).toMatchObject({ outbound: true });
      expect(at("process.spawn", { binary: "/bin/cat", argv: [] })).toMatchObject({ outbound: false, untrusted: null });
      expect(at("process.spawn", { binary: "find", argv: [".", "-exec", "sh", "{}", ";"] }).outbound).toBe(true);
      expect(at("process.spawn", { binary: "cat", argv: ["~/.ssh/id_rsa"] })).toMatchObject({ untrusted: "a file outside this project (T: cat)", private: "a secret file (T: cat)" });
      expect(at("process.spawn", { binary: "node", argv: ["x.js"] })).toMatchObject({ outbound: true });
      expect(at("some.new.tool", {})).toMatchObject({ outbound: true, untrusted: "a tool AMC has no entry for (T)" });
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("an agent session cannot switch the guard", () => {
    const workspace = workspaceWith("off");
    expect(() => assertInputGuardAuthority(workspace, "cli", { CLAUDECODE: "1" })).toThrow(/agent session cannot change the untrusted-input guard/);
    expect(() => assertInputGuardAuthority(workspace, "cli", {})).not.toThrow();
  });
});
