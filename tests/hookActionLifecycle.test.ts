import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { ingestObservedAepHookEvent, type ObservedAepActionEvent } from "../src/bridge/hookIngress.js";
import { inspectHookActionLifecycle } from "../src/watch/hookActionLifecycle.js";
import { hashBinaryOrPath, openLedger } from "../src/ledger/ledger.js";
import { sha256Hex } from "../src/utils/hash.js";
import { initWorkspace } from "../src/workspace.js";

const roots: string[] = [];
let sequence = 0;

function newWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), "amc-hook-lifecycle-"));
  roots.push(workspace);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  return workspace;
}

function event(input: {
  agentId: string;
  actionId: string;
  type: "action.requested" | "action.completed" | "action.failed" | "action.denied";
  provider?: "claude-code" | "gemini-cli";
  correlationSha256?: string;
  time?: number;
}): ObservedAepActionEvent {
  sequence += 1;
  const provider = input.provider ?? "claude-code";
  const status = input.type === "action.completed"
    ? "success" as const
    : input.type === "action.failed"
      ? "failure" as const
      : input.type === "action.denied"
        ? "cancelled" as const
        : undefined;
  return {
    aep_version: "0.1",
    id: `source-${sequence}`,
    type: input.type,
    time: new Date(input.time ?? Date.now()).toISOString(),
    hook: input.type === "action.requested" ? "PreToolUse" : "PostToolUse",
    agent: { slug: input.agentId, surface: provider },
    action: {
      type: "tool_call",
      id: input.actionId,
      ...(status ? { status } : {}),
      ...(input.type === "action.failed" ? { error: { code: "PROVIDER_TOOL_FAILURE" } } : {}),
    },
    tool: { type: "native", name: "Read", original_name: "Read" },
    ...(input.type === "action.denied" ? { decision: { outcome: "denied" as const } } : {}),
    ...(input.correlationSha256 ? {
      extensions: {
        "x-amc-correlation": {
          v: 1,
          provider,
          sha256: input.correlationSha256,
          source: provider === "claude-code" ? "provider-call-id" : "bridge-unmatched-request",
          rawStored: false,
        },
      },
    } : {}),
  };
}

function ingest(workspace: string, input: ReturnType<typeof event>, now = Date.now()): string {
  return ingestObservedAepHookEvent({
    workspace,
    authenticatedAgentId: input.agent.slug,
    rawBody: Buffer.from(JSON.stringify(input), "utf8"),
    now,
  }).eventId;
}

