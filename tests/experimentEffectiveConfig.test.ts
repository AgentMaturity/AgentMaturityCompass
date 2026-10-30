import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { SessionService } from "../src/session/sessionService.js";
import { randomUUID } from "node:crypto";
import { NATIVE_BUDGET_RESERVATION } from "../src/budgets/nativeBudgetUsage.js";
import { openLedger } from "../src/ledger/ledger.js";
import { createModelMetadataSnapshot, type ModelMetadataSnapshot } from "../src/llm/modelCatalog.js";
import { collectTrialReceipts } from "../src/experiments/trialReceipts.js";
import type { CaseExecutionRef } from "../src/casebooks/casebookRunner.js";
import { canonicalize } from "../src/utils/json.js";
import { sha256Hex } from "../src/utils/hash.js";

let workspace: string;
const active: SessionService[] = [];
const caseExecution: CaseExecutionRef = { v: 1, casebookId: "book", caseId: "case", caseSha256: "c".repeat(64),
  trialId: "trial", configDigest: "d".repeat(64) };
const expected = () => ({ agentId: "default", caseExecution });
beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "amc-trial-config-"));
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
});
afterEach(() => {
  for (const session of active.splice(0)) session.close({ reason: "completed" });
  rmSync(workspace, { recursive: true, force: true });
});

function evidence(options: { ref?: CaseExecutionRef; agentId?: string; providerId?: string; params?: Record<string, unknown>;
  metadata?: ModelMetadataSnapshot | null; prompt?: string; adapterVersion?: number; requestBytes?: string; pending?: boolean; open?: boolean;
  reported?: boolean; input?: number; cost?: number; additionalCosts?: readonly number[]; noRequest?: boolean; sessionId?: string } = {}) {
  const session = new SessionService(workspace);
  const agentId = options.agentId ?? "default";
  session.stampEveryRow({ agentId, caseExecution: options.ref ?? caseExecution });
  session.open({ sessionId: options.sessionId, agentId, harnessVersion: "trial-config-fixture",
    compositionDigest: "a".repeat(64), policyDigest: "b".repeat(64) });
  let headerEventId: string | null = null;
  const headerEventIds: string[] = [];
  if (!options.noRequest) for (const cost of [options.cost, ...(options.additionalCosts ?? [])]) {
    const providerId = options.providerId ?? "openai";
    const prompt = session.recordSystemPrompt(options.prompt ?? "actual-trial-persona");
    const prepared = session.recordRequestHeader({ providerId, model: "gpt-4o", params: options.params ?? { max_tokens: 128 },
      encoderId: "openai-chat", encoderVersion: 4, systemPromptEventId: prompt.eventId, toolSchema: null,
      projectionCutoffEventId: "cutoff", projectionDigest: "projection", sourceEventIds: [],
      requestBytes: options.requestBytes ?? "fixture-wire", ...(options.metadata === undefined ? {} : { modelMetadata: options.metadata }) });
    headerEventId = prepared.headerEventId;
    headerEventIds.push(headerEventId);
    if (!options.pending) {
      const usage = { reported: options.reported ?? true, complete: options.reported !== false,
        inputTokens: options.input ?? 10, outputTokens: 5, cacheReadTokens: 2, cacheWriteTokens: 0, reasoningTokens: 3,
        ...(cost === undefined ? {} : { costUsd: cost }) };
      session.recordRequestOutcome({ headerEventId: prepared.headerEventId, requestDigest: prepared.requestDigest,
        providerId, adapterId: "openai-chat", adapterVersion: options.adapterVersion ?? 4, httpStatus: 200, durationMs: 1,
        blocks: [], dispatchAttempted: true, outcome: "completed", finishReason: "stop", usage });
    }
  }
  if (options.open) active.push(session);
  else session.close({ reason: "completed" });
  return { sessionId: session.sessionId, headerEventId, headerEventIds };
}

function stageReservation(sessionId: string, headerEventId: string, stage: unknown, overrides: Record<string, unknown> = {}): void {
  const ledger = openLedger(workspace);
  const reservationSession = `native-budget-${randomUUID()}`;
  try {
    ledger.startSession({ sessionId: reservationSession, runtime: "amc", binaryPath: "amc-native-budget-admission", binarySha256: "a".repeat(64) });
    const meta = { auditType: NATIVE_BUDGET_RESERVATION, agentId: "default", trustTier: "OBSERVED", kind: "llm",
      nativeSessionId: sessionId, headerEventId, reservationKey: `llm:${sessionId}:${headerEventId}`, experimentStage: stage, ...overrides };
    ledger.appendEvidence({ sessionId: reservationSession, runtime: "amc", eventType: "audit", payload: JSON.stringify(meta),
      payloadExt: "json", inline: true, meta });
    ledger.sealSession(reservationSession);
  } finally { ledger.close(); }
}

