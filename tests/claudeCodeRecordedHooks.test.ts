/**
 * P1-23: AMC's Claude Code hooks against the payloads recorded from the pinned Claude Code release
 * (tests/fixtures/harness-hooks/claude-code/2.1.296, recorded by the scripted run in
 * qualification/2026-10-12-P1-23). Every recorded fixture drives at least one case.
 */
import { copyFileSync, linkSync, mkdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { authorizationRecordDigest } from "../src/actions/authorizationRecord.js";
import { runHookForward } from "../src/adapters/hookForwarder.js";
import { installHookIntegration } from "../src/adapters/hookIntegration.js";
import { claudeActionId, claudeHookPayloadSchema, claudeSessionSha256 } from "../src/adapters/hookProviders/claudeCode.js";
import { cachedFileSha256, clearPiDigestCache } from "../src/adapters/pi/piInstall.js";
import { claudeCodeSessionRegistration } from "../src/bridge/claudeCodeSessionRegistry.js";
import { verifyProviderHookControlResult } from "../src/bridge/hookControl.js";
import { handleHookControlRequest } from "../src/bridge/hookControlRoute.js";
import { HookControlError, serializeProviderControlResponse } from "../src/bridge/hookProviders.js";
import { assertContract } from "../src/contracts/index.js";
import { getPurposeKeyHistory } from "../src/keys/signingKeys.js";
import { revokeLeaseForCli } from "../src/leases/leaseCli.js";
import { openLedger } from "../src/ledger/ledger.js";
import { verifyReceipt } from "../src/receipts/receipt.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { sha256Hex } from "../src/utils/hash.js";
import { inspectHookActionLifecycle } from "../src/watch/hookActionLifecycle.js";
import { agentId, boundClaudeCode, claudeWorkspace, controlRequest, decide, fixtureNames, lease, recorded, register } from "./helpers/claudeCodeHookFixtures.js";
import { removeFixtureWorkspaces } from "./helpers/piHookFixtures.js";

afterEach(() => {
  removeFixtureWorkspaces();
  clearPiDigestCache();
});

const session = (workspace: string) => String(recorded("SessionStart-startup", workspace).session_id);
const route = (workspace: string, body: unknown) =>
  handleHookControlRequest({ workspace, authenticatedAgentId: agentId, provider: "claude-code", lease, rawInput: JSON.stringify(body) }) as unknown as Record<string, unknown>;

function decisionRow(workspace: string, eventId: string) {
  const ledger = openLedger(workspace);
  try {
    const event = ledger.getAllEvents().find((row) => row.id === eventId)!;
    const payload = readEventPayload(workspace, event);
    if (payload.status !== "ok") throw new Error("payload unreadable");
    return { meta: JSON.parse(event.meta_json) as Record<string, unknown>, payload: JSON.parse(payload.bytes.toString("utf8")) as Record<string, unknown> };
  } finally {
    ledger.close();
  }
}

function ledgerText(workspace: string): string {
  const ledger = openLedger(workspace);
  try {
    return JSON.stringify(ledger.getAllEvents().map((event) => [event.meta_json, readEventPayload(workspace, event)]));
  } finally {
    ledger.close();
  }
}

/** A PreToolUse fixture with its tool input replaced (the recorded shape otherwise unchanged). */
function withInput(workspace: string, name: string, toolInput: Record<string, unknown>): Record<string, unknown> {
  return { ...recorded(name, workspace), tool_input: toolInput };
}

describe("recorded Claude Code 2.1.296 payloads", () => {
  test("every recorded fixture parses under the pinned payload schema, and an unknown field is refused", () => {
    expect(fixtureNames()).toHaveLength(17);
    for (const name of fixtureNames()) {
      const payload = JSON.parse(readFileSync(join("tests", "fixtures", "harness-hooks", "claude-code", "2.1.296", name), "utf8")) as Record<string, unknown>;
      expect(claudeHookPayloadSchema.safeParse(payload).success, name).toBe(true);
      expect(claudeHookPayloadSchema.safeParse({ ...payload, unexpected_field: true }).success, name).toBe(false);
    }
  });

  test("PreToolUse Bash: a deny with exact response bytes, a verifying receipt bound to the request, the call and AMC's action id", () => {
    const workspace = claudeWorkspace();
    const payload = recorded("PreToolUse-bash", workspace);
    const rawInput = controlRequest(payload);
    const result = decide(workspace, rawInput);
    const actionId = claudeActionId(String(payload.session_id), String(payload.tool_use_id));

    expect(result).toMatchObject({ provider: "claude-code", actionId, decision: "deny", idempotentReplay: false });
    const bytes = serializeProviderControlResponse(result.providerResponse);
    expect(sha256Hex(Buffer.from(bytes, "utf8"))).toBe(result.providerResponseSha256);
    const receipt = verifyReceipt(result.receipt, getPurposeKeyHistory(workspace, "receipt"));
    expect(receipt.ok).toBe(true);
    expect(receipt.payload).toMatchObject({ v: 2, kind: "action_state", state: "denied", providerId: "hook-control:claude-code", agentId,
      executionId: actionId, idempotencyKey: payload.tool_use_id, authorizationRecordDigest: null, body_sha256: result.providerResponseSha256,
      enforcement: { level: "enforced", boundary: "claude-code:PreToolUse" } });
    expect(decisionRow(workspace, result.eventId).meta).toMatchObject({ rawInputSha256: sha256Hex(Buffer.from(rawInput, "utf8")), claudeCodeVersion: "2.1.296" });
    expect(verifyProviderHookControlResult({ workspace, authenticatedAgentId: agentId, provider: "claude-code", rawInput, result })).toEqual({ ok: true, error: null });
    // Bound to this exact request: the same call with another nonce, or another call's bytes, does not verify.
    expect(verifyProviderHookControlResult({ workspace, authenticatedAgentId: agentId, provider: "claude-code", rawInput: controlRequest(payload), result }).ok).toBe(false);
  });

  test("PreToolUse MCP tool: denied as unmapped, with no authorization record", () => {
    const workspace = claudeWorkspace();
    const result = decide(workspace, controlRequest(recorded("PreToolUse-mcp", workspace)));
    expect(result).toMatchObject({ decision: "deny", reason: "Provider tool mcp__amcprobe__echo is not mapped to an allowed ToolHub tool." });
    expect(decisionRow(workspace, result.eventId).payload.authorizationRecord).toBeNull();
  });

  test("PreToolUse Read, Write, Edit and WebFetch are decided on the recorded shapes; an allowed read binds the authorization record", () => {
    const workspace = claudeWorkspace();
    for (const name of ["PreToolUse-read", "PreToolUse-write", "PreToolUse-edit", "PreToolUse-webfetch", "PreToolUse-failing"]) {
      // One session, so each call gets its own tool_use_id (the recordings each used the scripted model's first id).
      const result = decide(workspace, controlRequest({ ...recorded(name, workspace), tool_use_id: `toolu_${name}` }));
      // Under the default signed policies none of these recorded calls is allowed: paths outside ./workspace, writes
      // that need approval, an unlisted fetch, a shell command that needs an exec ticket.
      expect(result.decision, name).toBe("deny");
    }
    const allowed = decide(workspace, controlRequest({ ...withInput(workspace, "PreToolUse-read", { file_path: join(recorded("PreToolUse-read", workspace).cwd as string, "workspace", "public.txt") }),
      tool_use_id: "toolu_allowed_read" }));
    expect(allowed).toMatchObject({ decision: "allow", canonicalToolName: "fs.read" });
    const row = decisionRow(workspace, allowed.eventId);
    const record = assertContract("authorization-record", row.payload.authorizationRecord);
    const digest = authorizationRecordDigest(record);
    expect(row.meta).toMatchObject({ authorizationRecordDigest: digest, authorizedAction: { toolName: "fs.read", actionClass: "READ_ONLY" } });
    expect(record).toMatchObject({ executionId: allowed.actionId, idempotencyKey: "toolu_allowed_read", action: { adapterId: "hook:claude-code" },
      delegation: { leaseId: lease.leaseId } });
    expect(record.principal.authenticatedVia).not.toBe("lease");
    expect(verifyReceipt(allowed.receipt, getPurposeKeyHistory(workspace, "receipt")).payload).toMatchObject({ state: "authorized", authorizationRecordDigest: digest });
  });

  test("Write or Edit of AMC's hook configuration is denied, by the path Claude Code opens: symlinks followed, any case", () => {
    const workspace = claudeWorkspace();
    const cwd = String(recorded("PreToolUse-write", workspace).cwd);
    mkdirSync(join(cwd, "workspace"), { recursive: true });
    symlinkSync(join(cwd, ".claude", "settings.local.json"), join(cwd, "workspace", "notes.json"));
    const targets = [join(cwd, ".claude", "settings.local.json"), join(cwd, ".claude", "settings.json"), join(cwd, "workspace", "notes.json"),
      join(cwd, ".amc", "hooks", "claude-code.json"), join(cwd, ".amc", "action-policy.yaml")];
    if (process.platform === "darwin") targets.push(join(cwd, ".CLAUDE", "SETTINGS.LOCAL.JSON"));
    for (const file_path of targets) {
      const write = decide(workspace, controlRequest({ ...withInput(workspace, "PreToolUse-write", { file_path, content: "{}" }),
        tool_use_id: `toolu_write_${sha256Hex(file_path).slice(0, 8)}` }));
      expect(write, file_path).toMatchObject({ decision: "deny", reason: "AMC protects its hook configuration." });
      const edit = decide(workspace, controlRequest({ ...withInput(workspace, "PreToolUse-edit", { file_path, old_string: "a", new_string: "b", replace_all: false }),
        tool_use_id: `toolu_edit_${sha256Hex(file_path).slice(0, 8)}` }));
      expect(edit.reason, file_path).toBe("AMC protects its hook configuration.");
    }
  });

  test("a path Claude Code would not open as written, or a working directory outside the workspace, is denied", () => {
    const workspace = claudeWorkspace();
    const cwd = String(recorded("PreToolUse-read", workspace).cwd);
    for (const [index, file_path] of [`${cwd}/workspace/../workspace/public.txt`, "workspace/public.txt", "~/notes.txt", `${cwd}/workspace/`].entries()) {
      const result = decide(workspace, controlRequest({ ...withInput(workspace, "PreToolUse-read", { file_path }), tool_use_id: `toolu_path_${index}` }));
      expect(result.decision, file_path).toBe("deny");
    }
    const outside = decide(workspace, controlRequest({ ...recorded("PreToolUse-read", workspace), cwd: "/tmp", tool_use_id: "toolu_cwd" }));
    expect(outside.reason).toContain("working directory is outside this AMC workspace");
  });

  test("a session without a registration, a changed hook configuration and an unqualified Claude Code are not governed", () => {
    const unregistered = claudeWorkspace({ register: false });
    const result = decide(unregistered, controlRequest(recorded("PreToolUse-read", unregistered)));
    expect(result.reason).toBe("This Claude Code session has no AMC registration, so it is not governed; AMC denied the call.");
    expect(verifyReceipt(result.receipt, getPurposeKeyHistory(unregistered, "receipt")).payload).toMatchObject({ enforcement: { level: "advisory" } });

    const tampered = claudeWorkspace();
    const settings = join(String(recorded("PreToolUse-read", tampered).cwd), ".claude", "settings.json");
    writeFileSync(settings, JSON.stringify({ hooks: { PreToolUse: [{ matcher: "*", hooks: [{ type: "command", command: "/bin/true" }] }] } }));
    expect(decide(tampered, controlRequest(recorded("PreToolUse-read", tampered))).reason)
      .toContain("that is not AMC's can replace a tool's input after AMC allows it");
    expect(() => register(tampered, "another-session")).toThrowError(expect.objectContaining<Partial<HookControlError>>({ code: "HOOK_CONTROL_INPUT_INVALID" }));
    rmSync(settings);

    const old = claudeWorkspace({ version: "2.1.294" });
    expect(decide(old, controlRequest(recorded("PreToolUse-read", old))).reason).toBe("AMC has not qualified Claude Code 2.1.294, so AMC denied the call.");
  });

  test("the registration checks the session's Claude Code process and the bound binary on disk, and every decision rechecks the binary", () => {
    const workspace = claudeWorkspace({ register: false });
    expect(() => register(workspace, "s-1", undefined, 999_999)).toThrowError(/not running the Claude Code the installation bound/);

    // A Claude Code bound at its own path (a link to this Node), replaced after the session registered.
    const binary = join(workspace, "claude-bin");
    try {
      linkSync(process.execPath, binary);
    } catch {
      copyFileSync(process.execPath, binary);
    }
    installHookIntegration({ workspace, provider: "claude-code", agentId, mode: "control", claudeCodeInstall: { ...boundClaudeCode(), binaryPath: binary } });
    register(workspace, session(workspace));
    expect(decide(workspace, controlRequest(recorded("PreToolUse-mcp", workspace))).reason).toContain("not mapped");
    unlinkSync(binary);
    writeFileSync(binary, "not claude");
    expect(decide(workspace, controlRequest({ ...recorded("PreToolUse-mcp", workspace), tool_use_id: "toolu_after_swap" })).reason)
      .toContain("the Claude Code on disk is not the one the installation bound");
    expect(cachedFileSha256(binary)).toBe(sha256Hex(Buffer.from("not claude")));
  });

  test("UserPromptSubmit: a revoked lease blocks, a valid one admits, and the ledger never holds the prompt text", () => {
    const workspace = claudeWorkspace();
    const prompt = recorded("UserPromptSubmit-prompt", workspace);
    const body = { hook_event_name: "UserPromptSubmit", session_id: prompt.session_id,
      prompt: { sha256: sha256Hex(Buffer.from(String(prompt.prompt), "utf8")), length: Buffer.byteLength(String(prompt.prompt), "utf8") } };
    expect(route(workspace, body)).toMatchObject({ admitted: true, recorded: true });
    expect(ledgerText(workspace)).not.toContain(String(prompt.prompt));
    expect(ledgerText(workspace)).toContain(body.prompt.sha256);

    const manifest = JSON.parse(readFileSync(join(workspace, ".amc", "hooks", "claude-code.json"), "utf8")) as { leaseId: string };
    revokeLeaseForCli({ workspace, leaseId: manifest.leaseId, reason: "P1-23 admission test" });
    expect(route(workspace, body)).toMatchObject({ admitted: false, reason: expect.stringContaining("hook lease is not valid") });
    expect(() => route(workspace, { ...body, prompt: String(prompt.prompt) })).toThrowError(/does not match its schema/);
  });

  test("SessionStart and Stop are observed records only: a registration and a turn end, never a decision or a claim", () => {
    const workspace = claudeWorkspace({ register: false });
    const sessionId = session(workspace);
    const registered = register(workspace, sessionId) as unknown as Record<string, unknown>;
    expect(registered).toMatchObject({ registered: true, idempotentReplay: false, record: { sessionSha256: claudeSessionSha256(sessionId), claudeCodeVersion: "2.1.296", qualified: true } });
    expect(register(workspace, sessionId)).toMatchObject({ idempotentReplay: true });
    const stopped = route(workspace, { hook_event_name: "Stop", session_id: recorded("Stop-stop", workspace).session_id });
    expect(stopped).toMatchObject({ recorded: true, provider: "claude-code" });
    const ledger = openLedger(workspace);
    try {
      const metas = ledger.getAllEvents().map((event) => JSON.parse(event.meta_json) as Record<string, unknown>);
      expect(metas.some((meta) => meta.controlSchemaVersion !== undefined)).toBe(false);
      expect(metas.filter((meta) => meta.kind === "amc.claude-code-turn-end/v1")).toHaveLength(1);
      expect(ledger.getAllEvents().some((event) => event.meta_json.includes(sessionId))).toBe(false);
    } finally {
      ledger.close();
    }
    const reopened = openLedger(workspace);
    try {
      expect(claudeCodeSessionRegistration(reopened, agentId, sessionId).status).toBe("registered");
    } finally {
      reopened.close();
    }
  });

  test("PostToolUse with the authorized input records no mismatch; with changed input, authorizationMismatch: true in the lifecycle", () => {
    const workspace = claudeWorkspace();
    const cwd = String(recorded("PreToolUse-read", workspace).cwd);
    const input = { file_path: join(cwd, "workspace", "public.txt") };
    const allowed = decide(workspace, controlRequest(withInput(workspace, "PreToolUse-read", input)));
    expect(allowed.decision).toBe("allow");
    const post = recorded("PostToolUse-read", workspace);
    const same = route(workspace, { hook_event_name: "PostToolUse", session_id: post.session_id, tool_use_id: post.tool_use_id, tool_name: "Read", tool_input: input });
    expect(decisionRow(workspace, String(same.eventId)).meta).toMatchObject({ authorizationMismatch: false });
    expect(inspectHookActionLifecycle({ workspace, agentId, actionId: allowed.actionId }).authorizationMismatch).toBe(false);

    // The recorded run where another hook rewrote the Bash input: PostToolUse reports the input that ran.
    const rewritten = recorded("PostToolUse-rewritten-by-another-hook", workspace);
    const changed = route(workspace, { hook_event_name: "PostToolUseFailure", session_id: post.session_id, tool_use_id: post.tool_use_id,
      tool_name: "Read", tool_input: { ...input, offset: 2, note: (rewritten.tool_input as Record<string, unknown>).command } });
    expect(decisionRow(workspace, String(changed.eventId)).meta).toMatchObject({ authorizationMismatch: true, outcome: "failed" });
    expect(inspectHookActionLifecycle({ workspace, agentId, actionId: allowed.actionId }).authorizationMismatch).toBe(true);

    // A tool that ran with no allow decision AMC bound is a mismatch too.
    const unbound = route(workspace, { hook_event_name: "PostToolUse", session_id: post.session_id, tool_use_id: "toolu_never_decided", tool_name: "Read", tool_input: input });
    expect(decisionRow(workspace, String(unbound.eventId)).meta).toMatchObject({ authorizationMismatch: true, authorizedArgumentsDigest: null });
  });

  test("the forwarder answers each session hook as its event needs when AMC is unreachable: deny, block, never force a stop", async () => {
    const workspace = claudeWorkspace();
    const opts = { provider: "claude-code" as const, mode: "control" as const, agent: agentId, tokenFile: ".amc/hooks/claude-code.lease", bridgeUrl: "http://127.0.0.1:9" };
    const run = (name: string) => runHookForward(opts, async () => JSON.stringify(recorded(name, workspace)), workspace, 3_000);
    expect(await run("SessionStart-startup")).toMatchObject({ exitCode: 0, stdout: expect.stringContaining("AMC did not register this Claude Code session") });
    expect(await run("Stop-stop")).toMatchObject({ exitCode: 0, stdout: expect.stringContaining("systemMessage") });
    const prompt = await run("UserPromptSubmit-prompt");
    expect(prompt.exitCode).toBe(2);
    expect(JSON.parse(prompt.stdout)).toMatchObject({ decision: "block", hookSpecificOutput: { hookEventName: "UserPromptSubmit", suppressOriginalPrompt: true } });
    expect(await run("PreToolUse-bash")).toMatchObject({ exitCode: 2 });
    expect(await run("PostToolUse-bash")).toMatchObject({ exitCode: 2, stdout: "{}\n" });
    const unknown = await runHookForward(opts, async () => JSON.stringify({ ...recorded("PreToolUse-bash", workspace), surprise: 1 }), workspace, 3_000);
    expect(unknown).toMatchObject({ exitCode: 2, stderr: "AMC hook control input invalid; action denied.\n" });
  });
});
