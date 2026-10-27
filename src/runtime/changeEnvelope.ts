/**
 * Change envelopes (P2-26 slice C): pinned model, prompt, tool, policy and corpus versions with PCCP-style pre-declared
 * changes, each carrying the tests that must pass before the change counts as inside the envelope. AMC is designed to
 * support a predetermined-change-control style of review; it claims no FDA or other conformity.
 *
 * An envelope is a P2-24 bound record: requestChangeEnvelope writes the draft and raises its approval (kind
 * "change-envelope"), activateChangeEnvelope signs it once that approval's quorum is met. At native session open,
 * checkChangeEnvelopeAtOpen compares the live manifest with the agent's newest envelope. Identical: allow. Every change
 * admitted by the envelope with passing evidence for its tests: allow, citing the envelope. Otherwise, in a regulated
 * workspace (an active compiled plan): block and record AGENT_REASSESSMENT_REQUIRED; elsewhere warn and record it.
 *
 * P2-23 owns the version manifest (src/lifecycle/versionManifest.ts) and reassessment as a lifecycle state; it is built
 * in parallel. AgentVersionManifest below is the minimal shape this module compares, and the AGENT_REASSESSMENT_REQUIRED
 * ledger row is the reassessment record until P2-23's state machine consumes it.
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { loadActiveCompiledPolicy } from "../catalog/compiler/activate.js";
import {
  assertRecordApproved, draftDigest, publishSignedRecord, raiseRecordApproval, readSignedRecords, approvalMatches, sessionPrincipal,
  BoundRecordError, type BoundApproval
} from "../governor/boundRecords.js";
import { openLedger } from "../ledger/ledger.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";

/** The minimal manifest P2-26 compares (P2-23 owns the full one; reconcile at integration). */
export interface AgentVersionManifest {
  model: { providerId: string; name: string; providerVersion: string | null };
  promptDigest: string;
  toolsDigest: string | null;
  policyDigest: string;
  corpusDigest: string | null;
}

const COMPONENTS = ["model", "prompt", "tool", "corpus", "policy"] as const;
type Component = (typeof COMPONENTS)[number];
const RULES = ["pinned", "digest_in_set", "provider_version_in_set"] as const;

const manifestSchema = z.strictObject({
  model: z.strictObject({ providerId: z.string().min(1), name: z.string().min(1), providerVersion: z.string().min(1).nullable() }),
  promptDigest: z.string().min(1), toolsDigest: z.string().min(1).nullable(), policyDigest: z.string().min(1), corpusDigest: z.string().min(1).nullable()
});
const draftSchema = z.strictObject({
  v: z.literal(1), envelopeId: z.string().regex(/^env_[a-f0-9]{24}$/), agentId: z.string().min(1), baseline: manifestSchema,
  allowed: z.array(z.strictObject({ component: z.enum(COMPONENTS), rule: z.enum(RULES), values: z.array(z.string().min(1)),
    requiredTests: z.array(z.string().min(1)) })),
  validUntil: z.number().int(), requestedBy: z.string().min(1), createdTs: z.number().int()
});
type EnvelopeDraft = z.infer<typeof draftSchema>;
const envelopeSchema = draftSchema.extend({ approvalId: z.string().min(1),
  approval: z.strictObject({ agentId: z.string(), approvalRequestId: z.string(), requestBindingDigest: z.string() }) });
/** The signed envelope: the spec's ChangeEnvelope, with the P2-24 binding beside approvalId; the signature is its .sig sidecar. */
export type ChangeEnvelope = z.infer<typeof envelopeSchema>;

const envelopeDir = (workspace: string) => join(workspace, ".amc", "runtime", "envelopes");
const pendingPath = (workspace: string, id: string) => join(envelopeDir(workspace), "pending", `${id}.json`);

/** The value of one component as the envelope's rules compare it. */
function valueOf(manifest: AgentVersionManifest, component: Component): string {
  switch (component) {
    case "model": return `${manifest.model.providerId}/${manifest.model.name}@${manifest.model.providerVersion ?? "unpinned"}`;
    case "prompt": return manifest.promptDigest;
    case "tool": return manifest.toolsDigest ?? "none";
    case "policy": return manifest.policyDigest;
    case "corpus": return manifest.corpusDigest ?? "none";
  }
}

