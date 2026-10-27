/**
 * Change envelopes (P2-26 slice C): pinned model, prompt, tool, policy and corpus versions with PCCP-style pre-declared
 * changes, each carrying the tests that must pass before the change counts as inside the envelope. AMC is designed to
 * support a predetermined-change-control style of review; it claims no FDA or other conformity.
 *
 * An envelope is a P2-24 bound record: requestChangeEnvelope writes the draft and raises its approval (kind
 * "change-envelope"), activateChangeEnvelope signs it once that approval's quorum is met. At native session open,
 * admitSessionAtOpen runs P2-23's admitNativeSession with this module's envelopes as its ChangeEnvelopeLookup, then
 * checkChangeEnvelopeAtOpen compares the live manifest with the agent's newest envelope. Identical: allow. Every change
 * admitted by the envelope with passing evidence for its tests: allow, citing the envelope. Otherwise, in a regulated
 * workspace (an active compiled plan): block and record AGENT_REASSESSMENT_REQUIRED (which opens an incident); elsewhere
 * warn and record it. For an agent P2-23 governs, the same decision is a lifecycle reassessment, and a block suspends it.
 *
 * The manifest is P2-23's AgentVersionManifest, built once by nativeSessionManifest (src/lifecycle/versionManifest.ts).
 * An envelope pins the spec's five components (model, prompt, tool, policy, corpus); a deployment change (deployment id,
 * harness version, composition) is P2-23's bound-manifest trigger, not an envelope's.
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
import { canonicalize } from "../utils/json.js";
import { verifyHexDigestAny } from "../crypto/keys.js";
import { workspaceOversightPublicKeys } from "../incidents/oversightRecord.js";
import { assertPurposePublicationCurrent, capturePurposePublication } from "../keys/purposePublication.js";
import { signWithPurposeKey } from "../keys/purposeProviders.js";
import { recordEnvelopeReassessment, admitNativeSession, type ChangeEnvelopeLookup } from "../lifecycle/reassessment.js";
import type { LifecycleView } from "../lifecycle/governanceLifecycle.js";
import {
  agentVersionManifestSchema, diffManifests, manifestDigest, unpinnedComponents, type AgentVersionManifest, type ChangeKind
} from "../lifecycle/versionManifest.js";

const COMPONENTS = ["model", "prompt", "tool", "corpus", "policy"] as const;
type Component = (typeof COMPONENTS)[number];
const RULES = ["pinned", "digest_in_set", "provider_version_in_set"] as const;

const draftSchema = z.strictObject({
  v: z.literal(1), envelopeId: z.string().regex(/^env_[a-f0-9]{24}$/), agentId: z.string().min(1), baseline: agentVersionManifestSchema,
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

/** A per-call value no baseline or rule can hold: an unresolved component never compares equal (fail closed). */
const UNRESOLVED = (): string => `unresolved:${randomUUID()}`;

/** The value of one component as the envelope's rules compare it. */
function valueOf(manifest: AgentVersionManifest, component: Component): string {
  switch (component) {
    case "model": return `${manifest.model.providerId}/${manifest.model.model}@${manifest.model.providerReportedVersion ?? "unpinned"}`;
    case "prompt": return manifest.systemPromptSha256;
    case "tool": return manifest.toolsDigest ?? UNRESOLVED();
    case "policy": return sha256Hex(canonicalize({ planDigest: manifest.compiledPlanDigest, policyDigest: manifest.policyDigest }));
    case "corpus": return manifest.corpusDigests.length === 0 ? "none" : sha256Hex(canonicalize([...manifest.corpusDigests].sort()));
  }
}

function admits(entry: ChangeEnvelope["allowed"][number], live: AgentVersionManifest, baseline: AgentVersionManifest): boolean {
  switch (entry.rule) {
    case "pinned": return false; // A pinned component admits no change at all.
    case "digest_in_set": return entry.values.includes(valueOf(live, entry.component));
    case "provider_version_in_set":
      return entry.component === "model" && live.model.providerReportedVersion !== null && entry.values.includes(live.model.providerReportedVersion)
        && live.model.providerId === baseline.model.providerId && live.model.model === baseline.model.model;
  }
}

export interface EnvelopeDecision {
  outcome: "allow" | "allow_in_envelope" | "block" | "warn";
  envelopeId: string | null;
  changed: ChangeKind[];
  reasons: string[];
  /** A model with no provider-reported version: a claim downgrade, never a pass on its own. */
  unpinned: boolean;
}

