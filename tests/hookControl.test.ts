import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import * as auditLatch from "../src/bridge/hookAuditLatch.js";
import { loadKeyProvider } from "../src/keys/purposeProviders.js";
import * as approvalEngine from "../src/approvals/approvalEngine.js";
import { decideApprovalForIntent, verifyApprovalForExecution } from "../src/approvals/approvalEngine.js";
import { listApprovalRequests, loadApprovalConsumed } from "../src/approvals/approvalChainStore.js";
import { defaultApprovalPolicy, initApprovalPolicy } from "../src/approvals/approvalPolicyEngine.js";
import { getHookIntegrationStatus, installHookIntegration, mapProviderHookEvent } from "../src/adapters/hookIntegration.js";
import { forwardProviderHookControl, forwardProviderHookEvent } from "../src/adapters/hookForwarder.js";
import { startBridgeServer } from "../src/bridge/bridgeServer.js";
import { evaluateProviderHookControl, HookControlError, verifyProviderHookControlResult } from "../src/bridge/hookControl.js";
import { renderProviderControlResponse, validateProviderControlResponse } from "../src/bridge/hookProviders.js";
import { questionBank } from "../src/diagnostic/questionBank.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import { initActionPolicy, defaultActionPolicy } from "../src/governor/actionPolicyEngine.js";
import * as ledgerApi from "../src/ledger/ledger.js";
import { hashBinaryOrPath, openLedger, verifyEvidenceEventIntegrity } from "../src/ledger/ledger.js";
import { verifyReceipt } from "../src/receipts/receipt.js";
import { getPublicKeyHistory } from "../src/crypto/keys.js";
import { initWorkspace } from "../src/workspace.js";
import type { DiagnosticReport } from "../src/types.js";
import { issueLeaseToken } from "../src/leases/leaseSigner.js";
import { workspaceIdFromDirectory } from "../src/workspaces/workspaceId.js";
import { verifyLeaseToken } from "../src/leases/leaseVerifier.js";
import { canonicalize } from "../src/utils/json.js";
import { sha256Hex } from "../src/utils/hash.js";
import { inspectHookActionLifecycle } from "../src/watch/hookActionLifecycle.js";
import * as claudeProcess from "../src/adapters/hookProviders/claudeCode.js";
import { claudeActionId } from "../src/adapters/hookProviders/claudeCode.js";
import { claudeEnvelope } from "../src/adapters/hookProviders/claudeCodePayloads.js";
import { handleHookControlRequest, handleHookControlRequestAsync } from "../src/bridge/hookControlRoute.js";
import { getPurposeKeyHistory } from "../src/keys/signingKeys.js";
import { boundClaudeCode } from "./helpers/claudeCodeHookFixtures.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { writeSealedRun } from "./helpers/actionPolicyFixtures.js";

const roots: string[] = [];
const actualClaudeHookSources = claudeProcess.claudeSessionHookSources;

function newWorkspace(): string {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-hook-control-")));
  roots.push(workspace);
  process.env.AMC_VAULT_PASSPHRASE = "hook-control-test-passphrase";
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  writeRuntimeFirewallPolicy({ workspace: workspace, mode: "observe" }); // AXR-01: ToolHub and hook control apply the runtime firewall as the native pipeline does; unsigned, it blocks every call.
  initApprovalPolicy(workspace);
  return workspace;
}

function installObservedRun(workspace: string, agentId: string): void {
  const now = Date.now();
  const report: DiagnosticReport = {
    agentId,
    runId: "run_hook_control",
    ts: now,
    windowStartTs: now - 60_000,
    windowEndTs: now,
    status: "VALID",
    verificationPassed: true,
    trustBoundaryViolated: false,
    trustBoundaryMessage: null,
    integrityIndex: 0.95,
    trustLabel: "HIGH TRUST",
    targetProfileId: null,
    layerScores: [],
    questionScores: questionBank.map((question) => ({
      questionId: question.id,
      claimedLevel: 5,
      supportedMaxLevel: 5,
      finalLevel: 5,
      confidence: 0.95,
      evidenceEventIds: ["ev_hook_control"],
      flags: [],
      narrative: "AMC-owned hook control fixture",
    })),
    inflationAttempts: [],
    unsupportedClaimCount: 0,
    contradictionCount: 0,
    correlationRatio: 1,
    invalidReceiptsCount: 0,
    correlationWarnings: [],
    evidenceCoverage: 1,
    evidenceTrustCoverage: { observed: 1, attested: 0, selfReported: 0 },
    targetDiff: [],
    prioritizedUpgradeActions: [],
    evidenceToCollectNext: [],
    runSealSig: "fixture",
    reportJsonSha256: "fixture",
  };
  writeSealedRun(workspace, report); // the governor reads only sealed, ledger-anchored runs
}

function permitReadAndWrite(workspace: string): void {
  const policy = defaultActionPolicy();
  for (const rule of policy.actions) {
    if (rule.actionClass !== "READ_ONLY" && rule.actionClass !== "WRITE_LOW") continue;
    rule.minEffectiveQuestionLevels = {};
    rule.requireTrustTierAtLeast = "OBSERVED";
    rule.requireAssurancePacks = {};
    rule.allowExecute = true;
    rule.requireExecTicket = false;
  }
  policy.riskTierDefaults.low.requireSandboxForExecute = false;
  policy.riskTierDefaults.medium.requireSandboxForExecute = false;
  initActionPolicy(workspace, policy);
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const address = server.address();
  await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
  if (!address || typeof address === "string") throw new Error("server did not bind");
  return address.port;
}

/**
 * Claude Code control decides only for a session registered under a signed Claude Code control installation (P1-23):
 * install one bound to this process's Node (the session process the registration checks) and register `sessionId`.
 */
