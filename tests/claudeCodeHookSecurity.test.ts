/**
 * P1-23 security review fixes: AMC parses a Claude Code hook payload exactly as Claude Code acts on it (parser
 * differential), nothing allows without a signed decision bound to this exact call (authorization bypass), and
 * observations are verified evidence bound to the decision they follow (audit integrity).
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { runHookForward } from "../src/adapters/hookForwarder.js";
import { claudeActionId } from "../src/adapters/hookProviders/claudeCode.js";
import { clearPiDigestCache } from "../src/adapters/pi/piInstall.js";
import { verifyProviderHookControlResult } from "../src/bridge/hookControl.js";
import { handleHookControlRequest } from "../src/bridge/hookControlRoute.js";
import { HookControlError } from "../src/bridge/hookProviders.js";
import { getHookIntegrationStatus } from "../src/adapters/hookIntegration.js";
import { inspectHookActionLifecycle } from "../src/watch/hookActionLifecycle.js";
import { sha256Hex } from "../src/utils/hash.js";
import { workspaceScope } from "../src/keys/highWater.js";
import { openLedger, verifyEvidenceEventIntegrity } from "../src/ledger/ledger.js";
import { agentId, claudeWorkspace, controlRequest, decide, lease, recorded } from "./helpers/claudeCodeHookFixtures.js";
import { freePort, removeFixtureWorkspaces } from "./helpers/piHookFixtures.js";
import { startBridgeServer } from "../src/bridge/bridgeServer.js";

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
  /** What AMC's forwarder posts after a tool ran: the call, its input as Claude Code reports it, and the decision it follows. */
  const post = (session: string, toolUseId: string, input: Record<string, unknown>, receipt: string | null, extra: Record<string, unknown> = {}) =>
    JSON.stringify({ hook_event_name: "PostToolUse", session_id: session, tool_use_id: toolUseId, tool_name: "Read", tool_input: input, ingressRecorded: true,
      decisionReceiptSha256: receipt, ...extra });
  const postRows = (workspace: string, actionId: string) => {
    const ledger = openLedger(workspace);
    try {
      return ledger.getAllEvents().map((event) => JSON.parse(event.meta_json) as Record<string, unknown>)
        .filter((meta) => meta.postExecutionSchemaVersion === 1 && meta.actionId === actionId);
    } finally {
      ledger.close();
    }
  };

  test("an observation is bound to the decision it follows by tool_use_id and receipt digest, labelled as reported by Claude Code", () => {
    const workspace = claudeWorkspace();
    const { result, input, session } = allowRead(workspace, "toolu_bound");
    const recordedPost = route(workspace, post(session, "toolu_bound", input, result.receiptSha256));
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

  test("an observation with no matching decision is recorded as unmatched and refused, never as authorized", () => {
    const workspace = claudeWorkspace();
    const session = String(recorded("PreToolUse-read", workspace).session_id);
    expect(() => route(workspace, post(session, "toolu_never_decided", { file_path: "/x" }, null)))
      .toThrowError(expect.objectContaining<Partial<HookControlError>>({ code: "HOOK_CONTROL_REPLAY_CONFLICT" }));
    expect(postRows(workspace, claudeActionId(session, "toolu_never_decided"))).toEqual([expect.objectContaining({ matched: false, decision: null,
      decisionReceiptSha256: null, authorizationMismatch: true, bindingRefusal: "no verified PreToolUse decision for this call" })]);
  });

  test("a replayed or duplicated observation is detected and refused", () => {
    const workspace = claudeWorkspace();
    const { result, input, session } = allowRead(workspace, "toolu_dup");
    route(workspace, post(session, "toolu_dup", input, result.receiptSha256));
    expect(() => route(workspace, post(session, "toolu_dup", input, result.receiptSha256)))
      .toThrowError(expect.objectContaining<Partial<HookControlError>>({ code: "HOOK_CONTROL_REPLAY_CONFLICT" }));
    expect(() => route(workspace, post(session, "toolu_dup", input, result.receiptSha256, { hook_event_name: "PostToolUseFailure" })))
      .toThrowError(expect.objectContaining<Partial<HookControlError>>({ code: "HOOK_CONTROL_REPLAY_CONFLICT" }));
    // All three kept: the first, and two flagged as conflicts of it.
    expect(postRows(workspace, result.actionId).filter((row) => row.conflictOf !== undefined)).toHaveLength(2);
    const prompt = recorded("UserPromptSubmit-prompt", workspace);
    const admission = JSON.stringify({ hook_event_name: "UserPromptSubmit", session_id: prompt.session_id, prompt_id: prompt.prompt_id,
      prompt: { sha256: "a".repeat(64), length: 3 } });
    route(workspace, admission);
    expect(() => route(workspace, admission)).toThrowError(expect.objectContaining<Partial<HookControlError>>({ code: "HOOK_CONTROL_REPLAY_CONFLICT" }));
  });

  test("an outcome the forwarder could not record at the ingress is recorded and refused, and never latches", () => {
    const workspace = claudeWorkspace();
    const { result, input, session } = allowRead(workspace, "toolu_latch");
    // The forwarder's report is input: a lease holder could send it, so it must not be able to latch the workspace.
    expect(() => route(workspace, post(session, "toolu_latch", input, result.receiptSha256, { ingressRecorded: false })))
      .toThrowError(expect.objectContaining<Partial<HookControlError>>({ code: "HOOK_CONTROL_INPUT_INVALID", statusCode: 422 }));
    expect(postRows(workspace, result.actionId).some((row) => row.ingressRecorded === false)).toBe(true);
    expect(decide(workspace, controlRequest(pre(workspace, "Read", input))).decision).toBe("allow");
    // A latch file AMC cannot read still latches its own workspace, and no other (hookAuditLatch.test.ts covers the rest).
    const other = claudeWorkspace();
    mkdirSync(join(process.env.AMC_HOME!, "state", "hook-audit-latch"), { recursive: true });
    writeFileSync(join(process.env.AMC_HOME!, "state", "hook-audit-latch", `${workspaceScope(other)}.json`), "not json");
    expect(() => decide(other, controlRequest(pre(other, "Read", { file_path: join(cwdOf(other), "workspace", "public.txt") })))).toThrowError(/latched/);
    expect(decide(workspace, controlRequest(pre(workspace, "Read", input))).decision).toBe("allow");
    rmSync(join(process.env.AMC_HOME!, "state", "hook-audit-latch", `${workspaceScope(other)}.json`));
    expect(claudeActionId(session, "toolu_latch")).toMatch(/^cc\./);
  });
});