/** Pure: the decision for one live manifest against one envelope (or none, or one that could not be verified). */
export function evaluateChangeEnvelope(p: {
  live: AgentVersionManifest; envelope: ChangeEnvelope | null; envelopeProblem: string | null; regulated: boolean; nowTs: number;
  /** Whether a verified result shows `testId` passing for this envelope against exactly this live manifest. */
  testPassed: (envelope: ChangeEnvelope, testId: string, live: AgentVersionManifest) => boolean;
}): EnvelopeDecision {
  const unpinned = unpinnedComponents(p.live).length > 0;
  const fail = (envelopeId: string | null, changed: ChangeKind[], reasons: string[]): EnvelopeDecision =>
    ({ outcome: p.regulated ? "block" : "warn", envelopeId, changed, reasons, unpinned });
  if (p.envelopeProblem !== null) return fail(null, [], [p.envelopeProblem]);
  if (p.envelope === null) return { outcome: "allow", envelopeId: null, changed: [], reasons: ["no change envelope: version pinning is not evaluated"], unpinned };
  const envelope = p.envelope;
  // P2-23's diff (a null or blank component counts as changed), limited to the components an envelope pins.
  const changed = diffManifests(envelope.baseline, p.live).filter((kind): kind is Component => (COMPONENTS as readonly string[]).includes(kind));
  if (p.nowTs > envelope.validUntil) return fail(envelope.envelopeId, changed, [`envelope ${envelope.envelopeId} expired at ${new Date(envelope.validUntil).toISOString()}`]);
  if (changed.length === 0) return { outcome: "allow", envelopeId: envelope.envelopeId, changed, reasons: ["identical to the envelope baseline"], unpinned };
  const reasons: string[] = [];
  for (const component of changed) {
    const entries = envelope.allowed.filter((entry) => entry.component === component && admits(entry, p.live, envelope.baseline));
    if (entries.length === 0) {
      reasons.push(`${component} changed to ${valueOf(p.live, component)}, outside envelope ${envelope.envelopeId}`);
      continue;
    }
    const covered = entries.some((entry) => entry.requiredTests.every((testId) => p.testPassed(envelope, testId, p.live)));
    if (!covered) reasons.push(`${component} change is inside envelope ${envelope.envelopeId} but its required tests have no passing evidence`);
  }
  if (reasons.length > 0) return fail(envelope.envelopeId, changed, reasons);
  return { outcome: "allow_in_envelope", envelopeId: envelope.envelopeId, changed, reasons: [`every change is inside envelope ${envelope.envelopeId} with passing tests`], unpinned };
}

