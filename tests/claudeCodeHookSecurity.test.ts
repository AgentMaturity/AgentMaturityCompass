/**
 * P1-23 security review fixes: AMC parses a Claude Code hook payload exactly as Claude Code acts on it (parser
 * differential), nothing allows without a signed decision bound to this exact call (authorization bypass), and
 * observations are verified evidence bound to the decision they follow (audit integrity).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { runHookForward } from "../src/adapters/hookForwarder.js";
import { claudeActionId } from "../src/adapters/hookProviders/claudeCode.js";
import { clearPiDigestCache } from "../src/adapters/pi/piInstall.js";
import { verifyProviderHookControlResult } from "../src/bridge/hookControl.js";
import { handleHookControlRequest } from "../src/bridge/hookControlRoute.js";
import { HookControlError } from "../src/bridge/hookProviders.js";
import { openLedger, verifyEvidenceEventIntegrity } from "../src/ledger/ledger.js";
import { agentId, claudeWorkspace, controlRequest, decide, lease, recorded } from "./helpers/claudeCodeHookFixtures.js";
import { removeFixtureWorkspaces } from "./helpers/piHookFixtures.js";

afterEach(() => {
  removeFixtureWorkspaces();
  clearPiDigestCache();
});

let calls = 0;
/** A recorded PreToolUse with this tool and input, under a fresh tool_use_id. */
function pre(workspace: string, toolName: string, toolInput: Record<string, unknown>, extra: Record<string, unknown> = {}): Record<string, unknown> {
  calls += 1;
  return { ...recorded("PreToolUse-bash", workspace), tool_name: toolName, tool_input: toolInput, tool_use_id: `toolu_sec_${calls}`, ...extra };
}
const route = (workspace: string, rawInput: string) =>
  handleHookControlRequest({ workspace, authenticatedAgentId: agentId, provider: "claude-code", lease, rawInput }) as unknown as Record<string, unknown>;
const cwdOf = (workspace: string) => String(recorded("PreToolUse-read", workspace).cwd);