function admits(entry: ChangeEnvelope["allowed"][number], live: AgentVersionManifest, baseline: AgentVersionManifest): boolean {
  switch (entry.rule) {
    case "pinned": return false; // A pinned component admits no change at all.
    case "digest_in_set": return entry.values.includes(valueOf(live, entry.component));
    case "provider_version_in_set":
      return entry.component === "model" && live.model.providerVersion !== null && entry.values.includes(live.model.providerVersion)
        && live.model.providerId === baseline.model.providerId && live.model.name === baseline.model.name;
  }
}

export interface EnvelopeDecision {
  outcome: "allow" | "allow_in_envelope" | "block" | "warn";
  envelopeId: string | null;
  changed: Component[];
  reasons: string[];
  /** A model with no provider-reported version: a claim downgrade, never a pass on its own. */
  unpinned: boolean;
}

/** Pure: the decision for one live manifest against one envelope (or none, or one that could not be verified). */
function evaluateChangeEnvelope(p: {
  live: AgentVersionManifest; envelope: ChangeEnvelope | null; envelopeProblem: string | null; regulated: boolean; nowTs: number;
  testPassed: (envelopeId: string, testId: string) => boolean;
}): EnvelopeDecision {
  const unpinned = p.live.model.providerVersion === null;
  const fail = (envelopeId: string | null, changed: Component[], reasons: string[]): EnvelopeDecision =>
    ({ outcome: p.regulated ? "block" : "warn", envelopeId, changed, reasons, unpinned });
  if (p.envelopeProblem !== null) return fail(null, [], [p.envelopeProblem]);
  if (p.envelope === null) return { outcome: "allow", envelopeId: null, changed: [], reasons: ["no change envelope: version pinning is not evaluated"], unpinned };
  const envelope = p.envelope;
  const changed = COMPONENTS.filter((component) => valueOf(p.live, component) !== valueOf(envelope.baseline, component));
  if (p.nowTs > envelope.validUntil) return fail(envelope.envelopeId, changed, [`envelope ${envelope.envelopeId} expired at ${new Date(envelope.validUntil).toISOString()}`]);
  if (changed.length === 0) return { outcome: "allow", envelopeId: envelope.envelopeId, changed, reasons: ["identical to the envelope baseline"], unpinned };
  const reasons: string[] = [];
  for (const component of changed) {
    const entries = envelope.allowed.filter((entry) => entry.component === component && admits(entry, p.live, envelope.baseline));
    if (entries.length === 0) {
      reasons.push(`${component} changed to ${valueOf(p.live, component)}, outside envelope ${envelope.envelopeId}`);
      continue;
    }
    const covered = entries.some((entry) => entry.requiredTests.every((testId) => p.testPassed(envelope.envelopeId, testId)));
    if (!covered) reasons.push(`${component} change is inside envelope ${envelope.envelopeId} but its required tests have no passing evidence`);
  }
  if (reasons.length > 0) return fail(envelope.envelopeId, changed, reasons);
  return { outcome: "allow_in_envelope", envelopeId: envelope.envelopeId, changed, reasons: [`every change is inside envelope ${envelope.envelopeId} with passing tests`], unpinned };
}

/** The agent's newest verified envelope, or a problem when any envelope file fails verification (never silently skipped). */
function activeChangeEnvelope(workspace: string, agentId: string): { envelope: ChangeEnvelope | null; problem: string | null } {
  const read = readSignedRecords(workspace, envelopeDir(workspace), "change-envelope", (raw) => envelopeSchema.parse(raw));
  const invalid = [...read.invalid];
  const mine: ChangeEnvelope[] = [];
  for (const row of read.records) {
    if (row.file !== `${row.record.envelopeId}.json` || !approvalMatches(workspace, row.record.approval, "change-envelope", draftDigest(envelopeDraftOf(row.record)))) {
      invalid.push({ file: row.file, reason: "envelope does not bind to its approval" });
    } else if (row.record.agentId === agentId) {
      mine.push(row.record);
    }
  }
  if (invalid.length > 0) return { envelope: null, problem: `unverifiable change envelope: ${invalid.map((i) => `${i.file} (${i.reason})`).join(", ")}` };
  return { envelope: mine.sort((a, b) => b.createdTs - a.createdTs || b.envelopeId.localeCompare(a.envelopeId))[0] ?? null, problem: null };
}

