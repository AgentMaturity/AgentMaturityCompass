import { randomUUID } from "node:crypto";
import type { Ledger } from "../ledger/ledger.js";
import { hashBinaryOrPath } from "../ledger/ledger.js";
import { runImmediateTransaction } from "../ledger/ledgerSessionTransactions.js";
import type { RuntimeName, TrustTier } from "../types.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import type { AgentToolCall } from "./agentResponder.js";
import type { GatewayReceiptAdmission } from "./gatewayReceiptAdmission.js";

/** Which runner writes the session: the assurance runner, or the red-team runner (SH-TRUST-03), which shares these writers. */
export type AssuranceEvidenceSource = "assurance" | "redteam";
export const RUNNER_BINARY_PATH: Readonly<Record<AssuranceEvidenceSource, string>> = Object.freeze({ assurance: "amc-assurance-runner", redteam: "amc-redteam-runner" });

export function startAssuranceSession(params: {
  ledger: Ledger;
  mode: "supervise" | "sandbox";
  agentId: string;
  packIds: string[];
  trustTier: TrustTier;
  source?: AssuranceEvidenceSource;
}): string {
  const sessionId = randomUUID();
  const source = params.source ?? "assurance", binaryPath = RUNNER_BINARY_PATH[source];
  // P0-55: the session and its "run started" row commit together, so a failed first row leaves no unsealed session
  // (the run's own catch seals everything after this).
  runImmediateTransaction(params.ledger.db, () => {
    params.ledger.startSession({
      sessionId,
      runtime: "unknown",
      binaryPath,
      binarySha256: hashBinaryOrPath(binaryPath, "1")
    });
    const run = { auditType: "ASSURANCE_RUN_STARTED", severity: "LOW", mode: params.mode, agentId: params.agentId, packIds: params.packIds, source };
    params.ledger.appendEvidence({
      sessionId,
      runtime: "unknown",
      eventType: "audit",
      payload: JSON.stringify(run),
      payloadExt: "json",
      inline: true,
      meta: { ...run, trustTier: params.trustTier }
    });
  });

  return sessionId;
}

/**
 * Seals an assurance session its run abandoned by throwing (P0-27 F1). Whole-ledger verification requires a seal on
 * every non-agent session, so one aborted scan made every later `agent-loop verify` in the workspace fail. Records
 * ASSURANCE_RUN_ABORTED with the error class, then seals. Never masks the run's error: returns it for the caller to
 * rethrow, and a failure here rides along as its `cause`. A session the run already sealed is left alone.
 */
export function sealAbortedAssuranceSession(params: {
  ledger: Ledger;
  sessionId: string;
  runId: string;
  agentId: string;
  error: unknown;
}): unknown {
  const { ledger, sessionId } = params;
  try {
    const session = ledger.db.prepare("SELECT session_seal_sig FROM sessions WHERE session_id = ?").get(sessionId) as
      | { session_seal_sig: string | null }
      | undefined;
    if (!session || session.session_seal_sig) return params.error;
    const meta = {
      auditType: "ASSURANCE_RUN_ABORTED",
      severity: "HIGH",
      runId: params.runId,
      agentId: params.agentId,
      reason: params.error instanceof Error ? params.error.name : "non-Error thrown"
    };
    ledger.appendEvidence({ sessionId, runtime: "unknown", eventType: "audit", payload: JSON.stringify(meta), payloadExt: "json", inline: true, meta });
    ledger.sealSession(sessionId);
  } catch (sealError) {
    if (params.error instanceof Error && params.error.cause === undefined) params.error.cause = sealError;
    else console.error(`[assurance] could not seal aborted session ${sessionId}: ${sealError instanceof Error ? sealError.message : String(sealError)}`);
  }
  return params.error;
}

/**
 * Seals the run's session if the process is interrupted (Ctrl-C, a CI timeout's SIGTERM), then dies of the same
 * signal. Runner sessions are legacy sessions, which whole-ledger verification requires to carry a seal: one
 * interrupted run would otherwise turn every later signed run in the workspace INVALID, with no CLI path to seal it.
 * Returns the disposer to call once the run has sealed or aborted the session itself. A SIGKILL or a crash still
 * leaves the session open: nothing of this process runs then.
 */