describe("parser differential", () => {
  test("Bash runs only the pure form AMC can prove: single-quoted words, the first an absolute path", () => {
    const workspace = claudeWorkspace();
    const unclassifiable = ["ls", "echo hi", "'/bin/echo' 'a'; '/bin/rm' 'x'", "'/bin/echo' 'a' && '/bin/rm' 'x'", "'/bin/echo' 'a' | '/bin/cat'",
      "'/bin/echo' $(id)", "'/bin/echo' `id`", "FOO=1 '/bin/echo' 'a'", "'/bin/echo' <<EOF\nx\nEOF", "('/bin/echo' 'a')", "'/bin/echo'  'two spaces'",
      "'echo' 'relative binary'", "'/bin/../bin/echo' 'a'", "'/bin/echo' 'a'\n'/bin/rm' 'x'", "\"/bin/echo\" \"a\""];
    for (const command of unclassifiable) {
      const result = decide(workspace, controlRequest(pre(workspace, "Bash", { command, description: "x" })));
      expect(result.decision, command).toBe("deny");
      expect(result.reason, command).toContain("AMC allows a Claude Code Bash command only in its pure form");
    }
    const pure = decide(workspace, controlRequest(pre(workspace, "Bash", { command: "'/bin/echo' 'hello world'", description: "x" })));
    expect(pure.reason).not.toContain("pure form");
    expect(pure.canonicalToolName).toBe("process.spawn");
  });

  test("a mapped tool's input must match the pinned schema: unknown fields and wrong types are refused", () => {
    const workspace = claudeWorkspace();
    const file = join(cwdOf(workspace), "workspace", "public.txt");
    for (const [tool, input] of [["Read", { file_path: file, surprise: true }], ["Read", { file_path: [file] }], ["Bash", { command: ["/bin/ls"] }],
      ["Write", { file_path: file, content: 1 }], ["WebFetch", { url: "https://example.com/", prompt: "x", extra: 1 }]] as const) {
      const result = decide(workspace, controlRequest(pre(workspace, tool, input)));
      expect(result.decision, JSON.stringify(input)).toBe("deny");
      expect(result.reason, JSON.stringify(input)).toContain("does not match Claude Code 2.1.296's");
    }
  });

  test("one path, one spelling: a non-NFC path, a control character and a non-canonical URL are refused", () => {
    const workspace = claudeWorkspace();
    const dir = join(cwdOf(workspace), "workspace");
    const nfd = join(dir, "café.txt");
    for (const input of [{ file_path: nfd }, { file_path: join(dir, "a\nb.txt") }]) {
      expect(decide(workspace, controlRequest(pre(workspace, "Read", input))).decision).toBe("deny");
    }
    for (const url of ["HTTPS://example.com/", "https://example.com:443/", "https://example.com/%7e", "https://example.com"]) {
      const result = decide(workspace, controlRequest(pre(workspace, "WebFetch", { url, prompt: "x" })));
      expect(result.reason, url).toContain("canonical");
    }
  });

  test("self-audit: a glob that could leave its directory and a working directory with another spelling are refused", () => {
    const workspace = claudeWorkspace();
    const dir = join(cwdOf(workspace), "workspace");
    for (const [tool, input] of [["Glob", { pattern: "{..,src}/*", path: dir }], ["Glob", { pattern: "../*", path: dir }],
      ["Grep", { pattern: "x", glob: "{..,a}/*.ts", path: dir }], ["Glob", { pattern: "a\\b", path: dir }]] as const) {
      expect(decide(workspace, controlRequest(pre(workspace, tool, input))).reason, JSON.stringify(input)).toContain("could leave the directory it searches");
    }
    const braces = decide(workspace, controlRequest(pre(workspace, "Grep", { pattern: "x", glob: "*.{ts,txt}", path: join(dir, "public.txt") })));
    expect(braces.decision).toBe("allow");
    const cwd = cwdOf(workspace);
    expect(decide(workspace, controlRequest(pre(workspace, "Glob", { pattern: "*" }, { cwd: `${cwd}/workspace/..` }))).reason)
      .toContain("working directory is outside this AMC workspace");
  });

  test("duplicate JSON keys are refused by the forwarder and by the control route", async () => {
    const workspace = claudeWorkspace();
    const body = JSON.stringify(pre(workspace, "Read", { file_path: join(cwdOf(workspace), "workspace", "public.txt") }));
    const duplicated = body.replace('"tool_name":"Read"', '"tool_name":"Read","tool_name":"Write"');
    expect(duplicated).not.toBe(body);
    const forwarded = await runHookForward({ provider: "claude-code", mode: "control", agent: agentId, tokenFile: ".amc/hooks/claude-code.lease",
      bridgeUrl: "http://127.0.0.1:3212" }, async () => duplicated, workspace, 3_000);
    expect(forwarded).toMatchObject({ exitCode: 2, stderr: "AMC hook control input invalid; action denied.\n" });
    const registration = JSON.stringify({ hook_event_name: "Stop", session_id: "a", session_id_: "b" }).replace('"session_id_"', '"session_id"');
    expect(() => route(workspace, registration)).toThrowError(expect.objectContaining<Partial<HookControlError>>({ code: "HOOK_CONTROL_INPUT_AMBIGUOUS" }));
  });

  test("tool names match Claude Code's exactly: another case is unmapped, and so is every MCP tool", () => {
    const workspace = claudeWorkspace();
    const file = join(cwdOf(workspace), "workspace", "public.txt");
    for (const name of ["read", "READ", "Read ", "mcp__fs__read_file"]) {
      expect(decide(workspace, controlRequest(pre(workspace, name, { file_path: file }))).decision, name).toBe("deny");
    }
  });
});