function envelopeDraftOf(envelope: ChangeEnvelope): EnvelopeDraft {
  const { approvalId: _id, approval: _approval, ...draft } = envelope;
  return draft;
}

function audit(workspace: string, auditType: string, meta: Record<string, unknown>): void {
  const ledger = openLedger(workspace);
  try {
    const sessionId = `change-envelope-${randomUUID()}`;
    ledger.startSession({ sessionId, runtime: "unknown", binaryPath: "amc-change-envelope", binarySha256: "amc-change-envelope" });
    ledger.appendEvidence({ sessionId, runtime: "unknown", eventType: "audit", payload: JSON.stringify({ auditType, ...meta }), inline: true,
      meta: { auditType, trustTier: "OBSERVED", ...meta } });
  } finally {
    ledger.close();
  }
}

/** Records one required test's outcome for an envelope (self-reported by whoever ran it; the decision cites it). */
export function recordEnvelopeTestResult(workspace: string, p: { envelopeId: string; testId: string; passed: boolean; recordedBy: string }): void {
  audit(workspace, "CHANGE_ENVELOPE_TEST_RESULT", { envelopeId: p.envelopeId, testId: p.testId, passed: p.passed, recordedBy: p.recordedBy, claimKind: "self_reported" });
}

/** The newest recorded result for each (envelope, test) decides; no row is no evidence. */
function ledgerTestPassed(workspace: string): (envelopeId: string, testId: string) => boolean {
  const ledger = openLedger(workspace, { readonly: true });
  let rows: Array<{ meta_json: string }>;
  try {
    rows = ledger.db.prepare("SELECT meta_json FROM evidence_events WHERE event_type = 'audit' AND meta_json LIKE '%CHANGE_ENVELOPE_TEST_RESULT%' ORDER BY ts, rowid")
      .all() as Array<{ meta_json: string }>;
  } finally {
    ledger.close();
  }
  const latest = new Map<string, boolean>();
  for (const row of rows) {
    const meta = JSON.parse(row.meta_json) as Record<string, unknown>;
    if (meta.auditType === "CHANGE_ENVELOPE_TEST_RESULT") latest.set(`${String(meta.envelopeId)}\0${String(meta.testId)}`, meta.passed === true);
  }
  return (envelopeId, testId) => latest.get(`${envelopeId}\0${testId}`) === true;
}

export class ChangeEnvelopeBlocked extends Error {
  readonly code = "CHANGE_ENVELOPE_BLOCKED" as const;
  constructor(readonly decision: EnvelopeDecision) {
    super(`change_envelope_blocked: ${decision.reasons.join("; ")}. A reassessment is required before this agent runs again.`);
    this.name = "ChangeEnvelopeBlocked";
  }
}

/**
 * The session-open check. With no envelope directory there is nothing to compare and nothing is read. A blocked
 * session throws before any session row exists; a warning or an in-envelope change is recorded in the ledger.
 */