function claudeControlled(workspace: string, agentId: string, sessionId = "private-session", bridgeBase?: string): void {
  // These policy tests register their own Node process. OS process inspection has separate security tests.
  vi.spyOn(claudeProcess, "processExecutable").mockImplementation(pid => pid === process.pid ? realpathSync(process.execPath) : null);
  vi.spyOn(claudeProcess, "claudeSessionHookSources").mockImplementation(({ pid: _pid, ...input }) => actualClaudeHookSources(input));
  installHookIntegration({ workspace, provider: "claude-code", agentId, mode: "control", claudeCodeInstall: boundClaudeCode(), ...(bridgeBase ? { bridgeBase } : {}) });
  const configDir = join(workspace, ".fixture-home", ".claude");
  mkdirSync(configDir, { recursive: true });
  handleHookControlRequest({ workspace, authenticatedAgentId: agentId, provider: "claude-code",
    rawInput: JSON.stringify({ hook_event_name: "SessionStart", session_id: sessionId, amc: { claudePid: process.pid, configDir } }) });
}

/** Claude Code's pinned PreToolUse payload for `fields`, in the envelope AMC's forwarder sends (raw bytes and a nonce). */
function claudeRequest(workspace: string, fields: { tool_name: string; tool_use_id: string; tool_input: Record<string, unknown>; session_id?: string },
  nonce = "nonce-fixture-000000000000"): string {
  return claudeEnvelope(Buffer.from(JSON.stringify({ session_id: "private-session", transcript_path: "/private/transcript.jsonl",
    cwd: realpathSync.native(workspace), permission_mode: "default", hook_event_name: "PreToolUse", ...fields })), nonce);
}