/** The agent's newest verified envelope, or a problem when any envelope file fails verification (never silently skipped). */
export function activeChangeEnvelope(workspace: string, agentId: string): { envelope: ChangeEnvelope | null; problem: string | null } {
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

function activeChangeEnvelopeById(workspace: string, envelopeId: string): { envelope: ChangeEnvelope | null; problem: string | null } {
  const read = readSignedRecords(workspace, envelopeDir(workspace), "change-envelope", (raw) => envelopeSchema.parse(raw));
  const row = read.records.find((r) => r.record.envelopeId === envelopeId && r.file === `${envelopeId}.json`
    && approvalMatches(workspace, r.record.approval, "change-envelope", draftDigest(envelopeDraftOf(r.record))));
  return row ? { envelope: row.record, problem: null } : { envelope: null, problem: `no verified change envelope ${envelopeId}` };
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

const TEST_RESULT_AUDIT = "CHANGE_ENVELOPE_TEST_RESULT";
const testResultSchema = z.strictObject({
  schema: z.literal("amc.envelope-test-result/v1"), envelopeId: z.string().min(1), approvalDigest: z.string().min(1), manifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
  testId: z.string().min(1), passed: z.boolean(), recordedBy: z.string().min(1), recordedTs: z.number().int()
});
type EnvelopeTestResult = z.infer<typeof testResultSchema>;
const resultDigest = (result: EnvelopeTestResult) => sha256Hex(canonicalize(result));
/** The digest a test result binds: the exact manifest the test ran against (P2-23's manifestDigest, unprefixed). */
export const manifestSha256 = (manifest: AgentVersionManifest): string => manifestDigest(manifest).slice("sha256:".length);

/**
 * Records one required test's outcome for an envelope: bound to the envelope id, its approval's request digest and the
 * manifest tested, attributed to the authenticated session user (never the envelope's requester or the agent), and
 * signed with the workspace's artifact-seal key through the P2-08 async signer. Only such rows count as evidence.
 */
export async function recordEnvelopeTestResult(workspace: string, p: {
  sessionTokenFile: string; envelopeId: string; testId: string; passed: boolean; manifest: AgentVersionManifest;
}): Promise<EnvelopeTestResult> {
  const recorder = sessionPrincipal(workspace, p.sessionTokenFile);
  const { envelope, problem } = activeChangeEnvelopeById(workspace, p.envelopeId);
  if (envelope === null) throw new BoundRecordError("unknown_envelope", problem ?? `no verified change envelope ${p.envelopeId}`);
  if (recorder.userId === envelope.requestedBy || recorder.userId === envelope.agentId || recorder.username === envelope.agentId) {
    throw new BoundRecordError("self_attested", "a test result must come from someone other than the envelope's requester or the agent");
  }
  const result = testResultSchema.parse({ schema: "amc.envelope-test-result/v1", envelopeId: envelope.envelopeId,
    approvalDigest: envelope.approval.requestBindingDigest, manifestSha256: manifestSha256(p.manifest), testId: p.testId, passed: p.passed,
    recordedBy: recorder.userId, recordedTs: Date.now() });
  const captured = capturePurposePublication(workspace, "artifact-seal");
  const signed = await signWithPurposeKey(workspace, "artifact-seal", Buffer.from(resultDigest(result), "hex"));
  assertPurposePublicationCurrent(workspace, captured, signed);
  audit(workspace, TEST_RESULT_AUDIT, { result, signature: signed.signature.toString("base64"), claimKind: "self_reported" });
  return result;
}

/**
 * Verified results only: rows whose parsed auditType is exactly the test-result type, whose record parses and whose
 * signature verifies against the workspace's artifact-seal key history. The newest such result per (envelope, approval,
 * manifest, test) decides; a result by the envelope's requester or its agent never counts; anything else is no evidence.
 */
export function ledgerTestPassed(workspace: string): (envelope: ChangeEnvelope, testId: string, live: AgentVersionManifest) => boolean {
  const ledger = openLedger(workspace, { readonly: true });
  let rows: Array<{ meta_json: string }>;
  try {
    rows = ledger.db.prepare("SELECT meta_json FROM evidence_events WHERE event_type = 'audit' ORDER BY ts, rowid").all() as Array<{ meta_json: string }>;
  } finally {
    ledger.close();
  }
  let keys: string[];
  try { keys = workspaceOversightPublicKeys(workspace); } catch { return () => false; }
  const latest = new Map<string, EnvelopeTestResult>();
  for (const row of rows) {
    let meta: Record<string, unknown>;
    try { meta = JSON.parse(row.meta_json) as Record<string, unknown>; } catch { continue; }
    if (meta.auditType !== TEST_RESULT_AUDIT || typeof meta.signature !== "string") continue;
    const parsed = testResultSchema.safeParse(meta.result);
    if (!parsed.success || !verifyHexDigestAny(resultDigest(parsed.data), meta.signature, keys)) continue;
    const r = parsed.data;
    latest.set(`${r.envelopeId}\0${r.approvalDigest}\0${r.manifestSha256}\0${r.testId}`, r);
  }
  return (envelope, testId, live) => {
    const r = latest.get(`${envelope.envelopeId}\0${envelope.approval.requestBindingDigest}\0${manifestSha256(live)}\0${testId}`);
    return r !== undefined && r.passed && r.recordedBy !== envelope.requestedBy && r.recordedBy !== envelope.agentId;
  };
}

export class ChangeEnvelopeBlocked extends Error {
  readonly code = "CHANGE_ENVELOPE_BLOCKED" as const;
  constructor(readonly decision: EnvelopeDecision) {
    super(`change_envelope_blocked: ${decision.reasons.join("; ")}. A reassessment is required before this agent runs again.`);
    this.name = "ChangeEnvelopeBlocked";
  }
}

/**
 * The envelope check at session open. With no envelope directory there is nothing to compare and nothing is read. A
 * blocked session throws before its first turn; a warning or an in-envelope change is recorded in the ledger, and an
 * agent P2-23 governs gets the matching reassessment (suspended on a block). `decision` is the one admitSessionAtOpen
 * already made for the same manifest, so the envelope is read and its evidence weighed once per session open.
 */
export function checkChangeEnvelopeAtOpen(p: { workspace: string; agentId: string; live: AgentVersionManifest; nowTs?: number; decision?: EnvelopeDecision }): EnvelopeDecision {
  const decision = p.decision ?? decideChangeEnvelope(p.workspace, p.agentId, p.live, p.nowTs ?? Date.now());
  const meta = { agentId: p.agentId, envelopeId: decision.envelopeId, changed: decision.changed, reasons: decision.reasons, unpinned: decision.unpinned,
    liveManifestSha256: manifestSha256(p.live) };
  if (decision.outcome === "block" || decision.outcome === "warn") {
    audit(p.workspace, "AGENT_REASSESSMENT_REQUIRED", { ...meta, outcome: decision.outcome });
    recordEnvelopeReassessment(p.workspace, { agentId: p.agentId, manifest: p.live, changed: decision.changed, envelopeId: decision.envelopeId,
      reasons: decision.reasons, block: decision.outcome === "block" });
  }
  if (decision.outcome === "allow_in_envelope") audit(p.workspace, "CHANGE_ENVELOPE_APPLIED", meta);
  if (decision.outcome === "block") throw new ChangeEnvelopeBlocked(decision);
  return decision;
}

function decideChangeEnvelope(workspace: string, agentId: string, live: AgentVersionManifest, nowTs: number): EnvelopeDecision {
  if (!existsSync(envelopeDir(workspace))) return evaluateChangeEnvelope({ live, envelope: null, envelopeProblem: null, regulated: false, nowTs, testPassed: () => false });
  const { envelope, problem } = activeChangeEnvelope(workspace, agentId);
  let regulated: boolean;
  try { regulated = loadActiveCompiledPolicy(workspace) !== null; } catch { regulated = true; } // An unreadable plan cannot prove the workspace unregulated.
  return evaluateChangeEnvelope({ live, envelope, envelopeProblem: problem, regulated, nowTs, testPassed: ledgerTestPassed(workspace) });
}

/**
 * Native session open (src/agent/agentSession.ts, src/kernel/agentLoopRunner.ts): P2-23's admission, whose invalidated_by
 * trigger asks this module whether an envelope covers the change, then the envelope check itself. The manifest is built
 * once, and only when one of them needs it: never for a retired agent, nor for an ungoverned one in a workspace without
 * envelopes. An envelope covers a change when the live manifest is its approved baseline or every change is inside it
 * with passing tests, and only when every kind that changed from the bound manifest is one the envelope pins.
 */
export function admitSessionAtOpen(p: { workspace: string; agentId: string; manifest: () => AgentVersionManifest; now?: number }): LifecycleView {
  const nowTs = p.now ?? Date.now();
  let live: AgentVersionManifest | undefined;
  const manifest = (): AgentVersionManifest => (live ??= p.manifest());
  let decision: EnvelopeDecision | undefined;
  const decide = (): EnvelopeDecision => (decision ??= decideChangeEnvelope(p.workspace, p.agentId, manifest(), nowTs));
  const hasEnvelopes = existsSync(envelopeDir(p.workspace));
  const covers: ChangeEnvelopeLookup = ({ changed }) => {
    // Covered only when the envelope pins every kind that changed: a deployment change, or any kind it does not pin, is
    // never pre-approved by it, however the rest of the decision went.
    if (!hasEnvelopes || !changed.every((kind) => (COMPONENTS as readonly string[]).includes(kind))) return null;
    const d = decide();
    return (d.outcome === "allow" || d.outcome === "allow_in_envelope") && d.envelopeId !== null ? { envelopeId: d.envelopeId } : null;
  };
  const view = admitNativeSession({ workspace: p.workspace, agentId: p.agentId, manifest, now: nowTs, envelope: covers });
  if (hasEnvelopes) checkChangeEnvelopeAtOpen({ workspace: p.workspace, agentId: p.agentId, live: manifest(), nowTs, decision: decide() });
  return view;
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
  if (input.baseline.agentId !== input.agentId) throw new BoundRecordError("invalid_baseline", `the baseline manifest names agent ${input.baseline.agentId}, not ${input.agentId}`);
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