export function checkChangeEnvelopeAtOpen(p: { workspace: string; agentId: string; live: AgentVersionManifest; nowTs?: number }): EnvelopeDecision {
  if (!existsSync(envelopeDir(p.workspace))) return evaluateChangeEnvelope({ ...p, envelope: null, envelopeProblem: null, regulated: false, nowTs: p.nowTs ?? Date.now(), testPassed: () => false });
  const { envelope, problem } = activeChangeEnvelope(p.workspace, p.agentId);
  let regulated: boolean;
  try { regulated = loadActiveCompiledPolicy(p.workspace) !== null; } catch { regulated = true; } // An unreadable plan cannot prove the workspace unregulated.
  const decision = evaluateChangeEnvelope({ live: p.live, envelope, envelopeProblem: problem, regulated, nowTs: p.nowTs ?? Date.now(),
    testPassed: ledgerTestPassed(p.workspace) });
  const meta = { agentId: p.agentId, envelopeId: decision.envelopeId, changed: decision.changed, reasons: decision.reasons, unpinned: decision.unpinned,
    liveManifestSha256: sha256Hex(JSON.stringify(p.live)) };
  if (decision.outcome === "block" || decision.outcome === "warn") audit(p.workspace, "AGENT_REASSESSMENT_REQUIRED", { ...meta, outcome: decision.outcome });
  if (decision.outcome === "allow_in_envelope") audit(p.workspace, "CHANGE_ENVELOPE_APPLIED", meta);
  if (decision.outcome === "block") throw new ChangeEnvelopeBlocked(decision);
  return decision;
}

/** The live manifest of a native session at open. No provider reports a version before the first response: unpinned. */
export function nativeSessionManifest(init: { route: { providerId: string; model: string }; systemPrompt: string; expectedToolsDigest?: string; policyDigest: string }): AgentVersionManifest {
  return { model: { providerId: init.route.providerId, name: init.route.model, providerVersion: null }, promptDigest: sha256Hex(init.systemPrompt),
    toolsDigest: init.expectedToolsDigest ?? null, policyDigest: init.policyDigest, corpusDigest: null };
}

export interface ChangeEnvelopeRequest {
  /** An `amc approvals login` token: the requester is its authenticated user. */
  sessionTokenFile: string;
  agentId: string;
  baseline: AgentVersionManifest;
  allowed: ChangeEnvelope["allowed"];
  validUntil: number;
}

/** Step 1: write the draft and raise its P2-24 approval (the requester's own decision never counts). */
export async function requestChangeEnvelope(workspace: string, input: ChangeEnvelopeRequest): Promise<{ draft: EnvelopeDraft; approval: BoundApproval }> {
  const requester = sessionPrincipal(workspace, input.sessionTokenFile);
  const draft = draftSchema.parse({ v: 1, envelopeId: `env_${randomUUID().replace(/-/g, "").slice(0, 24)}`, agentId: input.agentId,
    baseline: input.baseline, allowed: input.allowed, validUntil: input.validUntil, requestedBy: requester.userId, createdTs: Date.now() });
  if (draft.validUntil <= draft.createdTs) throw new BoundRecordError("invalid_window", "an envelope must be valid after it is requested");
  ensureDir(join(envelopeDir(workspace), "pending"));
  writeFileAtomic(pendingPath(workspace, draft.envelopeId), JSON.stringify(draft, null, 2), 0o600);
  const approval = await raiseRecordApproval(workspace, { kind: "change-envelope", recordId: draft.envelopeId, digest: draftDigest(draft),
    agentId: draft.agentId, initiator: requester.userId });
  return { draft, approval };
}

/** Step 2: with the approval's quorum met (requester excluded), sign and publish the draft exactly as approved. */
export async function activateChangeEnvelope(workspace: string, envelopeId: string, approval: BoundApproval): Promise<ChangeEnvelope> {
  if (!/^env_[a-f0-9]{24}$/.test(envelopeId) || !pathExists(pendingPath(workspace, envelopeId))) {
    throw new BoundRecordError("unknown_envelope", `no pending change envelope ${envelopeId}`);
  }
  const draft = draftSchema.parse(JSON.parse(readUtf8(pendingPath(workspace, envelopeId))) as unknown);
  assertRecordApproved(workspace, approval, { kind: "change-envelope", recordId: envelopeId, digest: draftDigest(draft), excluded: [draft.requestedBy], mode: "quorum" });
  const envelope = envelopeSchema.parse({ ...draft, approvalId: approval.approvalRequestId, approval });
  await publishSignedRecord(workspace, envelopeDir(workspace), envelopeId, envelope, "change-envelope");
  return envelope;
}