describe("first writer never owns the record (round two)", () => {
  function allowRead(workspace: string, toolUseId: string) {
    const input = { file_path: join(cwdOf(workspace), "workspace", "public.txt") };
    const result = decide(workspace, controlRequest({ ...pre(workspace, "Read", input), tool_use_id: toolUseId }));
    expect(result.decision).toBe("allow");
    return { result, input, session: String(recorded("PreToolUse-read", workspace).session_id) };
  }
  const postAs = (workspace: string, leaseId: string, body: Record<string, unknown>) => () => handleHookControlRequest({ workspace, authenticatedAgentId: agentId,
    provider: "claude-code", lease: { leaseId, expiresTs: Date.now() + 60_000 }, rawInput: JSON.stringify({ hook_event_name: "PostToolUse", tool_name: "Read",
      ingressRecorded: true, ...body }) });
  const rows = (workspace: string, actionId: string) => {
    const ledger = openLedger(workspace);
    try {
      return ledger.getAllEvents().map((event) => JSON.parse(event.meta_json) as Record<string, unknown>)
        .filter((meta) => meta.postExecutionSchemaVersion === 1 && meta.actionId === actionId);
    } finally {
      ledger.close();
    }
  };

  test("an attacker posts first from another lease or without the decision binding: refused and unmatched; the real hook's outcome is then the call's", () => {
    const workspace = claudeWorkspace();
    const { result, input, session } = allowRead(workspace, "toolu_first");
    const call = { session_id: session, tool_use_id: "toolu_first", tool_input: input };
    expect(postAs(workspace, "lease_attacker", { ...call, decisionReceiptSha256: result.receiptSha256 }))
      .toThrowError(/does not come with the lease that obtained the decision/);
    expect(postAs(workspace, lease.leaseId, { ...call, decisionReceiptSha256: "0".repeat(64) }))
      .toThrowError(/does not name the decision it follows/);
    const real = postAs(workspace, lease.leaseId, { ...call, decisionReceiptSha256: result.receiptSha256 })() as unknown as Record<string, unknown>;
    expect(real).toMatchObject({ recorded: true });
    const recordedRows = rows(workspace, result.actionId);
    expect(recordedRows).toHaveLength(3);
    expect(recordedRows.filter((row) => row.matched === true)).toEqual([expect.objectContaining({ bindingRefusal: null, authorizationMismatch: false })]);
    expect(inspectHookActionLifecycle({ workspace, agentId, actionId: result.actionId })).toMatchObject({ authorizationMismatch: false, observationConflict: true });
  });

  test("a lease holder posts first with the authorized input; the real hook's rewritten input is kept beside it as a flagged conflict", () => {
    const workspace = claudeWorkspace();
    const { result, input, session } = allowRead(workspace, "toolu_race");
    const call = { session_id: session, tool_use_id: "toolu_race", decisionReceiptSha256: result.receiptSha256 };
    postAs(workspace, lease.leaseId, { ...call, tool_input: input })();
    expect(postAs(workspace, lease.leaseId, { ...call, tool_input: { ...input, offset: 9 } })).toThrowError(/kept both and flagged this one/);
    const kept = rows(workspace, result.actionId);
    expect(kept).toHaveLength(2);
    expect(kept.find((row) => row.conflictOf !== undefined)).toMatchObject({ authorizationMismatch: true });
    expect(inspectHookActionLifecycle({ workspace, agentId, actionId: result.actionId })).toMatchObject({ authorizationMismatch: true, observationConflict: true });
  });
});