export function sealAbortedSessionOnSignal(params: { ledger: Ledger; sessionId: string; runId: string; agentId: string }): () => void {
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  const onSignal = (signal: NodeJS.Signals): void => {
    dispose();
    sealAbortedAssuranceSession({ ...params, error: Object.assign(new Error(`run interrupted by ${signal}`), { name: "RunInterrupted" }) });
    process.kill(process.pid, signal);
  };
  const dispose = (): void => { for (const signal of signals) process.off(signal, onSignal); };
  for (const signal of signals) process.once(signal, onSignal);
  return dispose;
}

/** What every scenario writer needs beyond the pack and scenario: the session a run writes into. */
export type ScenarioEvidenceRows = Pick<Parameters<typeof writeScenarioPrompt>[0], "ledger" | "sessionId" | "runtime" | "trustTier" | "agentId" | "source">;


/**
 * Renders scenario text for the evidence ledger under the assurance policy.
 *
 * The policy schema declares storeRawPrompts as a literal false and
 * storeOnlyHashesAndRefs as a literal true — not a default but a guarantee the
 * product makes. The writers below nonetheless put the full prompt and the
 * agent's full response into the ledger payload, so a scan of a production
 * agent persisted whatever it happened to say, including anything sensitive it
 * had been given.
 *
 * The digest keeps the evidence verifiable: a caller holding the original text
 * can prove it produced this record, without the record itself carrying it.
 */
function redactedScenarioPayload(text: string): string {
  return JSON.stringify({
    redacted: true,
    reason: "assurance policy: storeOnlyHashesAndRefs",
    sha256: sha256Hex(Buffer.from(text, "utf8")),
    bytes: Buffer.byteLength(text, "utf8")
  });
}

export function writeScenarioPrompt(params: {
  ledger: Ledger;
  sessionId: string;
  source?: AssuranceEvidenceSource;
  runtime: RuntimeName;
  trustTier: TrustTier;
  packId: string;
  scenarioId: string;
  prompt: string;
  agentId: string;
}): string {
  return params.ledger.appendEvidence({
    sessionId: params.sessionId,
    runtime: params.runtime,
    eventType: "stdin",
    payload: redactedScenarioPayload(params.prompt),
    payloadExt: "json",
    meta: {
      source: params.source ?? "assurance",
      packId: params.packId,
      scenarioId: params.scenarioId,
      direction: "assurance_to_agent",
      agentId: params.agentId,
      trustTier: params.trustTier
    }
  });
}

export function writeScenarioResponse(params: {
  ledger: Ledger;
  sessionId: string;
  source?: AssuranceEvidenceSource;
  runtime: RuntimeName;
  trustTier: TrustTier;
  packId: string;
  scenarioId: string;
  response: string;
  /** Tool calls the agent made; the digest then covers canonical `{ text, toolCalls }`. */
  toolCalls?: AgentToolCall[];
  agentId: string;
  gatewayReceipt?: GatewayReceiptAdmission;
}): string {
  const { request = null, response = null, requestSeenOnly = null } = params.gatewayReceipt ?? {};
  const toolCallCount = params.toolCalls?.length ?? 0;
  // A reply without tool calls keeps the plain-text digest older records carry.
  const recorded = toolCallCount > 0 ? canonicalize({ text: params.response, toolCalls: params.toolCalls }) : params.response;
  return params.ledger.appendEvidence({
    sessionId: params.sessionId,
    runtime: params.runtime,
    eventType: "stdout",
    payload: redactedScenarioPayload(recorded),
    payloadExt: "json",
    meta: {
      source: params.source ?? "assurance",
      packId: params.packId,
      scenarioId: params.scenarioId,
      direction: "agent_to_assurance",
      agentId: params.agentId,
      trustTier: params.trustTier,
      toolCallCount,
      ...(request === null ? {} : { requestReceipt: request.receipt }),
      ...(response === null ? {} : { responseReceipt: response }),
      ...(requestSeenOnly === null ? {} : { requestSeenOnly })
    }
  });
}