describe("authorization bypass", () => {
  test("Claude Code's permission mode never weakens AMC's decision, and an unknown mode is refused", () => {
    const workspace = claudeWorkspace();
    for (const mode of ["bypassPermissions", "acceptEdits", "plan", "dontAsk", "auto", "default"]) {
      const result = decide(workspace, controlRequest(pre(workspace, "Bash", { command: "rm -rf /" }, { permission_mode: mode })));
      expect(result.decision, mode).toBe("deny");
    }
    expect(() => decide(workspace, controlRequest(pre(workspace, "Bash", { command: "ls" }, { permission_mode: "yolo" }))))
      .toThrowError(expect.objectContaining<Partial<HookControlError>>({ code: "HOOK_CONTROL_INPUT_INVALID" }));
  });

  test("a decision is bound to its session, tool_use_id, input and nonce: no other request verifies against it", () => {
    const workspace = claudeWorkspace();
    const call = pre(workspace, "Read", { file_path: join(cwdOf(workspace), "workspace", "public.txt") });
    const rawInput = controlRequest(call, "nonce-binding-0000000001");
    const result = decide(workspace, rawInput);
    expect(result.decision).toBe("allow");
    const verify = (other: string) => verifyProviderHookControlResult({ workspace, authenticatedAgentId: agentId, provider: "claude-code", rawInput: other, result });
    expect(verify(rawInput)).toEqual({ ok: true, error: null });
    expect(verify(controlRequest({ ...call, session_id: "another-session" }, "nonce-binding-0000000001")).ok).toBe(false);
    expect(verify(controlRequest({ ...call, tool_use_id: "toolu_other" }, "nonce-binding-0000000001")).ok).toBe(false);
    expect(verify(controlRequest({ ...call, tool_input: { file_path: join(cwdOf(workspace), "workspace", "x.txt") } }, "nonce-binding-0000000001")).ok).toBe(false);
    expect(verify(controlRequest(call, "nonce-binding-0000000002")).ok).toBe(false);
    expect(() => decide(workspace, controlRequest(call, "nonce-binding-0000000002")))
      .toThrowError(expect.objectContaining<Partial<HookControlError>>({ code: "HOOK_CONTROL_REPLAY_CONFLICT" }));
  });

  test("a hook event AMC does not install never blocks a stop and never allows", async () => {
    const workspace = claudeWorkspace();
    const opts = { provider: "claude-code" as const, mode: "control" as const, agent: agentId, tokenFile: ".amc/hooks/claude-code.lease", bridgeUrl: "http://127.0.0.1:3212" };
    const base = recorded("Stop-stop", workspace);
    for (const event of ["SubagentStop", "TeammateIdle", "TaskCompleted", "SessionEnd"]) {
      const outcome = await runHookForward(opts, async () => JSON.stringify({ ...base, hook_event_name: event }), workspace, 3_000);
      expect(outcome.exitCode, event).toBe(0);
      expect(outcome.stdout, event).not.toContain("allow");
    }
    const unknownTool = await runHookForward(opts, async () => JSON.stringify({ ...recorded("PreToolUse-bash", workspace), hook_event_name: "PermissionRequest" }), workspace, 3_000);
    expect(unknownTool.exitCode).toBe(2);
    expect(unknownTool.stdout).not.toContain('"allow"');
  });
});