function appendDecision(input: {
  workspace: string;
  agentId: string;
  actionId: string;
  provider?: "claude-code" | "gemini-cli";
  decision: "allow" | "deny" | "ask";
}): string {
  sequence += 1;
  const provider = input.provider ?? "claude-code";
  const ledger = openLedger(input.workspace);
  const sessionId = `decision-session-${sequence}`;
  const eventId = `decision-event-${sequence}`;
  const response = provider === "claude-code"
    ? { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: input.decision, permissionDecisionReason: "test" } }
    : input.decision === "allow" ? { decision: "allow" } : { decision: "deny", reason: "test" };
  const responseSha256 = sha256Hex(JSON.stringify(response));
  ledger.startSession({
    sessionId,
    runtime: provider === "claude-code" ? "claude" : "gemini",
    binaryPath: "amc-hook-lifecycle-test",
    binarySha256: hashBinaryOrPath("amc-hook-lifecycle-test", "1"),
  });
  const appended = ledger.appendEvidenceWithReceipt({
    id: eventId,
    sessionId,
    runtime: provider === "claude-code" ? "claude" : "gemini",
    eventType: "audit",
    payload: JSON.stringify({ kind: "hook_control_decision", actionId: input.actionId, decision: input.decision }),
    payloadExt: "json",
    meta: {
      trustTier: "OBSERVED",
      controlSchemaVersion: 1,
      agentId: input.agentId,
      provider,
      actionId: input.actionId,
      rawInputSha256: "a".repeat(64),
      rawPayloadStored: false,
      canonicalToolName: "fs.read",
      requestedDecision: input.decision,
      decision: input.decision,
      capabilityLossy: false,
      reason: "test",
      providerResponse: response,
      providerResponseSha256: responseSha256,
      bodySha256: responseSha256,
    },
    receipt: {
      kind: "guard_check",
      agentId: input.agentId,
      providerId: `hook-control:${provider}`,
      model: null,
      bodySha256: responseSha256,
    },
  });
  ledger.sealSession(sessionId);
  ledger.close();
  return appended.id;
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("verified hook action lifecycle", () => {
  test("joins immutable requested, decision, and completed receipts into one privacy-safe lifecycle", () => {
    const workspace = newWorkspace();
    const agentId = "lifecycle-agent";
    const actionId = "toolu_lifecycle_01";
    const correlationSha256 = "b".repeat(64);
    const requestedEventId = ingest(workspace, event({ agentId, actionId, type: "action.requested", correlationSha256 }));
    const decisionEventId = appendDecision({ workspace, agentId, actionId, decision: "allow" });
    const terminalEventId = ingest(workspace, event({ agentId, actionId, type: "action.completed", correlationSha256 }));

    const lifecycle = inspectHookActionLifecycle({ workspace, agentId, actionId });

    expect(lifecycle).toEqual(expect.objectContaining({
      schemaVersion: "2026-07-12",
      agentId,
      actionId,
      provider: "claude-code",
      status: "completed",
      valid: true,
      failClosed: false,
      reasonCodes: [],
      rawProviderPayloadStored: false,
    }));
    expect(lifecycle.phases.requested?.eventId).toBe(requestedEventId);
    expect(lifecycle.phases.decision).toEqual(expect.objectContaining({ eventId: decisionEventId, decision: "allow" }));
    expect(lifecycle.phases.terminal).toEqual(expect.objectContaining({ eventId: terminalEventId, type: "action.completed" }));
    expect(lifecycle.evidenceEventIds).toEqual([requestedEventId, decisionEventId, terminalEventId]);
    expect(lifecycle.receiptIds).toHaveLength(3);
  });

  test("fails closed for missing requests, duplicate terminals, impossible order, and execution after denial", () => {
    const workspace = newWorkspace();

    ingest(workspace, event({ agentId: "missing-request", actionId: "toolu_missing", type: "action.failed" }));
    expect(inspectHookActionLifecycle({ workspace, agentId: "missing-request", actionId: "toolu_missing" }).reasonCodes)
      .toContain("REQUEST_MISSING");

    ingest(workspace, event({ agentId: "duplicate-terminal", actionId: "toolu_duplicate", type: "action.requested" }));
    ingest(workspace, event({ agentId: "duplicate-terminal", actionId: "toolu_duplicate", type: "action.completed" }));
    ingest(workspace, event({ agentId: "duplicate-terminal", actionId: "toolu_duplicate", type: "action.failed" }));
    expect(inspectHookActionLifecycle({ workspace, agentId: "duplicate-terminal", actionId: "toolu_duplicate" }).reasonCodes)
      .toContain("TERMINAL_DUPLICATE");

    ingest(workspace, event({ agentId: "bad-order", actionId: "toolu_order", type: "action.completed" }));
    ingest(workspace, event({ agentId: "bad-order", actionId: "toolu_order", type: "action.requested" }));
    expect(inspectHookActionLifecycle({ workspace, agentId: "bad-order", actionId: "toolu_order" }).reasonCodes)
      .toContain("TERMINAL_BEFORE_REQUEST");

    ingest(workspace, event({ agentId: "denied-agent", actionId: "toolu_denied", type: "action.requested" }));
    appendDecision({ workspace, agentId: "denied-agent", actionId: "toolu_denied", decision: "deny" });
    ingest(workspace, event({ agentId: "denied-agent", actionId: "toolu_denied", type: "action.completed" }));
    const denied = inspectHookActionLifecycle({ workspace, agentId: "denied-agent", actionId: "toolu_denied" });
    expect(denied.failClosed).toBe(true);
    expect(denied.reasonCodes).toContain("DENIED_THEN_EXECUTED");
  });

  test("fails closed on cross-agent action ID collisions and signed-ledger tamper", () => {
    const workspace = newWorkspace();
    const actionId = "toolu_cross_agent";
    ingest(workspace, event({ agentId: "agent-a", actionId, type: "action.requested" }));
    ingest(workspace, event({ agentId: "agent-b", actionId, type: "action.completed" }));

    const collision = inspectHookActionLifecycle({ workspace, agentId: "agent-a", actionId });
    expect(collision.valid).toBe(false);
    expect(collision.reasonCodes).toContain("ACTION_ID_COLLISION");

    const tamperActionId = "toolu_tamper";
    const tamperedEventId = ingest(workspace, event({ agentId: "tamper-agent", actionId: tamperActionId, type: "action.requested" }));
    const ledger = openLedger(workspace);
    const tamperedEvent = ledger.getEventById(tamperedEventId);
    ledger.close();
    expect(tamperedEvent?.payload_path).toBeTruthy();
    writeFileSync(join(workspace, tamperedEvent!.payload_path!), "tampered payload", "utf8");
    const tampered = inspectHookActionLifecycle({ workspace, agentId: "tamper-agent", actionId: tamperActionId });
    expect(tampered.valid).toBe(false);
    expect(tampered.reasonCodes).toContain("EVIDENCE_INTEGRITY_FAILED");
  });
});