describe("authorization bypass (round two)", () => {
  function settingsLocal(workspace: string) {
    const path = join(workspace, ".claude", "settings.local.json");
    return { path, value: JSON.parse(readFileSync(path, "utf8")) as { hooks: Record<string, Array<{ matcher?: string; hooks: Array<Record<string, unknown>> }>> } };
  }

  test("AMC's hook with a matcher that skips some tools leaves the session not governed and the claim not enforced", () => {
    const workspace = claudeWorkspace();
    const { path, value } = settingsLocal(workspace);
    value.hooks.PreToolUse![0]!.matcher = "Bash";
    writeFileSync(path, JSON.stringify(value, null, 2));
    expect(decide(workspace, controlRequest(pre(workspace, "Read", { file_path: join(cwdOf(workspace), "workspace", "public.txt") }))).reason)
      .toContain("does not match every tool");
    const status = getHookIntegrationStatus({ workspace, provider: "claude-code" });
    expect(status.state).not.toBe("installed");
    expect(status.issues).toContain("AMC's Claude Code hooks do not match every tool (a matcher other than *)");
    expect(status.governance?.claim).not.toBe("enforced_at_claude_code_pretooluse");
  });

  test("AMC's handler copied under another event leaves the session not governed", () => {
    const workspace = claudeWorkspace();
    const { path, value } = settingsLocal(workspace);
    value.hooks.PermissionRequest = [{ matcher: "*", hooks: [value.hooks.PreToolUse![0]!.hooks[0]!] }];
    writeFileSync(path, JSON.stringify(value, null, 2));
    expect(decide(workspace, controlRequest(pre(workspace, "Read", { file_path: join(cwdOf(workspace), "workspace", "public.txt") }))).reason)
      .toContain("not the one this installation wrote");
  });

  test("each installed handler names its event; a payload of another event is refused and never allowed", async () => {
    const port = await freePort();
    const bridgeBase = `http://127.0.0.1:${port}`;
    const workspace = claudeWorkspace({ bridgeBase });
    const bridge = await startBridgeServer({ workspace, host: "127.0.0.1", port, gatewayBaseUrl: "http://127.0.0.1:1" });
    try {
      const { value } = settingsLocal(workspace);
      for (const event of ["PreToolUse", "PostToolUse", "PostToolUseFailure", "SessionStart", "Stop", "UserPromptSubmit"]) {
        const args = value.hooks[event]![0]!.hooks[0]!.args as string[];
        expect(args.slice(-2), event).toEqual(["--event", event]);
      }
      const opts = { provider: "claude-code" as const, mode: "control" as const, agent: agentId, tokenFile: ".amc/hooks/claude-code.lease", bridgeUrl: bridgeBase };
      // With a live Bridge, a Stop payload would be recorded and answered `{}` with exit 0: at PreToolUse that lets the tool run.
      const stopAtPre = await runHookForward({ ...opts, event: "PreToolUse" }, async () => JSON.stringify(recorded("Stop-stop", workspace)), workspace, 5_000);
      expect(stopAtPre.exitCode).toBe(2);
      expect(stopAtPre.stdout).toContain('"permissionDecision":"deny"');
      const allowedRead = pre(workspace, "Read", { file_path: join(cwdOf(workspace), "workspace", "public.txt") });
      const preAtStop = await runHookForward({ ...opts, event: "Stop" }, async () => JSON.stringify(allowedRead), workspace, 5_000);
      expect(preAtStop.exitCode).toBe(0);
      expect(preAtStop.stdout).not.toContain("allow");
    } finally {
      await bridge.close();
    }
  });

  test("tool aliases and legacy names are unmapped", () => {
    const workspace = claudeWorkspace();
    const file = join(cwdOf(workspace), "workspace", "public.txt");
    for (const name of ["MultiEdit", "NotebookEdit", "Task", "Agent", "FileRead", "Read\u200b", "LS"]) {
      expect(decide(workspace, controlRequest(pre(workspace, name, { file_path: file }))).decision, name).toBe("deny");
    }
  });

  test("a decision never carries across sessions: the same tool_use_id in an unregistered session is denied, not replayed", () => {
    const workspace = claudeWorkspace();
    const input = { file_path: join(cwdOf(workspace), "workspace", "public.txt") };
    const first = decide(workspace, controlRequest({ ...pre(workspace, "Read", input), tool_use_id: "toolu_shared" }));
    expect(first.decision).toBe("allow");
    const other = decide(workspace, controlRequest({ ...pre(workspace, "Read", input), tool_use_id: "toolu_shared", session_id: "another-session" }));
    expect(other).toMatchObject({ decision: "deny", idempotentReplay: false });
    expect(other.actionId).not.toBe(first.actionId);
  });
});