afterEach(() => {
  vi.restoreAllMocks();
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("provider-native signed hook control", () => {
  test("renders exact pinned Claude and Gemini native response shapes", () => {
    // P1-23: AMC only restricts Claude Code; its allow is the empty answer, so Claude Code's own permissions still apply.
    expect(renderProviderControlResponse("claude-code", "allow", "signed allow")).toEqual({});
    expect(renderProviderControlResponse("claude-code", "deny", "signed deny")).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: "signed deny",
      },
    });
    expect(renderProviderControlResponse("claude-code", "ask", "approval required")).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: "approval required",
      },
    });
    expect(renderProviderControlResponse("gemini-cli", "allow", "signed allow")).toEqual({
      decision: "allow",
    });
    expect(renderProviderControlResponse("gemini-cli", "deny", "signed deny")).toEqual({
      decision: "deny",
      reason: "signed deny",
    });
    expect(renderProviderControlResponse("gemini-cli", "ask", "approval required")).toEqual({
      decision: "deny",
      reason: expect.stringContaining("Gemini CLI BeforeTool does not support ask"),
    });
    expect(validateProviderControlResponse("claude-code", {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        permissionDecisionReason: "signed allow",
        updatedInput: { command: "unexpected rewrite" },
      },
    })).toBe(false);
    expect(validateProviderControlResponse("gemini-cli", {
      decision: "allow",
      hookSpecificOutput: { tool_input: { command: "unexpected rewrite" } },
    })).toBe(false);
  });

  test("allows a policy-permitted Claude read and binds the exact response to a signed receipt", () => {
    const workspace = newWorkspace();
    const agentId = "controlled-reader";
    installObservedRun(workspace, agentId);
    permitReadAndWrite(workspace);
    mkdirSync(join(workspace, "workspace"), { recursive: true });
    writeFileSync(join(workspace, "workspace", "public.txt"), "public fixture");
    claudeControlled(workspace, agentId);

    const result = evaluateProviderHookControl({
      workspace,
      authenticatedAgentId: agentId,
      provider: "claude-code",
      rawInput: claudeRequest(workspace, { tool_name: "Read", tool_use_id: "toolu_control_allow_01",
        tool_input: { file_path: join(realpathSync.native(workspace), "workspace", "public.txt") } }),
    });

    expect(result.decision).toBe("allow");
    expect(result.providerResponse).toEqual({});
    expect(result.providerResponseSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.receiptId).toBeTruthy();
    // P1-23: a Claude Code decision is a v2 action_state receipt (receipt purpose key) bound to AMC's action id.
    const receipt = verifyReceipt(result.receipt, getPurposeKeyHistory(workspace, "receipt"));
    expect(receipt.ok).toBe(true);
    expect(receipt.payload).toMatchObject({ kind: "action_state", state: "authorized", executionId: claudeActionId("private-session", "toolu_control_allow_01"),
      idempotencyKey: "toolu_control_allow_01", enforcement: { level: "enforced", boundary: "claude-code:PreToolUse" } });
    expect(receipt.payload?.body_sha256).toBe(result.providerResponseSha256);

    const ledger = openLedger(workspace);
    const event = ledger.getAllEvents().find((row) => row.id === result.eventId);
    expect(event).toBeDefined();
    expect(verifyEvidenceEventIntegrity({
      ledger,
      eventId: result.eventId,
      requireReceipt: true,
      requireSealedSession: true,
    }).ok).toBe(true);
    ledger.close();
    expect(event?.meta_json).not.toContain("private-session");
    expect(event?.meta_json).not.toContain(join(workspace, "workspace", "public.txt"));
  });

  test("uses one stable derived Gemini action ID for request observation and policy decision", () => {
    const workspace = newWorkspace();
    const agentId = "gemini-correlated-reader";
    installObservedRun(workspace, agentId);
    permitReadAndWrite(workspace);
    mkdirSync(join(workspace, "workspace"), { recursive: true });
    writeFileSync(join(workspace, "workspace", "public.txt"), "public fixture");
    const rawInput = JSON.stringify({
      session_id: "private-gemini-session",
      timestamp: "2026-07-11T07:00:00.000Z",
      hook_event_name: "BeforeTool",
      tool_name: "read_file",
      tool_input: { file_path: join(workspace, "workspace", "public.txt") },
    });

    const observed = mapProviderHookEvent({
      provider: "gemini-cli",
      agentId,
      rawInput,
      observedAt: Date.parse("2026-07-11T07:00:01.000Z"),
    });
    const controlled = evaluateProviderHookControl({
      workspace,
      authenticatedAgentId: agentId,
      provider: "gemini-cli",
      rawInput,
    });

    expect(controlled.actionId).toBe(observed.action.id);
    expect(controlled.actionId).toMatch(/^action_[a-f0-9]{32}$/);
  });

  test("recovers an empty unsealed control session but rejects a sealed session without a receipt", () => {
    const actionId = claudeActionId("private-session", "toolu_stale_control_session");
    const rawInputFor = (workspace: string) => claudeRequest(workspace, { tool_name: "Read", tool_use_id: "toolu_stale_control_session",
      tool_input: { file_path: join(realpathSync.native(workspace), "workspace", "public.txt") } });

    const recoverableWorkspace = newWorkspace();
    const agentId = "stale-session-reader";
    claudeControlled(recoverableWorkspace, agentId);
    const rawInput = rawInputFor(recoverableWorkspace);
    installObservedRun(recoverableWorkspace, agentId);
    permitReadAndWrite(recoverableWorkspace);
    mkdirSync(join(recoverableWorkspace, "workspace"), { recursive: true });
    writeFileSync(join(recoverableWorkspace, "workspace", "public.txt"), "public fixture");
    const sessionId = `hook-control-session-${sha256Hex(canonicalize({
      agentId,
      provider: "claude-code",
      actionId,
    })).slice(0, 36)}`;
    const interrupted = openLedger(recoverableWorkspace);
    interrupted.startSession({
      sessionId,
      runtime: "claude",
      binaryPath: "amc-bridge-hook-control",
      binarySha256: hashBinaryOrPath("amc-bridge-hook-control", "1"),
    });
    interrupted.close();

    const recovered = evaluateProviderHookControl({
      workspace: recoverableWorkspace,
      authenticatedAgentId: agentId,
      provider: "claude-code",
      rawInput,
    });
    expect(recovered).toMatchObject({ decision: "allow", sessionId, idempotentReplay: false });
    const recoveredLedger = openLedger(recoverableWorkspace);
    expect(recoveredLedger.getAllSessions().filter((row) => row.session_id === sessionId)).toHaveLength(1);
    expect(verifyEvidenceEventIntegrity({
      ledger: recoveredLedger,
      eventId: recovered.eventId,
      requireReceipt: true,
      requireSealedSession: true,
    }).ok).toBe(true);
    recoveredLedger.close();

    const sealedWorkspace = newWorkspace();
    claudeControlled(sealedWorkspace, agentId);
    installObservedRun(sealedWorkspace, agentId);
    permitReadAndWrite(sealedWorkspace);
    mkdirSync(join(sealedWorkspace, "workspace"), { recursive: true });
    writeFileSync(join(sealedWorkspace, "workspace", "public.txt"), "public fixture");
    const sealed = openLedger(sealedWorkspace);
    sealed.startSession({
      sessionId,
      runtime: "claude",
      binaryPath: "amc-bridge-hook-control",
      binarySha256: hashBinaryOrPath("amc-bridge-hook-control", "1"),
    });
    sealed.sealSession(sessionId);
    sealed.close();

    expect(() => evaluateProviderHookControl({
      workspace: sealedWorkspace,
      authenticatedAgentId: agentId,
      provider: "claude-code",
      rawInput: rawInputFor(sealedWorkspace),
    })).toThrowError(expect.objectContaining<Partial<HookControlError>>({
      code: "HOOK_CONTROL_LEDGER_UNAVAILABLE",
      statusCode: 503,
    }));
  });

  // A pending engine request denies the provider until its signed grant is consumed on retry.
  test("denies a write that needs approval for Claude Code and Gemini CLI alike instead of a provider-local ask", () => {
    for (const provider of ["claude-code", "gemini-cli"] as const) {
      const workspace = newWorkspace();
      const agentId = `writer-${provider}`;
      installObservedRun(workspace, agentId);
      permitReadAndWrite(workspace);
      if (provider === "claude-code") claudeControlled(workspace, agentId);
      const rawInput = provider === "claude-code"
        ? claudeRequest(workspace, { tool_name: "Write", tool_use_id: "toolu_control_ask_01",
            tool_input: { file_path: join(realpathSync.native(workspace), "workspace", "output", "draft.txt"), content: "PRIVATE" } })
        : JSON.stringify({
            hook_event_name: "BeforeTool",
            tool_name: "write_file",
            tool_input: { file_path: join(workspace, "workspace", "output", "draft.txt"), content: "PRIVATE" },
          });
      const result = evaluateProviderHookControl({ workspace, authenticatedAgentId: agentId, provider, rawInput });

      expect(result.requestedDecision).toBe("deny");
      expect(result).toMatchObject({ decision: "deny", effectiveOutcome: "deny", providerMapping: "native", capabilityLossy: false });
      expect(listApprovalRequests({ workspace, agentId })).toHaveLength(1);
      if (provider === "claude-code") {
        expect(result.reason).toContain("AMC approval pending:");
        expect(result.providerResponse).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny" } });
      }
      expect(JSON.stringify(result)).not.toContain("PRIVATE");
      expect(verifyReceipt(result.receipt, getPurposeKeyHistory(workspace, "receipt")).ok).toBe(true);
    }
  });

  test("raises the exact multi-user and distinct-user quorum instead of weakening it to one native ask", () => {
    const workspace = newWorkspace();
    const agentId = "quorum-writer";
    installObservedRun(workspace, agentId);
    permitReadAndWrite(workspace);
    const policy = defaultApprovalPolicy();
    policy.approvalPolicy.actionClasses.WRITE_LOW = {
      requiredApprovals: 2,
      rolesAllowed: ["APPROVER", "OWNER"],
      requireDistinctUsers: true,
      ttlMinutes: 15,
    };
    initApprovalPolicy(workspace, policy);
    claudeControlled(workspace, agentId);

    const result = evaluateProviderHookControl({
      workspace,
      authenticatedAgentId: agentId,
      provider: "claude-code",
      rawInput: claudeRequest(workspace, { tool_name: "Write", tool_use_id: "toolu_quorum_01",
        tool_input: { file_path: join(realpathSync.native(workspace), "workspace", "output", "quorum.txt"), content: "PRIVATE" } }),
    });

    expect(result.requestedDecision).toBe("deny");
    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("AMC approval pending:");
    expect(listApprovalRequests({ workspace, agentId })[0]).toMatchObject({ requiredApprovals: 2, requireDistinctUsers: true });
  });

  test("rejects ambiguous and oversized control input before policy evaluation", () => {
    const workspace = newWorkspace();
    expect(() => evaluateProviderHookControl({
      workspace,
      authenticatedAgentId: "input-guard",
      provider: "claude-code",
      rawInput: '{"hook_event_name":"PreToolUse","tool_name":"Read","tool_name":"Write","tool_input":{}}',
    })).toThrowError(expect.objectContaining<Partial<HookControlError>>({
      code: "HOOK_CONTROL_INPUT_AMBIGUOUS",
    }));
    expect(() => evaluateProviderHookControl({
      workspace,
      authenticatedAgentId: "input-guard",
      provider: "claude-code",
      rawInput: JSON.stringify({
        hook_event_name: "PreToolUse",
        tool_name: "Read",
        tool_input: { content: "x".repeat(262_145) },
      }),
    })).toThrowError(expect.objectContaining<Partial<HookControlError>>({
      code: "HOOK_CONTROL_INPUT_TOO_LARGE",
    }));
  });

  test("replays byte-identical actions deterministically and rejects conflicting action reuse", () => {
    const workspace = newWorkspace();
    const agentId = "replay-reader";
    installObservedRun(workspace, agentId);
    permitReadAndWrite(workspace);
    mkdirSync(join(workspace, "workspace"), { recursive: true });
    writeFileSync(join(workspace, "workspace", "one.txt"), "one");
    writeFileSync(join(workspace, "workspace", "two.txt"), "two");
    claudeControlled(workspace, agentId, "session-replay");
    const real = realpathSync.native(workspace);
    const base = { session_id: "session-replay", tool_name: "Read", tool_use_id: "toolu_replay_01", tool_input: { file_path: join(real, "workspace", "one.txt") } };
    const first = evaluateProviderHookControl({
      workspace,
      authenticatedAgentId: agentId,
      provider: "claude-code",
      rawInput: claudeRequest(workspace, base),
    });
    const replay = evaluateProviderHookControl({
      workspace,
      authenticatedAgentId: agentId,
      provider: "claude-code",
      rawInput: claudeRequest(workspace, base),
    });

    expect(first.idempotentReplay).toBe(false);
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.providerResponse).toEqual(first.providerResponse);
    expect(replay.receipt).toBe(first.receipt);

    expect(() => evaluateProviderHookControl({
      workspace,
      authenticatedAgentId: agentId,
      provider: "claude-code",
      rawInput: claudeRequest(workspace, { ...base, tool_input: { file_path: join(real, "workspace", "two.txt") } }),
    })).toThrowError(expect.objectContaining<Partial<HookControlError>>({ code: "HOOK_CONTROL_REPLAY_CONFLICT" }));
    // Single-use: the same call re-sent with a fresh nonce (a second request) gets no second decision.
    expect(() => evaluateProviderHookControl({
      workspace,
      authenticatedAgentId: agentId,
      provider: "claude-code",
      rawInput: claudeRequest(workspace, base, "nonce-second-request-0000"),
    })).toThrowError(expect.objectContaining<Partial<HookControlError>>({ code: "HOOK_CONTROL_REPLAY_CONFLICT", statusCode: 409 }));
  });

  test("rejects a valid signed control result replayed against a different provider request", () => {
    const workspace = newWorkspace();
    const agentId = "request-bound-reader";
    installObservedRun(workspace, agentId);
    permitReadAndWrite(workspace);
    mkdirSync(join(workspace, "workspace"), { recursive: true });
    writeFileSync(join(workspace, "workspace", "first.txt"), "first");
    writeFileSync(join(workspace, "workspace", "second.txt"), "second");
    claudeControlled(workspace, agentId);
    const real = realpathSync.native(workspace);
    const firstRawInput = claudeRequest(workspace, { tool_name: "Read", tool_use_id: "toolu_request_binding_first",
      tool_input: { file_path: join(real, "workspace", "first.txt") } });
    const secondRawInput = claudeRequest(workspace, { tool_name: "Read", tool_use_id: "toolu_request_binding_second",
      tool_input: { file_path: join(real, "workspace", "second.txt") } });
    const result = evaluateProviderHookControl({
      workspace,
      authenticatedAgentId: agentId,
      provider: "claude-code",
      rawInput: firstRawInput,
    });

    expect(verifyProviderHookControlResult({
      workspace,
      authenticatedAgentId: agentId,
      provider: "claude-code",
      rawInput: firstRawInput,
      result,
    })).toEqual({ ok: true, error: null });
    expect(verifyProviderHookControlResult({
      workspace,
      authenticatedAgentId: agentId,
      provider: "claude-code",
      rawInput: secondRawInput,
      result,
    })).toMatchObject({
      ok: false,
      error: "hook control response is not bound to the current provider request",
    });
    expect(verifyProviderHookControlResult({
      workspace,
      authenticatedAgentId: agentId,
      provider: "claude-code",
      rawInput: firstRawInput,
      result: { ...result, decision: "deny" },
    })).toMatchObject({
      ok: false,
      error: "hook control response differs from its sealed ledger event",
    });
  });

  test("fails closed for unknown tools and signed-policy tamper without retaining raw args", () => {
    const workspace = newWorkspace();
    const agentId = "fail-closed-agent";
    installObservedRun(workspace, agentId);
    permitReadAndWrite(workspace);
    claudeControlled(workspace, agentId);
    const unknown = evaluateProviderHookControl({
      workspace,
      authenticatedAgentId: agentId,
      provider: "claude-code",
      rawInput: claudeRequest(workspace, { tool_name: "UnmappedDangerousTool", tool_use_id: "toolu_unknown_01", tool_input: { secret: "DO_NOT_RETAIN" } }),
    });
    expect(unknown.decision).toBe("deny");
    expect(unknown.reason).toContain("not mapped to an allowed ToolHub tool");
    expect(JSON.stringify(unknown)).not.toContain("DO_NOT_RETAIN");

    writeFileSync(
      join(workspace, ".amc", "action-policy.yaml"),
      `${readFileSync(join(workspace, ".amc", "action-policy.yaml"), "utf8")}\n# tamper`,
    );
    const tampered = evaluateProviderHookControl({
      workspace,
      authenticatedAgentId: agentId,
      provider: "gemini-cli",
      rawInput: JSON.stringify({
        hook_event_name: "BeforeTool",
        tool_name: "read_file",
        tool_input: { file_path: join(workspace, "workspace", "public.txt") },
      }),
    });
    expect(tampered.decision).toBe("deny");
    expect(tampered.reason).toContain("action policy signature invalid");
  });

  test("installs explicit control mode and runs observation plus signed control through the real Bridge", async () => {
    const workspace = newWorkspace();
    const agentId = "bridge-control-agent";
    installObservedRun(workspace, agentId);
    permitReadAndWrite(workspace);
    mkdirSync(join(workspace, "workspace"), { recursive: true });
    const fixturePath = join(workspace, "workspace", "bridge.txt");
    writeFileSync(fixturePath, "bridge fixture");
    const port = await freePort();
    const bridgeBase = `http://127.0.0.1:${port}`;
    const bridge = await startBridgeServer({
      workspace,
      host: "127.0.0.1",
      port,
      gatewayBaseUrl: "http://127.0.0.1:1",
    });
    try {
      const installed = installHookIntegration({
        workspace,
        provider: "claude-code",
        agentId,
        bridgeBase,
        mode: "control",
        claudeCodeInstall: boundClaudeCode(),
      });
      claudeControlled(workspace, agentId, "private-bridge-session", bridgeBase);
      expect(installed.mode).toBe("control");
      expect(installed.lease.scopes).toEqual(["hook:observe", "hook:control"]);
      const status = getHookIntegrationStatus({ workspace, provider: "claude-code" });
      expect(status).toMatchObject({ state: "installed", mode: "control" });

      const tokenFile = join(workspace, ".amc", "hooks", "claude-code.lease");
      const token = readFileSync(tokenFile, "utf8").trim();
      expect(verifyLeaseToken({
        workspace,
        token,
        expectedAgentId: agentId,
        requiredScope: "hook:control",
        routePath: "/hooks/control/v1",
        revokedLeaseIds: new Set(),
      }).ok).toBe(true);

      const result = await forwardProviderHookControl({
        workspace,
        provider: "claude-code",
        agentId,
        bridgeBase,
        tokenFile,
        rawInput: claudeRequest(workspace, { session_id: "private-bridge-session", tool_name: "Read", tool_use_id: "toolu_bridge_control_01",
          tool_input: { file_path: join(realpathSync.native(workspace), "workspace", "bridge.txt") } }),
        // The envelope carries the payload bytes; the observation maps the payload itself.
        observedInput: JSON.stringify({ session_id: "private-bridge-session", transcript_path: "/private/transcript.jsonl", cwd: realpathSync.native(workspace),
          permission_mode: "default", hook_event_name: "PreToolUse", tool_name: "Read", tool_use_id: "toolu_bridge_control_01",
          tool_input: { file_path: join(realpathSync.native(workspace), "workspace", "bridge.txt") } }),
      });

      expect(result.control.decision).toBe("allow");
      expect(result.control.providerResponse).toEqual({});
      expect(result.observation.receiptId).toBeTruthy();
      expect(verifyReceipt(result.control.receipt, getPurposeKeyHistory(workspace, "receipt")).ok).toBe(true);
      const terminal = await forwardProviderHookEvent({
        workspace,
        provider: "claude-code",
        mode: "control",
        agentId,
        bridgeBase,
        tokenFile,
        rawInput: JSON.stringify({
          session_id: "private-bridge-session",
          hook_event_name: "PostToolUse",
          tool_name: "Read",
          tool_use_id: "toolu_bridge_control_01",
          tool_input: { file_path: join(realpathSync.native(workspace), "workspace", "bridge.txt") },
          tool_response: { content: "private result" },
        }),
      });
      expect(terminal.actionId).toBe(result.control.actionId);
      const lifecycle = inspectHookActionLifecycle({
        workspace,
        agentId,
        actionId: result.control.actionId,
      });
      expect(lifecycle).toEqual(expect.objectContaining({
        status: "completed",
        valid: true,
        failClosed: false,
      }));
      expect(lifecycle.phases.decision).toEqual(expect.objectContaining({ decision: "allow" }));
      const ledger = openLedger(workspace);
      const events = ledger.getAllEvents();
      ledger.close();
      expect(events.some((event) => event.event_type === "tool_action")).toBe(true);
      expect(events.some((event) => event.id === result.control.eventId && event.event_type === "audit")).toBe(true);
      expect(JSON.stringify(events)).not.toContain("private-bridge-session");
      expect(JSON.stringify(events)).not.toContain(fixturePath);
      expect(JSON.stringify(events)).not.toContain(join(realpathSync.native(workspace), "workspace", "bridge.txt"));
      expect(JSON.stringify(events)).not.toContain("private result");
    } finally {
      await bridge.close();
    }
  });
});