const receipt = () => collectTrialReceipts(workspace, expected());

describe("effective trial configuration receipts (H2-02/H2-43)", () => {
  test("uses actual signed route, parameters, adapter and catalog without exposing raw parameters", () => {
    evidence({ params: { max_tokens: 128, user: "sk-private-param" }, cost: 0.2 });
    const result = receipt();
    const request = result.sessions[0]!.requests[0]!;
    expect(request).toMatchObject({ providerId: "openai", model: "gpt-4o", encoderId: "openai-chat", encoderVersion: 4,
      adapterId: "openai-chat", adapterVersion: 4, configurationComplete: true, dispatchAttempted: true, outcome: "completed", endpointIdentity: "unavailable" });
    expect(request.systemPromptSha256).toBe(sha256Hex("actual-trial-persona"));
    expect(request.paramsDigest).toBe(sha256Hex(canonicalize({ max_tokens: 128, user: "sk-private-param" })));
    expect(request.modelMetadataDigest).toBe(createModelMetadataSnapshot("openai", "openai-chat-completions", "gpt-4o")!.digest);
    expect(request.effectiveConfigDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result)).not.toContain("sk-private-param");
    expect(result).toMatchObject({ receiptState: "recorded", observedTokens: 17, tokensComplete: true,
      reportedCostUsd: 0.2, costComplete: true });
    expect(result.sessions[0]!.cost?.estimatedSubtotalUsd).toBeGreaterThan(0);
    expect(result.sessions[0]!.cost?.estimatedSubtotalUsd).not.toBe(0.2);
  });

  test("stable route identity excludes task wire bytes and intentional persona changes", () => {
    evidence({ requestBytes: "case-one" });
    evidence({ requestBytes: "case-two" });
    const otherRef = { ...caseExecution, configDigest: "e".repeat(64) };
    evidence({ ref: otherRef, prompt: "changed actual persona" });
    const other = collectTrialReceipts(workspace, { agentId: "default", caseExecution: otherRef }).sessions[0]!.requests[0]!;
    const requests = receipt().sessions.map(session => session.requests[0]!);
    expect(requests[0]!.requestIdentityDigest).not.toBe(requests[1]!.requestIdentityDigest);
    expect(requests[0]!.routeConfigDigest).toBe(requests[1]!.routeConfigDigest);
    expect(requests[0]!.effectiveConfigDigest).toBe(requests[1]!.effectiveConfigDigest);
    expect(requests[0]!.routeConfigDigest).toBe(other.routeConfigDigest);
    expect(requests[0]!.effectiveConfigDigest).not.toBe(other.effectiveConfigDigest);
    evidence({ prompt: "another actual prompt with same admitted stamp" });
    const changedPrompt = receipt().sessions[2]!.requests[0]!;
    expect(changedPrompt.routeConfigDigest).toBe(requests[0]!.routeConfigDigest);
    expect(changedPrompt.effectiveConfigDigest).not.toBe(requests[0]!.effectiveConfigDigest);
  });

  test("route parameter, provider, adapter and catalog changes each change effective identity", () => {
    evidence();
    evidence({ params: { max_tokens: 256 } });
    evidence({ providerId: "custom", metadata: null });
    evidence({ adapterVersion: 5 });
    const { digest: _oldDigest, ...payload } = createModelMetadataSnapshot("openai", "openai-chat-completions", "gpt-4o")!;
    const changed = { ...payload, contextWindowTokens: 1000 };
    evidence({ metadata: { ...changed, digest: sha256Hex(canonicalize(changed)) } });
    const requests = receipt().sessions.map(session => session.requests[0]!);
    expect(new Set(requests.map(request => request.routeConfigDigest)).size).toBe(5);
    expect(new Set(requests.map(request => request.effectiveConfigDigest)).size).toBe(5);
  });

  test("requires the whole exact execution stamp and native session owner", () => {
    evidence({ ref: { ...caseExecution, configDigest: "e".repeat(64) }, cost: 5 });
    expect(receipt()).toMatchObject({ receiptState: "unavailable", sessions: [], observedTokens: null,
      tokensComplete: false, reportedCostUsd: null, costComplete: false });
    evidence({ cost: 0 });
    expect(receipt()).toMatchObject({ sessions: [{ requests: [{ model: "gpt-4o" }] }], observedTokens: 17,
      reportedCostUsd: 0, costComplete: true });
    evidence({ agentId: "other" });
    expect(receipt).toThrow(/belongs to another agent/);
  });

  test("no native request, pending, unreported and open sessions remain unknown, never zero spend", () => {
    expect(receipt()).toMatchObject({ receiptState: "unavailable", observedTokens: null, reportedCostUsd: null });
    evidence({ noRequest: true });
    expect(receipt()).toMatchObject({ receiptState: "unavailable", tokensComplete: false, costComplete: false });
    evidence({ pending: true });
    expect(receipt().sessions[1]!.requests[0]).toMatchObject({ outcome: "pending", dispatchAttempted: null, outcomeEventId: null });
    evidence({ reported: false });
    evidence({ open: true, cost: 0.2 });
    expect(receipt()).toMatchObject({ receiptState: "recorded", observedTokens: 17, tokensComplete: false,
      reportedCostUsd: null, costComplete: false });
  });

  test("multiple exact native sessions contribute once while estimates cannot settle measured USD", () => {
    evidence({ cost: 0.1 });
    evidence({ cost: 0 });
    expect(receipt()).toMatchObject({ observedTokens: 34, tokensComplete: true, reportedCostUsd: 0.1, costComplete: true });
    evidence();
    const result = receipt();
    expect(result).toMatchObject({ observedTokens: 51, tokensComplete: true, reportedCostUsd: null, costComplete: false });
    expect(result.sessions[2]!.cost).toMatchObject({ reportedSubtotalUsd: null, completeRequests: 1 });
    expect(result.sessions[2]!.cost?.estimatedSubtotalUsd).toBeGreaterThan(0);
  });


  test("splits a session's signed request costs by admitted role without repeating the aggregate", () => {
    const selected = evidence({ cost: 0.1, additionalCosts: [0.2, 0.3, 0.4, 0.5] });
    stageReservation(selected.sessionId, selected.headerEventIds[0]!, "baseline");
    stageReservation(selected.sessionId, selected.headerEventIds[1]!, "judge");
    stageReservation(selected.sessionId, selected.headerEventIds[2]!, "proposer");
    stageReservation(selected.sessionId, selected.headerEventIds[4]!, undefined);
    const session = receipt().sessions[0]!;
    expect(session.cost?.reportedSubtotalUsd).toBe(1.5);
    expect(session.costStages.map(stage => [stage.stage, stage.role, stage.cost?.reportedSubtotalUsd])).toEqual([
      ["baseline", "executor", 0.1], ["judge", "judge", 0.2], ["proposer", "proposer", 0.3], ["executor", "executor", 0.9]
    ]);
    expect(session.costStages.flatMap(stage => stage.cost?.requests ?? [])).toHaveLength(5);
    expect(new Set(session.costStages.flatMap(stage => stage.cost?.requests.map(request => request.headerEventId) ?? [])).size).toBe(5);
  });

  test.each(["repair", null, 7])("refuses an invalid signed experiment stage marker %j", stage => {
    const selected = evidence({ cost: 0.1 });
    stageReservation(selected.sessionId, selected.headerEventId!, stage);
    expect(receipt).toThrow(/stage marker is invalid/);
  });

  test.each([{ kind: "tool" }, { agentId: "another-agent" }, { nativeSessionId: "another-session" }, { reservationKey: "llm:wrong:request" }])(
    "refuses an invalid signed stage reservation identity %j", overrides => {
      const selected = evidence({ cost: 0.1 });
      stageReservation(selected.sessionId, selected.headerEventId!, "judge", overrides);
      expect(receipt).toThrow(/stage reservation identity is invalid/);
    });

  test("refuses ambiguous signed stage reservations for a native request", () => {
    const selected = evidence({ cost: 0.1 });
    stageReservation(selected.sessionId, selected.headerEventId!, "judge");
    stageReservation(selected.sessionId, selected.headerEventId!, "judge");
    expect(receipt).toThrow(/ambiguous stage reservations/);
  });

  test("withholds unsafe session labels while preserving signed usage", () => {
    evidence({ sessionId: "sk-private-session", cost: 0 });
    const result = receipt();
    expect(result.sessions[0]!.sessionId).toBeNull();
    expect(result.reportedCostUsd).toBe(0);
    expect(JSON.stringify(result)).not.toContain("sk-private-session");
  });

  test("signed-row tampering fails verification before any effective identity is accepted", () => {
    const { headerEventId } = evidence();
    const ledger = openLedger(workspace);
    try {
      ledger.db.exec("DROP TRIGGER IF EXISTS protect_evidence_immutable; DROP TRIGGER IF EXISTS no_update_evidence;");
      const stored = ledger.db.prepare("SELECT meta_json FROM evidence_events WHERE id = ?").get(headerEventId) as { meta_json: string };
      ledger.db.prepare("UPDATE evidence_events SET meta_json = ? WHERE id = ?")
        .run(JSON.stringify({ ...JSON.parse(stored.meta_json), tampered: true }), headerEventId);
    } finally { ledger.close(); }
    expect(receipt).toThrow(/signature|hash/);
  });
});