describe("TOCTOU parser differential (round two)", () => {
  const preBytes = (workspace: string) => Buffer.from(JSON.stringify(pre(workspace, "Read", { file_path: join(cwdOf(workspace), "workspace", "public.txt") })), "utf8");

  test("AMC decides on the payload bytes as received and binds their digest and the resolved target", () => {
    const workspace = claudeWorkspace();
    const bytes = preBytes(workspace);
    const result = decide(workspace, controlRequest(bytes));
    expect(result.decision).toBe("allow");
    const ledger = openLedger(workspace);
    try {
      const meta = JSON.parse(ledger.getAllEvents().find((event) => event.id === result.eventId)!.meta_json) as Record<string, unknown>;
      expect(meta.claudePayloadSha256).toBe(sha256Hex(bytes));
      expect(meta.resolvedTargetsSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(meta.leaseId).toBe(lease.leaseId);
    } finally {
      ledger.close();
    }
  });

  test("a byte-order mark, invalid UTF-8, a lone surrogate or a repeated key inside the payload is refused", () => {
    const workspace = claudeWorkspace();
    const text = preBytes(workspace).toString("utf8");
    const bad = [
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text)]),
      Buffer.concat([Buffer.from(text.slice(0, -2)), Buffer.from([0xff]), Buffer.from(text.slice(-2))]),
      Buffer.from(text.replace("public.txt", "public\\ud800.txt")),
      Buffer.from(text.replace('"tool_name":"Read"', '"tool_name":"Read","tool_name":"Write"')),
    ];
    for (const bytes of bad) {
      expect(() => decide(workspace, controlRequest(bytes)), bytes.toString("utf8").slice(0, 40)).toThrowError(expect.objectContaining<Partial<HookControlError>>({ statusCode: 400 }));
    }
  });

  test("a Bash command in another Unicode normalization is not the pure form", () => {
    const workspace = claudeWorkspace();
    const result = decide(workspace, controlRequest(pre(workspace, "Bash", { command: "'/bin/echo' 'cafe\u0301'" })));
    expect(result.reason).toContain("only in its pure form");
  });

  test("the forwarder refuses stdin with a byte-order mark or invalid UTF-8", async () => {
    const workspace = claudeWorkspace();
    const opts = { provider: "claude-code" as const, mode: "control" as const, agent: agentId, tokenFile: ".amc/hooks/claude-code.lease", bridgeUrl: "http://127.0.0.1:3212" };
    for (const bytes of [Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), preBytes(workspace)]), Buffer.concat([preBytes(workspace), Buffer.from([0xc3])])]) {
      expect(await runHookForward(opts, async () => bytes, workspace, 3_000)).toMatchObject({ exitCode: 2, stderr: "AMC hook control input invalid; action denied.\n" });
    }
  });
});
