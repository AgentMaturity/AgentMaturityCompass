import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { openAgentSession, type AgentSessionInit } from "../agent/agentSession.js";
import { getMode } from "../mode/mode.js";
import { readRevokedLeaseIds } from "../leases/leaseStore.js";
import { verifyLeaseToken } from "../leases/leaseVerifier.js";
import { runImmediateTransaction } from "../ledger/ledgerSessionTransactions.js";
import type { Ledger } from "../ledger/ledger.js";
import { sha256Hex } from "../utils/hash.js";
import { describeAcceptedWork } from "./workAcceptance.js";
import { decodeParams } from "./wireCodecs.js";

/** Operator configuration, never built from the accepted message's capabilities or URLs. */
export type WireWorkExecution = Omit<AgentSessionInit, "workspace" | "sessionId" | "agentId" | "leaseToken" | "acceptedWork">;
export interface ConsumeAcceptedWorkInit {
  readonly workspace: string;
  readonly ledger: Ledger;
  /** An open owner intake; claim/settlement rows use this writer, never the native session's spine. */
  readonly intakeSessionId: string;
  readonly monitorPublicKeys: readonly string[];
  readonly receipt: string;
  /** Held only in memory. The acceptance commits to its digest; no bearer credential enters evidence. */
  readonly leaseToken?: string;
  readonly execution?: WireWorkExecution;
  readonly signal?: AbortSignal;
}
export interface ConsumedWork {
  readonly ok: boolean;
  readonly state: "completed" | "failed" | "refused" | "not-claimed";
  readonly reason: string;
  readonly workSessionId?: string;
  readonly claimId?: string;
}

// ponytail: one active wire execution per workspace/process; refuse overflow rather than accumulate a hidden queue.
// Occurrence claims below are durable and cross-process; a crashed claim is never automatically replayed.
const activeWorkspaces = new Set<string>();

/** Consume one occurrence. Claims are committed before composition/awaits; a second owner can never execute it again. */
export async function consumeAcceptedWork(init: ConsumeAcceptedWorkInit): Promise<ConsumedWork> {
  if (getMode(init.workspace) !== "owner") throw new Error("Wire work execution requires owner mode.");
  // Verification and the acceptance snapshot share the claim's write lock. Ordinary
  // payload relocation updates cannot substitute authority between those reads.
  const admission = runImmediateTransaction(init.ledger.db, () => {
    const described = describeAcceptedWork(init);
    if (!described.ok) return { ok: false as const, outcome: { ok: false, state: "not-claimed" as const, reason: described.reason } };
    if (described.state !== "not-started") return { ok: false as const, outcome: { ok: false, state: "not-claimed" as const,
      reason: "Accepted occurrence is already claimed or started.", workSessionId: described.workSessionId } };
    const intake = init.ledger.db.prepare("SELECT ended_ts FROM sessions WHERE session_id = ?").get(init.intakeSessionId) as { ended_ts: number | null } | undefined;
    if (intake === undefined || intake.ended_ts !== null) throw new Error("Wire consumer requires an open intake session.");
    const claimId = randomUUID();
    const evidence = { acceptedEventId: described.eventId, acceptanceReceipt: init.receipt,
      workSessionId: described.workSessionId, claimId, agentId: described.request?.agentId };
    const record = (type: string, reason: string) => init.ledger.appendEvidence({ sessionId: init.intakeSessionId,
      runtime: "amc", eventType: "audit", payload: reason, inline: true,
      meta: { ...evidence, type, trustTier: "OBSERVED" } });
    record("wire_work_claimed", "Accepted wire occurrence claimed before native dispatch.");
    return { ok: true as const, described, claimId, record };
  });
  if (!admission.ok) return admission.outcome;
  const { described, claimId, record } = admission;
  const refuse = (reason: string): ConsumedWork => {
    record("wire_work_refused", reason);
    return { ok: false, state: "refused", reason, workSessionId: described.workSessionId, claimId };
  };
  // All refusals spend this occurrence. A caller must submit new work to make a different authorization decision.
  const token = init.leaseToken;
  const authority = described.authority;
  if (token === undefined || authority?.tokenSha256 !== sha256Hex(token)) return refuse("Acceptance has no matching live lease authority; no owner credential was substituted.");
  const revoked = readRevokedLeaseIds(init.workspace);
  if (!revoked.ok) return refuse("Lease revocations cannot be verified.");
  const request = described.request;
  const params = decodeParams("work/accept", { prompt: request?.prompt, providerId: request?.providerId, model: request?.model });
  if (!params.ok || typeof request?.agentId !== "string" || request.agentId.length === 0) return refuse("Acceptance request is malformed.");
  const lease = verifyLeaseToken({ workspace: init.workspace, token, requiredScope: "wire:submit", routePath: "/wire/work/accept",
    expectedAgentId: request.agentId, model: init.execution?.route.model ?? request.model, revokedLeaseIds: revoked.ids });
  if (!lease.ok || lease.payload === null || lease.payload.leaseId !== authority?.leaseId) return refuse(`Acceptance lease refused: ${lease.error ?? "identity mismatch"}`);
  const execution = init.execution;
  if (execution === undefined) return refuse("No owner-configured wire work consumer is available.");
  if (execution.route.providerId !== request.providerId || (request.model !== null && request.model !== execution.route.model)) return refuse("Accepted provider/model differs from the owner-configured route.");
  if ((execution.tools ?? "workspace") !== "none" && !lease.payload.scopes.includes("toolhub:execute")) return refuse("Workspace tools require the submitter's toolhub:execute lease scope.");
  if (init.signal?.aborted) return refuse("Wire work was cancelled before dispatch.");
  const workspaceKey = realpathSync(init.workspace);
  if (activeWorkspaces.has(workspaceKey)) return refuse("Wire work consumer is at its active execution cap (1); no work was queued.");
  activeWorkspaces.add(workspaceKey);
  let session: ReturnType<typeof openAgentSession> | undefined;
  const cancel = () => session?.cancel({ kind: "user" }, "wire-owner");
  try {
    session = openAgentSession({ ...execution, workspace: init.workspace, agentId: lease.payload.agentId,
      sessionId: described.workSessionId, leaseToken: token,
      acceptedWork: { eventId: described.eventId, receipt: init.receipt, claimId, leaseId: lease.payload.leaseId } });
    init.signal?.addEventListener("abort", cancel, { once: true });
    if (init.signal?.aborted) return refuse("Wire work was cancelled during composition; no prompt was dispatched.");
    const result = await session.prompt(params.value.prompt);
    await session.close();
    session = undefined;
    const ok = result.ok && result.turnEndReason === "complete";
    const reason = ok ? "Accepted work completed in its named native session." : result.ok ? `Native turn ended ${result.turnEndReason ?? "without an ending"}.` : result.reason;
    record(ok ? "wire_work_completed" : "wire_work_failed", reason);
    return { ok, state: ok ? "completed" : "failed", reason, workSessionId: described.workSessionId, claimId };
  } catch (error) {
    const reason = `Native work failed: ${(error instanceof Error ? error.message : String(error)).replaceAll(token, "[REDACTED]")}`;
    record("wire_work_failed", reason);
    return { ok: false, state: "failed", reason, workSessionId: described.workSessionId, claimId };
  } finally {
    init.signal?.removeEventListener("abort", cancel);
    try { await session?.close(); } finally { activeWorkspaces.delete(workspaceKey); }
  }
}
