import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { defaultApprovalPolicy, initApprovalPolicy } from "../src/approvals/approvalPolicyEngine.js";
import {
  forwardProviderHookControl,
  forwardProviderHookEvent,
  getHookIntegrationStatus,
  installHookIntegration,
  mapProviderHookEvent,
} from "../src/adapters/hookIntegration.js";
import { startBridgeServer } from "../src/bridge/bridgeServer.js";
import {
  evaluateProviderHookControl,
  HookControlError,
  renderProviderControlResponse,
  validateProviderControlResponse,
  verifyProviderHookControlResult,
} from "../src/bridge/hookControl.js";
import { questionBank } from "../src/diagnostic/questionBank.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import { initActionPolicy, defaultActionPolicy } from "../src/governor/actionPolicyEngine.js";
import { hashBinaryOrPath, openLedger, verifyEvidenceEventIntegrity } from "../src/ledger/ledger.js";
import { verifyReceipt } from "../src/receipts/receipt.js";
import { getPublicKeyHistory } from "../src/crypto/keys.js";
import { initWorkspace } from "../src/workspace.js";
import type { DiagnosticReport } from "../src/types.js";
import { verifyLeaseToken } from "../src/leases/leaseVerifier.js";
import { canonicalize } from "../src/utils/json.js";
import { sha256Hex } from "../src/utils/hash.js";
import { inspectHookActionLifecycle } from "../src/watch/hookActionLifecycle.js";

const roots: string[] = [];

function newWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), "amc-hook-control-"));
  roots.push(workspace);
  process.env.AMC_VAULT_PASSPHRASE = "hook-control-test-passphrase";
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
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
  const paths = getAgentPaths(workspace, agentId);
  mkdirSync(paths.runsDir, { recursive: true });
  writeFileSync(join(paths.runsDir, `${report.runId}.json`), JSON.stringify(report, null, 2));
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

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("provider-native signed hook control", () => {
  test("renders exact pinned Claude and Gemini native response shapes", () => {
    expect(renderProviderControlResponse("claude-code", "allow", "signed allow")).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        permissionDecisionReason: "signed allow",
      },
    });
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

    const result = evaluateProviderHookControl({
      workspace,
      authenticatedAgentId: agentId,
      provider: "claude-code",
      rawInput: JSON.stringify({
        session_id: "private-session",
        hook_event_name: "PreToolUse",
        tool_name: "Read",
        tool_use_id: "toolu_control_allow_01",
        tool_input: { file_path: join(workspace, "workspace", "public.txt") },
      }),
    });

    expect(result.decision).toBe("allow");
    expect(result.providerResponse).toEqual(expect.objectContaining({
      hookSpecificOutput: expect.objectContaining({ permissionDecision: "allow" }),
    }));
    expect(result.providerResponseSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.receiptId).toBeTruthy();
    const receipt = verifyReceipt(result.receipt, getPublicKeyHistory(workspace, "monitor"));
    expect(receipt.ok).toBe(true);
    expect(receipt.payload?.kind).toBe("guard_check");
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
    const actionId = "toolu_stale_control_session";
    const rawInput = JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "Read",
      tool_use_id: actionId,
      tool_input: { file_path: "workspace/public.txt" },
    });

    const recoverableWorkspace = newWorkspace();
    const agentId = "stale-session-reader";
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
      rawInput,
    })).toThrowError(expect.objectContaining<Partial<HookControlError>>({
      code: "HOOK_CONTROL_LEDGER_UNAVAILABLE",
      statusCode: 503,
    }));
  });

  test("asks for Claude write approval and capability-gates the same Gemini outcome to deny", () => {
    for (const provider of ["claude-code", "gemini-cli"] as const) {
      const workspace = newWorkspace();
      const agentId = `writer-${provider}`;
      installObservedRun(workspace, agentId);
      permitReadAndWrite(workspace);
      const rawInput = provider === "claude-code"
        ? {
            hook_event_name: "PreToolUse",
            tool_name: "Write",
            tool_use_id: "toolu_control_ask_01",
            tool_input: { file_path: join(workspace, "workspace", "output", "draft.txt"), content: "PRIVATE" },
          }
        : {
            hook_event_name: "BeforeTool",
            tool_name: "write_file",
            tool_input: { file_path: join(workspace, "workspace", "output", "draft.txt"), content: "PRIVATE" },
          };
      const result = evaluateProviderHookControl({
        workspace,
        authenticatedAgentId: agentId,
        provider,
        rawInput: JSON.stringify(rawInput),
      });

      expect(result.requestedDecision).toBe("ask");
      if (provider === "claude-code") {
        expect(result.decision).toBe("ask");
        expect(result.capabilityLossy).toBe(false);
      } else {
        expect(result.decision).toBe("deny");
        expect(result.capabilityLossy).toBe(true);
      }
      expect(JSON.stringify(result)).not.toContain("PRIVATE");
      expect(verifyReceipt(result.receipt, getPublicKeyHistory(workspace, "monitor")).ok).toBe(true);
    }
  });

  test("denies instead of weakening multi-user or distinct-user approval quorum to one native ask", () => {
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

    const result = evaluateProviderHookControl({
      workspace,
      authenticatedAgentId: agentId,
      provider: "claude-code",
      rawInput: JSON.stringify({
        hook_event_name: "PreToolUse",
        tool_name: "Write",
        tool_use_id: "toolu_quorum_01",
        tool_input: {
          file_path: join(workspace, "workspace", "output", "quorum.txt"),
          content: "PRIVATE",
        },
      }),
    });

    expect(result.requestedDecision).toBe("deny");
    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("cannot be reduced to one provider-local ask");
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
    const base = {
      session_id: "session-replay",
      hook_event_name: "PreToolUse",
      tool_name: "Read",
      tool_use_id: "toolu_replay_01",
      tool_input: { file_path: join(workspace, "workspace", "one.txt") },
    };
    const first = evaluateProviderHookControl({
      workspace,
      authenticatedAgentId: agentId,
      provider: "claude-code",
      rawInput: JSON.stringify(base),
    });
    const replay = evaluateProviderHookControl({
      workspace,
      authenticatedAgentId: agentId,
      provider: "claude-code",
      rawInput: JSON.stringify(base),
    });

    expect(first.idempotentReplay).toBe(false);
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.providerResponse).toEqual(first.providerResponse);
    expect(replay.receipt).toBe(first.receipt);

    expect(() => evaluateProviderHookControl({
      workspace,
      authenticatedAgentId: agentId,
      provider: "claude-code",
      rawInput: JSON.stringify({
        ...base,
        tool_input: { file_path: join(workspace, "workspace", "two.txt") },
      }),
    })).toThrowError(expect.objectContaining<Partial<HookControlError>>({ code: "HOOK_CONTROL_REPLAY_CONFLICT" }));
  });

  test("rejects a valid signed control result replayed against a different provider request", () => {
    const workspace = newWorkspace();
    const agentId = "request-bound-reader";
    installObservedRun(workspace, agentId);
    permitReadAndWrite(workspace);
    mkdirSync(join(workspace, "workspace"), { recursive: true });
    writeFileSync(join(workspace, "workspace", "first.txt"), "first");
    writeFileSync(join(workspace, "workspace", "second.txt"), "second");
    const firstRawInput = JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "Read",
      tool_use_id: "toolu_request_binding_first",
      tool_input: { file_path: join(workspace, "workspace", "first.txt") },
    });
    const secondRawInput = JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "Read",
      tool_use_id: "toolu_request_binding_second",
      tool_input: { file_path: join(workspace, "workspace", "second.txt") },
    });
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
    const unknown = evaluateProviderHookControl({
      workspace,
      authenticatedAgentId: agentId,
      provider: "claude-code",
      rawInput: JSON.stringify({
        hook_event_name: "PreToolUse",
        tool_name: "UnmappedDangerousTool",
        tool_use_id: "toolu_unknown_01",
        tool_input: { secret: "DO_NOT_RETAIN" },
      }),
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
      });
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
        rawInput: JSON.stringify({
          session_id: "private-bridge-session",
          hook_event_name: "PreToolUse",
          tool_name: "Read",
          tool_use_id: "toolu_bridge_control_01",
          tool_input: { file_path: fixturePath },
        }),
      });

      expect(result.control.decision).toBe("allow");
      expect(result.control.providerResponse).toEqual(expect.objectContaining({
        hookSpecificOutput: expect.objectContaining({ permissionDecision: "allow" }),
      }));
      expect(result.observation.receiptId).toBeTruthy();
      expect(verifyReceipt(result.control.receipt, getPublicKeyHistory(workspace, "monitor")).ok).toBe(true);
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
          tool_input: { file_path: fixturePath },
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
      expect(JSON.stringify(events)).not.toContain("private result");
    } finally {
      await bridge.close();
    }
  });
});