describe("audit integrity", () => {
  function allowRead(workspace: string, toolUseId: string) {
    const input = { file_path: join(cwdOf(workspace), "workspace", "public.txt") };
    const result = decide(workspace, controlRequest({ ...pre(workspace, "Read", input), tool_use_id: toolUseId }));
    expect(result.decision).toBe("allow");
    return { result, input, session: String(recorded("PreToolUse-read", workspace).session_id) };
  }
  const post = (session: string, toolUseId: string, input: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    JSON.stringify({ hook_event_name: "PostToolUse", session_id: session, tool_use_id: toolUseId, tool_name: "Read", tool_input: input, ingressRecorded: true, ...extra });

  test("an observation is bound to the decision it follows by tool_use_id and receipt digest, labelled as reported by Claude Code", () => {
    const workspace = claudeWorkspace();
    const { result, input, session } = allowRead(workspace, "toolu_bound");
    const recordedPost = route(workspace, post(session, "toolu_bound", input));
    const ledger = openLedger(workspace);
    try {
      const row = ledger.getAllEvents().find((event) => event.id === recordedPost.eventId)!;
      expect(verifyEvidenceEventIntegrity({ ledger, eventId: row.id, requireReceipt: true, requireSealedSession: true }).ok).toBe(true);
      expect(JSON.parse(row.meta_json)).toMatchObject({ matched: true, toolUseId: "toolu_bound", decisionEventId: result.eventId,
        decisionReceiptSha256: result.receiptSha256, decision: "allow", authorizationMismatch: false,
        reported: { by: "claude-code", event: "PostToolUse", outcome: "completed" } });
    } finally {
      ledger.close();
    }
  });

  test("an observation with no matching decision is recorded as unmatched, never as authorized", () => {
    const workspace = claudeWorkspace();
    const session = String(recorded("PreToolUse-read", workspace).session_id);
    const unmatched = route(workspace, post(session, "toolu_never_decided", { file_path: "/x" }));
    const ledger = openLedger(workspace);
    try {
      expect(JSON.parse(ledger.getAllEvents().find((event) => event.id === unmatched.eventId)!.meta_json))
        .toMatchObject({ matched: false, decision: null, decisionReceiptSha256: null, authorizationMismatch: true });
    } finally {
      ledger.close();
    }
  });

  test("a replayed or duplicated observation is detected and refused", () => {
    const workspace = claudeWorkspace();
    const { input, session } = allowRead(workspace, "toolu_dup");
    route(workspace, post(session, "toolu_dup", input));
    expect(() => route(workspace, post(session, "toolu_dup", input)))
      .toThrowError(expect.objectContaining<Partial<HookControlError>>({ code: "HOOK_CONTROL_REPLAY_CONFLICT" }));
    expect(() => route(workspace, post(session, "toolu_dup", input, { hook_event_name: "PostToolUseFailure" })))
      .toThrowError(expect.objectContaining<Partial<HookControlError>>({ code: "HOOK_CONTROL_REPLAY_CONFLICT" }));
    const prompt = recorded("UserPromptSubmit-prompt", workspace);
    const admission = JSON.stringify({ hook_event_name: "UserPromptSubmit", session_id: prompt.session_id, prompt_id: prompt.prompt_id,
      prompt: { sha256: "a".repeat(64), length: 3 } });
    route(workspace, admission);
    expect(() => route(workspace, admission)).toThrowError(expect.objectContaining<Partial<HookControlError>>({ code: "HOOK_CONTROL_REPLAY_CONFLICT" }));
  });

  test("an observation that cannot be recorded latches its session: every later call is denied", () => {
    const workspace = claudeWorkspace();
    const { input, session } = allowRead(workspace, "toolu_latch");
    // The forwarder reports that the observed-ingress write failed; the session cannot be audited any further.
    expect(() => route(workspace, post(session, "toolu_latch", input, { ingressRecorded: false })))
      .toThrowError(expect.objectContaining<Partial<HookControlError>>({ code: "HOOK_CONTROL_LEDGER_UNAVAILABLE" }));
    const after = decide(workspace, controlRequest(pre(workspace, "Read", input)));
    expect(after).toMatchObject({ decision: "deny" });
    expect(after.reason).toContain("latched");
    // The latch survives the Bridge's memory: it is read from disk at each decision.
    expect(readFileSync(join(workspace, ".amc", "hooks", "claude-code.latched.json"), "utf8")).toContain("sessionSha256");
    writeFileSync(join(workspace, ".amc", "hooks", "claude-code.latched.json"), "not json");
    expect(decide(workspace, controlRequest(pre(workspace, "Read", input))).reason).toContain("latched");
    expect(claudeActionId(session, "toolu_latch")).toMatch(/^cc\./);
  });
});