describe("AXR-22 signed hook approvals", () => {
  function fixture(provider: "claude-code" | "gemini-cli") {
    const workspace = newWorkspace(), agentId = `signed-${provider}`;
    installObservedRun(workspace, agentId);
    permitReadAndWrite(workspace);
    if (provider === "claude-code") claudeControlled(workspace, agentId);
    const fields = { tool_name: "Write", tool_use_id: "toolu_signed_approval",
      tool_input: { file_path: join(realpathSync.native(workspace), "workspace", "output", "approved.txt"), content: "PRIVATE_APPROVAL_CONTENT" } };
    const raw = (nonce = "nonce-fixture-000000000000") => provider === "claude-code" ? claudeRequest(workspace, fields, nonce)
      : JSON.stringify({ hook_event_name: "BeforeTool", tool_name: "write_file", tool_call_id: fields.tool_use_id,
        session_id: "signed-gemini-session", tool_input: fields.tool_input });
    const input = () => ({ workspace, authenticatedAgentId: agentId, provider, rawInput: raw() });
    const requests = () => listApprovalRequests({ workspace, agentId });
    const decide = (decision: "APPROVED" | "DENIED" = "APPROVED", userId = "reviewer-one") => {
      const request = requests()[0]!;
      return decideApprovalForIntent({ workspace, agentId, approvalId: request.approvalRequestId,
        decision, mode: "EXECUTE", reason: "Reviewed exact hook call", username: userId, userId, userRoles: ["APPROVER"] });
    };
    return { workspace, agentId, fields, raw, input, requests, decide };
  }

  test.each(["claude-code", "gemini-cli"] as const)("%s creates a signed pending request, consumes one grant and refuses replay", (provider) => {
    const f = fixture(provider), input = f.input();
    const pending = evaluateProviderHookControl(input);
    expect(pending.decision).toBe("deny");
    expect(f.requests()).toHaveLength(1);
    const request = f.requests()[0]!;
    expect(pending.reason).toContain(request.approvalRequestId);
    expect(verifyApprovalForExecution({ workspace: f.workspace, approvalId: request.approvalRequestId,
      expectedAgentId: f.agentId, expectedIntentId: request.intentId, expectedIntentHash: request.boundHashes.intentHash,
      expectedToolName: request.toolName, expectedActionClass: request.actionClass })).toMatchObject({ ok: false, status: "PENDING" });
    expect(verifyProviderHookControlResult({ ...input, result: pending }).ok).toBe(true);
    f.decide();
    const approved = evaluateProviderHookControl({ ...input, rawInput: f.raw("nonce-approved-retry-0000") });
    expect(approved.decision).toBe("allow");
    expect(loadApprovalConsumed({ workspace: f.workspace, agentId: f.agentId, approvalRequestId: request.approvalRequestId }))
      .toMatchObject({ executionId: approved.actionId });
    expect(verifyProviderHookControlResult({ ...input, rawInput: f.raw("nonce-approved-retry-0000"), result: approved }).ok).toBe(true);
    const replay = evaluateProviderHookControl({ ...input, rawInput: f.raw("nonce-approved-retry-0000") });
    expect(replay.decision).toBe("deny");
    expect(replay.reason).toMatch(/consumed|replay/i);
    expect(f.requests()).toHaveLength(1);
    const ledger = openLedger(f.workspace);
    const rows = ledger.getAllEvents().filter(row => JSON.parse(row.meta_json).controlSchemaVersion === 2);
    expect(rows.filter(row => JSON.parse(row.meta_json).actionId === approved.actionId)).toHaveLength(1);
    const approvedMeta = JSON.parse(rows.find(row => row.id === approved.eventId)!.meta_json);
    expect(approvedMeta.approvalRequestIds).toEqual([request.approvalRequestId]);
    expect(ledger.getAllEvents().map(row => row.meta_json).join("\n")).not.toContain("PRIVATE_APPROVAL_CONTENT");
    ledger.close();
  });

  test.each(["claude-code", "gemini-cli"] as const)("%s denies a signed refusal and an expired grant", provider => {
    const refused = fixture(provider);
    evaluateProviderHookControl(refused.input());
    expect(refused.requests()).toHaveLength(1);
    refused.decide("DENIED");
    expect(evaluateProviderHookControl(refused.input())).toMatchObject({ decision: "deny", reason: expect.stringContaining("DENIED") });
    const expired = fixture(provider);
    evaluateProviderHookControl(expired.input());
    expect(expired.requests()).toHaveLength(1);
    expired.decide();
    const now = vi.spyOn(Date, "now").mockReturnValue(expired.requests()[0]!.expiresTs);
    try {
      expect(evaluateProviderHookControl(expired.input())).toMatchObject({ decision: "deny", reason: expect.stringMatching(/expir/i) });
      expect(loadApprovalConsumed({ workspace: expired.workspace, agentId: expired.agentId,
        approvalRequestId: expired.requests()[0]!.approvalRequestId })).toBeNull();
    } finally { now.mockRestore(); }
  });

  test("binds approval to exact arguments, call, lease and policy", () => {
    const f = fixture("gemini-cli"), input = f.input();
    evaluateProviderHookControl(input);
    expect(f.requests()).toHaveLength(1);
    f.decide();
    const differentCall = JSON.parse(input.rawInput);
    differentCall.tool_call_id = "another-call";
    expect(evaluateProviderHookControl({ ...input, rawInput: JSON.stringify(differentCall) }).decision).toBe("deny");
    const changed = JSON.parse(input.rawInput);
    changed.tool_input.content = "DIFFERENT";
    expect(evaluateProviderHookControl({ ...input, rawInput: JSON.stringify(changed) }).decision).toBe("deny");
    expect(evaluateProviderHookControl({ ...input, lease: { leaseId: "different", expiresTs: Date.now() + 60_000 } }).decision).toBe("deny");
    const policy = defaultApprovalPolicy();
    policy.approvalPolicy.actionClasses.WRITE_LOW!.ttlMinutes = 20;
    initApprovalPolicy(f.workspace, policy);
    expect(evaluateProviderHookControl(input).decision).toBe("deny");
    expect(loadApprovalConsumed({ workspace: f.workspace, agentId: f.agentId, approvalRequestId: f.requests()[0]!.approvalRequestId })).toBeNull();
  });

  test("denies if the approval engine cannot create or consume its signed records", () => {
    const f = fixture("gemini-cli");
    mkdirSync(join(f.workspace, ".amc", "agents", f.agentId, "approvals"), { recursive: true });
    writeFileSync(join(f.workspace, ".amc", "agents", f.agentId, "approvals", "requests"), "unavailable");
    expect(evaluateProviderHookControl(f.input())).toMatchObject({ decision: "deny", reason: expect.stringMatching(/approval.*unavailable/i) });
  });
  test.each(["claude-code", "gemini-cli"] as const)("%s routes Bridge approval creation and consumption through async publishers", async provider => {
    const f = fixture(provider), input = f.input();
    const creation = vi.spyOn(approvalEngine, "createApprovalForIntentAsync");
    const consumption = vi.spyOn(approvalEngine, "captureApprovedExecutionConsumptionEntry");
    const pending = await handleHookControlRequestAsync(input);
    expect(pending).toMatchObject({ decision: "deny" });
    expect(f.requests()).toHaveLength(1);
    f.decide();
    const approved = await handleHookControlRequestAsync(input);
    expect(approved, "reason" in approved ? String(approved.reason) : "missing reason").toMatchObject({ decision: "allow" });
    expect(await handleHookControlRequestAsync(input)).toMatchObject({ decision: "deny" });
    expect(creation).toHaveBeenCalledTimes(1);
    expect(consumption).toHaveBeenCalledTimes(1);
  });

  test("keeps a two-user grant pending until both distinct approvers decide", () => {
    const f = fixture("gemini-cli"), policy = defaultApprovalPolicy();
    policy.approvalPolicy.actionClasses.WRITE_LOW!.requiredApprovals = 2;
    policy.approvalPolicy.actionClasses.WRITE_LOW!.requireDistinctUsers = true;
    initApprovalPolicy(f.workspace, policy);
    expect(evaluateProviderHookControl(f.input()).decision).toBe("deny");
    f.decide();
    expect(evaluateProviderHookControl(f.input()).decision).toBe("deny");
    f.decide("APPROVED", "reviewer-two");
    expect(evaluateProviderHookControl(f.input()).decision).toBe("allow");
  });

  test("denies if a granted approval cannot publish its consumption", () => {
    const f = fixture("gemini-cli");
    evaluateProviderHookControl(f.input());
    expect(f.requests()).toHaveLength(1);
    f.decide();
    const consumed = join(getAgentPaths(f.workspace, f.agentId).rootDir, "approvals", "consumed");
    rmSync(consumed, { recursive: true, force: true });
    writeFileSync(consumed, "unavailable");
    expect(evaluateProviderHookControl(f.input())).toMatchObject({ decision: "deny", reason: expect.stringMatching(/unavailable/i) });
  });

  test("denies a grant after the Claude call's symlink target changes", () => {
    const f = fixture("claude-code"), output = join(f.workspace, "workspace", "output");
    mkdirSync(output, { recursive: true });
    writeFileSync(join(output, "one.txt"), "one");
    writeFileSync(join(output, "two.txt"), "two");
    const link = join(output, "target.txt");
    symlinkSync(join(output, "one.txt"), link);
    f.fields.tool_input.file_path = link;
    expect(evaluateProviderHookControl(f.input()).decision).toBe("deny");
    expect(f.requests()).toHaveLength(1);
    f.decide();
    unlinkSync(link);
    symlinkSync(join(output, "two.txt"), link);
    expect(evaluateProviderHookControl(f.input()).decision).toBe("deny");
    expect(loadApprovalConsumed({ workspace: f.workspace, agentId: f.agentId, approvalRequestId: f.requests()[0]!.approvalRequestId })).toBeNull();
  });

  test("denies a granted Claude call if its registered session changes", () => {
    const f = fixture("claude-code");
    evaluateProviderHookControl(f.input());
    expect(f.requests()).toHaveLength(1);
    f.decide();
    const skill = join(f.workspace, ".claude", "skills", "changed");
    mkdirSync(skill, { recursive: true });
    writeFileSync(join(skill, "SKILL.md"), "Changed session skill");
    expect(evaluateProviderHookControl(f.input()).decision).toBe("deny");
    expect(loadApprovalConsumed({ workspace: f.workspace, agentId: f.agentId, approvalRequestId: f.requests()[0]!.approvalRequestId })).toBeNull();
  });

  test.each(["policy", "grant expiry"] as const)("rechecks context after asynchronous consumption returns: %s", async kind => {
    const f = fixture("gemini-cli"), input = f.input();
    await handleHookControlRequestAsync(input);
    expect(f.requests()).toHaveLength(1);
    f.decide();
    const capture = approvalEngine.captureApprovedExecutionConsumptionEntry;
    vi.spyOn(approvalEngine, "captureApprovedExecutionConsumptionEntry").mockImplementation(workspace => {
      const entry = capture(workspace);
      return { ...entry, selectGrant(selection, options) {
        const grant = entry.selectGrant(selection, options);
        return { ...grant, async consume() {
          const consumed = await grant.consume();
          if (kind === "grant expiry") vi.spyOn(Date, "now").mockReturnValue(f.requests()[0]!.expiresTs);
          else {
            const changed = defaultApprovalPolicy();
            changed.approvalPolicy.actionClasses.WRITE_LOW!.ttlMinutes += 1;
            initApprovalPolicy(workspace, changed);
          }
          return consumed;
        } };
      } };
    });
    expect(await handleHookControlRequestAsync(input)).toMatchObject({ decision: "deny", reason: expect.stringMatching(/context changed/i) });
  });

  test("rechecks signed policy across a real asynchronous provider Sign", async () => {
    const f = fixture("gemini-cli"), input = f.input();
    await handleHookControlRequestAsync(input);
    expect(f.requests()).toHaveLength(1);
    f.decide();
    const provider = loadKeyProvider(f.workspace, "file"), sign = provider.sign.bind(provider);
    const signing = vi.spyOn(provider, "sign").mockImplementationOnce(async (...args) => {
      const result = await sign(...args);
      expect(args[0]).toMatchObject({ provider: "file", id: "artifact-seal" });
      expect(Buffer.from(args[1])).toHaveLength(32);
      const policy = defaultApprovalPolicy();
      policy.approvalPolicy.actionClasses.WRITE_LOW!.ttlMinutes += 1;
      initApprovalPolicy(f.workspace, policy);
      return result;
    });
    expect(await handleHookControlRequestAsync(input)).toMatchObject({ decision: "deny" });
    expect(signing).toHaveBeenCalledTimes(1);
    expect(loadApprovalConsumed({ workspace: f.workspace, agentId: f.agentId, approvalRequestId: f.requests()[0]!.approvalRequestId })).toBeNull();
  });

  test.each(["lease expiry", "audit latch", "authorization expiry"] as const)("rechecks %s across provider signing", async kind => {
    const f = fixture(kind === "authorization expiry" ? "claude-code" : "gemini-cli");
    const expiresTs = Date.now() + 60_000;
    const input = { ...f.input(), ...(kind === "lease expiry" ? { lease: { leaseId: "lease-signing-test", expiresTs, executeActionClasses: ["WRITE_LOW" as const] } } : {}) };
    await handleHookControlRequestAsync(input);
    expect(f.requests()).toHaveLength(1);
    f.decide();
    let latched = false;
    const state = auditLatch.hookAuditLatchState;
    vi.spyOn(auditLatch, "hookAuditLatchState").mockImplementation(workspace => latched ? { ...state(workspace), latched: true, reason: "owned test latch", latchedAt: null } : state(workspace));
    const provider = loadKeyProvider(f.workspace, "file"), sign = provider.sign.bind(provider);
    vi.spyOn(provider, "sign").mockImplementationOnce(async (...args) => {
      const signed = await sign(...args);
      if (kind === "audit latch") latched = true;
      else vi.spyOn(Date, "now").mockReturnValue(kind === "lease expiry" ? expiresTs : Date.now() + 5 * 60_000 + 1);
      return signed;
    });
    expect(await handleHookControlRequestAsync(input)).toMatchObject({ decision: "deny" });
    expect(loadApprovalConsumed({ workspace: f.workspace, agentId: f.agentId, approvalRequestId: f.requests()[0]!.approvalRequestId })).toBeNull();
  });

  test("denies when the approval engine reports a lost consumption race", () => {
    const f = fixture("gemini-cli");
    evaluateProviderHookControl(f.input());
    expect(f.requests()).toHaveLength(1);
    f.decide();
    vi.spyOn(approvalEngine, "consumeApprovedExecution").mockReturnValue({ consumed: false, replay: true, reason: "another execution consumed the grant" });
    expect(evaluateProviderHookControl(f.input())).toMatchObject({ decision: "deny", reason: expect.stringMatching(/replay denied/i) });
  });

  test("refuses an approval-backed allow recovered after a unique writer conflict", () => {
    const f = fixture("gemini-cli");
    evaluateProviderHookControl(f.input());
    expect(f.requests()).toHaveLength(1);
    f.decide();
    const open = ledgerApi.openLedger;
    vi.spyOn(ledgerApi, "openLedger").mockImplementation(workspace => {
      const ledger = open(workspace), append = ledger.appendEvidenceWithReceipt.bind(ledger);
      ledger.appendEvidenceWithReceipt = input => {
        const result = append(input);
        if (input.meta?.decision === "allow") throw new Error("UNIQUE constraint failed: evidence_events.id");
        return result;
      };
      return ledger;
    });
    expect(() => evaluateProviderHookControl(f.input())).toThrowError(expect.objectContaining({ code: "HOOK_CONTROL_REPLAY_CONFLICT", statusCode: 409 }));
  });

  test("reverifies the broker token before consuming a grant", async () => {
    const f = fixture("gemini-cli");
    const issued = issueLeaseToken({ workspace: f.workspace, workspaceId: workspaceIdFromDirectory(f.workspace), agentId: f.agentId,
      ttlMs: 600_000, scopes: ["hook:control"], routeAllowlist: ["/hooks/control/v1"], modelAllowlist: ["*"],
      maxTokensPerMinute: 1000, maxRequestsPerMinute: 1000, maxCostUsdPerDay: null, executeActionClasses: ["WRITE_LOW"] });
    const input = { ...f.input(), lease: issued.payload, leaseToken: issued.token };
    const pending = await handleHookControlRequestAsync(input);
    expect(pending).toMatchObject({ decision: "deny" });
    expect(JSON.stringify(pending)).not.toContain(issued.token);
    expect(f.requests()).toHaveLength(1);
    f.decide();
    expect(await handleHookControlRequestAsync({ ...input, leaseToken: "invalid-broker-token" })).toMatchObject({ decision: "deny" });
    expect(loadApprovalConsumed({ workspace: f.workspace, agentId: f.agentId, approvalRequestId: f.requests()[0]!.approvalRequestId })).toBeNull();
    expect(await handleHookControlRequestAsync(input)).toMatchObject({ decision: "allow" });
  });

  test("denies a signed policy with a missing action-class approval rule", () => {
    const f = fixture("gemini-cli"), policy = defaultApprovalPolicy();
    delete policy.approvalPolicy.actionClasses.WRITE_LOW;
    initApprovalPolicy(f.workspace, policy);
    expect(evaluateProviderHookControl(f.input())).toMatchObject({ decision: "deny", reason: expect.stringMatching(/no rule/i) });
    expect(f.requests()).toHaveLength(0);
  });

});