export function writeScenarioTestResult(params: {
  ledger: Ledger;
  sessionId: string;
  source?: AssuranceEvidenceSource;
  runtime: RuntimeName;
  trustTier: TrustTier;
  agentId: string;
  packId: string;
  scenarioId: string;
  score0to100: number;
  pass: boolean;
  reasons: string[];
  correlatedRequestIds: string[];
}): string {
  return params.ledger.appendEvidence({
    sessionId: params.sessionId,
    runtime: params.runtime,
    eventType: "test",
    payload: JSON.stringify({
      testType: "ASSURANCE_SCENARIO_RESULT",
      packId: params.packId,
      scenarioId: params.scenarioId,
      score0to100: params.score0to100,
      pass: params.pass,
      reasons: params.reasons,
      correlatedRequestIds: params.correlatedRequestIds
    }),
    payloadExt: "json",
    inline: true,
    meta: {
      source: params.source ?? "assurance",
      testType: "ASSURANCE_SCENARIO_RESULT",
      packId: params.packId,
      scenarioId: params.scenarioId,
      score0to100: params.score0to100,
      pass: params.pass,
      correlatedRequestIds: params.correlatedRequestIds,
      agentId: params.agentId,
      trustTier: params.trustTier
    }
  });
}

export function writePackScoreTestResult(params: {
  ledger: Ledger;
  sessionId: string;
  source?: AssuranceEvidenceSource;
  runtime: RuntimeName;
  trustTier: TrustTier;
  agentId: string;
  assuranceRunId: string;
  packId: string;
  score0to100: number;
  passCount: number;
  failCount: number;
}): string {
  return params.ledger.appendEvidence({
    sessionId: params.sessionId,
    runtime: params.runtime,
    eventType: "test",
    payload: JSON.stringify({
      testType: "ASSURANCE_PACK_SCORE",
      assuranceRunId: params.assuranceRunId,
      packId: params.packId,
      score0to100: params.score0to100,
      passCount: params.passCount,
      failCount: params.failCount
    }),
    payloadExt: "json",
    inline: true,
    meta: {
      source: params.source ?? "assurance",
      testType: "ASSURANCE_PACK_SCORE",
      assuranceRunId: params.assuranceRunId,
      packId: params.packId,
      score0to100: params.score0to100,
      passCount: params.passCount,
      failCount: params.failCount,
      agentId: params.agentId,
      trustTier: params.trustTier
    }
  });
}

export function writeAssuranceAudit(params: {
  ledger: Ledger;
  sessionId: string;
  source?: AssuranceEvidenceSource;
  runtime: RuntimeName;
  trustTier: TrustTier;
  agentId: string;
  packId: string;
  scenarioId: string;
  auditType: string;
  severity?: "LOW" | "MED" | "HIGH" | "CRITICAL";
  message: string;
  /** Fields the row attests beyond the message (a sandbox backend and its receipt digest), in its payload and meta. */
  attests?: Readonly<Record<string, unknown>>;
}): string {
  const severity = params.severity ?? "HIGH";
  const payload = JSON.stringify({
    auditType: params.auditType,
    severity,
    message: params.message,
    packId: params.packId,
    scenarioId: params.scenarioId,
    ...params.attests
  });
  const evidence = {
    sessionId: params.sessionId,
    runtime: params.runtime,
    eventType: "audit" as const,
    payload,
    payloadExt: "json" as const,
    inline: true,
    meta: {
      source: params.source ?? "assurance",
      auditType: params.auditType,
      severity,
      message: params.message,
      packId: params.packId,
      scenarioId: params.scenarioId,
      agentId: params.agentId,
      trustTier: params.trustTier,
      ...params.attests
    }
  };
  // `assurance run --no-sign` mints no receipt (AMC_NO_SIGN=1 authorizes none): the audit is a plain unsigned row.
  if (process.env.AMC_NO_SIGN === "1") return params.ledger.appendEvidence(evidence);
  const event = params.ledger.appendEvidenceWithReceipt({
    ...evidence,
    receipt: {
      kind: params.auditType.startsWith("TOOL_") ? "tool_action" : "guard_check",
      agentId: params.agentId,
      providerId: "unknown",
      model: null,
      bodySha256: sha256Hex(Buffer.from(payload, "utf8"))
    }
  });
  return event.id;
}
