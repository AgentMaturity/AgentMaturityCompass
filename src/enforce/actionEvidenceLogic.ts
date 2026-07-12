import { randomUUID } from "node:crypto";
import { lstatSync, readFileSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { ACTION_CLASSES } from "../governor/actionCatalog.js";
import {
  actionPolicyPath,
  actionPolicySigPath,
  actionPolicyWriterPendingPath,
  ACTION_POLICY_WRITER_LOCK,
  loadActionPolicy,
  signActionPolicyWithLockHeld,
  verifyActionPolicySignature,
} from "../governor/actionPolicyEngine.js";
import { actionPolicySchema, type ActionPolicy, type ActionPolicyRule } from "../governor/actionPolicySchema.js";
import {
  canonicalizePolicyEvidenceLogic,
  defaultPolicyEvidenceLogicForRule,
  POLICY_EVIDENCE_LOGIC_MAX_GATES,
  policyEvidenceGateEntriesForRule,
  policyEvidenceGateIdsForRule,
  policyEvidenceLogicSemanticHash,
  policyEvidenceLogicSchema,
  validatePolicyEvidenceLogicForRule,
  type PolicyEvidenceLogic,
  type PolicyEvidenceLogicValidation,
} from "../governor/policyEvidenceLogic.js";
import { openLedger } from "../ledger/ledger.js";
import { ControlFileLockError, withControlFileLock } from "../lifecycle/controlFileLock.js";
import { appendTransparencyEntry, readTransparencyEntries } from "../transparency/logChain.js";
import type { ActionClass } from "../types.js";
import { pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export const ACTION_EVIDENCE_LOGIC_SCHEMA_VERSION = "2026-07-11" as const;

const actionClassSchema = z.enum(ACTION_CLASSES as [ActionClass, ...ActionClass[]]);

export const actionEvidenceLogicCompileRequestSchema = z.object({
  actionClass: actionClassSchema,
  logic: policyEvidenceLogicSchema,
}).strict();

export const actionEvidenceLogicApplyRequestSchema = actionEvidenceLogicCompileRequestSchema.extend({
  confirmCompileId: z.string().regex(/^action-logic-compile-[a-f0-9]{16}$/),
  acknowledgeAlternatives: z.boolean().default(false),
}).strict();

export type ActionEvidenceLogicErrorCode =
  | "ACTION_RULE_MISSING"
  | "BASELINE_UNTRUSTED"
  | "POLICY_SCHEMA_INVALID"
  | "POLICY_DUPLICATE_ACTION"
  | "LOGIC_INVALID"
  | "NO_EVIDENCE_GATES"
  | "CONFIRMATION_REQUIRED"
  | "ALTERNATIVE_ACK_REQUIRED"
  | "STATE_CHANGED"
  | "LOCK_BUSY"
  | "APPLY_FAILED";

export class ActionEvidenceLogicError extends Error {
  constructor(readonly code: ActionEvidenceLogicErrorCode, message: string) {
    super(message);
    this.name = "ActionEvidenceLogicError";
  }
}

export function isActionEvidenceLogicError(value: unknown): value is ActionEvidenceLogicError {
  return value instanceof ActionEvidenceLogicError;
}

export interface ActionEvidenceGate {
  gateId: string;
  family: "maturity" | "assurance";
  label: string;
}

export interface ActionEvidenceLogicInspection {
  schemaVersion: typeof ACTION_EVIDENCE_LOGIC_SCHEMA_VERSION;
  actionClass: ActionClass;
  configured: boolean;
  gateCount: number;
  gates: ActionEvidenceGate[];
  effectiveLogic: PolicyEvidenceLogic | null;
  effectiveLogicSha256: string;
  hasAlternatives: boolean;
  mandatoryGates: string[];
  baseline: { actionPolicySha256: string };
}

export interface ActionEvidenceLogicCompilation {
  schemaVersion: typeof ACTION_EVIDENCE_LOGIC_SCHEMA_VERSION;
  compileId: string;
  actionClass: ActionClass;
  status: "ready" | "no_changes";
  canApply: boolean;
  hasAlternatives: boolean;
  requiresAlternativeAcknowledgement: boolean;
  gateCount: number;
  gates: ActionEvidenceGate[];
  mandatoryGates: string[];
  baseline: { actionPolicySha256: string };
  candidate: { actionPolicySha256: string };
  logic: {
    configuredBefore: boolean;
    current: PolicyEvidenceLogic | null;
    candidate: PolicyEvidenceLogic | null;
    currentSha256: string;
    candidateSha256: string;
  };
}

export interface ActionEvidenceLogicApplyResult {
  schemaVersion: typeof ACTION_EVIDENCE_LOGIC_SCHEMA_VERSION;
  applied: boolean;
  reason: "NO_CHANGES" | null;
  compileId: string;
  compilation: ActionEvidenceLogicCompilation;
  transparencyHash: string | null;
  auditEventId: string | null;
}

interface TrustedActionPolicyBaseline {
  policy: ActionPolicy;
  policyBytes: Buffer;
  signatureBytes: Buffer;
  actionPolicySha256: string;
}

interface CompiledActionEvidenceLogic {
  public: ActionEvidenceLogicCompilation;
  candidatePolicy: ActionPolicy;
  candidateBytes: Buffer;
  baseline: TrustedActionPolicyBaseline;
}

const MANDATORY_GATES = Object.freeze([
  "policy-signature",
  "trusted-config",
  "trust-tier",
  "sandbox",
  "execution-ticket",
  "budget",
  "incident-freeze",
  "work-order-scope",
  "allow-execute",
]);

const pendingMutationSchema = z.object({
  version: z.literal(1),
  operation: z.literal("action-policy-evidence-logic"),
  phase: z.enum(["PREPARED", "POLICY_APPLIED", "TRANSPARENCY_WRITTEN", "EVIDENCE_COMPLETE"]),
  compileId: z.string().regex(/^action-logic-compile-[a-f0-9]{16}$/),
  actionClass: actionClassSchema,
  gateCount: z.number().int().min(1).max(POLICY_EVIDENCE_LOGIC_MAX_GATES),
  hasAlternatives: z.boolean(),
  logicSha256: z.string().regex(/^[a-f0-9]{64}$/),
  artifactSha256: z.string().regex(/^[a-f0-9]{64}$/),
  baselinePolicySha256: z.string().regex(/^[a-f0-9]{64}$/),
  candidatePolicySha256: z.string().regex(/^[a-f0-9]{64}$/),
  baselinePolicyBase64: z.string().min(1),
  baselineSignatureBase64: z.string().min(1),
}).strict();

type PendingMutation = z.infer<typeof pendingMutationSchema>;

function pendingMutationPath(workspace: string): string {
  return actionPolicyWriterPendingPath(workspace);
}

function writePendingMutation(workspace: string, pending: PendingMutation): void {
  writeFileAtomic(pendingMutationPath(workspace), `${JSON.stringify(pending)}\n`, 0o600);
}

function removePendingMutation(workspace: string): void {
  const path = pendingMutationPath(workspace);
  if (pathExists(path)) unlinkSync(path);
}

function pendingMutationExists(workspace: string): boolean {
  return pathExists(pendingMutationPath(workspace));
}

function boundedError(code: ActionEvidenceLogicErrorCode): ActionEvidenceLogicError {
  const messages: Record<ActionEvidenceLogicErrorCode, string> = {
    ACTION_RULE_MISSING: "The selected Action Policy rule does not exist.",
    BASELINE_UNTRUSTED: "The current Action Policy baseline is not trusted.",
    POLICY_SCHEMA_INVALID: "The Action Policy does not match the existing AMC schema.",
    POLICY_DUPLICATE_ACTION: "The Action Policy contains duplicate action classes.",
    LOGIC_INVALID: "The evidence logic is not valid for the selected Action Policy rule.",
    NO_EVIDENCE_GATES: "The selected Action Policy rule declares no maturity or assurance gates.",
    CONFIRMATION_REQUIRED: "Exact current compile ID confirmation is required.",
    ALTERNATIVE_ACK_REQUIRED: "Explicit acknowledgement is required before applying alternative evidence paths.",
    STATE_CHANGED: "Action Policy state changed during inspection; retry from a fresh preview.",
    LOCK_BUSY: "Another Action Policy writer is in progress; retry later.",
    APPLY_FAILED: "Evidence-logic apply failed; prior Action Policy bytes were restored or a recovery journal was retained.",
  };
  return new ActionEvidenceLogicError(code, messages[code]);
}

function rejectSymlink(path: string): void {
  if (!pathExists(path) || lstatSync(path).isSymbolicLink()) throw boundedError("BASELINE_UNTRUSTED");
}

function assertUniqueActionRules(policy: ActionPolicy): void {
  const seen = new Set<ActionClass>();
  for (const rule of policy.actions) {
    if (seen.has(rule.actionClass)) throw boundedError("POLICY_DUPLICATE_ACTION");
    seen.add(rule.actionClass);
  }
}

function readTrustedBaseline(workspace: string): TrustedActionPolicyBaseline {
  if (pendingMutationExists(workspace)) throw boundedError("STATE_CHANGED");
  const policyPath = actionPolicyPath(workspace);
  const signaturePath = actionPolicySigPath(workspace);
  rejectSymlink(policyPath);
  rejectSymlink(signaturePath);

  const firstPolicy = readFileSync(policyPath);
  const firstSignature = readFileSync(signaturePath);
  const verification = verifyActionPolicySignature(workspace);
  if (!verification.valid) throw boundedError("BASELINE_UNTRUSTED");
  const secondPolicy = readFileSync(policyPath);
  const secondSignature = readFileSync(signaturePath);
  if (!firstPolicy.equals(secondPolicy) || !firstSignature.equals(secondSignature)) {
    throw boundedError("STATE_CHANGED");
  }

  try {
    const policy = actionPolicySchema.parse(YAML.parse(firstPolicy.toString("utf8")) as unknown);
    assertUniqueActionRules(policy);
    return {
      policy,
      policyBytes: firstPolicy,
      signatureBytes: firstSignature,
      actionPolicySha256: sha256Hex(firstPolicy),
    };
  } catch (error) {
    if (error instanceof ActionEvidenceLogicError) throw error;
    throw boundedError("POLICY_SCHEMA_INVALID");
  }
}

function actionRule(policy: ActionPolicy, actionClass: ActionClass): ActionPolicyRule {
  const rule = policy.actions.find((candidate) => candidate.actionClass === actionClass);
  if (!rule) throw boundedError("ACTION_RULE_MISSING");
  return rule;
}

function gateCatalog(rule: ActionPolicyRule): ActionEvidenceGate[] {
  return policyEvidenceGateEntriesForRule(rule).map((entry): ActionEvidenceGate => {
    if (entry.family === "maturity") {
      const questionId = entry.requirementId;
      return {
        gateId: entry.gateId,
        family: "maturity",
        label: `${questionId} effective maturity at least L${rule.minEffectiveQuestionLevels[questionId]}`,
      };
    }
    const packId = entry.requirementId;
    const requirement = rule.requireAssurancePacks[packId]!;
    return {
      gateId: entry.gateId,
      family: "assurance",
      label: `${packId} score at least ${requirement.minScore}; succeeded attacks at most ${requirement.maxSucceeded}`,
    };
  });
}

function logicSha256(logic: PolicyEvidenceLogic | null): string {
  return sha256Hex(canonicalize(logic));
}

function inspectFromBaseline(
  baseline: TrustedActionPolicyBaseline,
  actionClass: ActionClass,
): ActionEvidenceLogicInspection {
  const rule = actionRule(baseline.policy, actionClass);
  const gates = gateCatalog(rule);
  if (gates.length > POLICY_EVIDENCE_LOGIC_MAX_GATES) throw boundedError("LOGIC_INVALID");
  const effectiveLogic = rule.evidenceLogic
    ? canonicalizePolicyEvidenceLogic(rule.evidenceLogic)
    : defaultPolicyEvidenceLogicForRule(rule);
  const hasAlternatives = rule.evidenceLogic
    ? validatePolicyEvidenceLogicForRule(rule.evidenceLogic, rule).hasAlternatives
    : false;
  return {
    schemaVersion: ACTION_EVIDENCE_LOGIC_SCHEMA_VERSION,
    actionClass,
    configured: rule.evidenceLogic !== undefined,
    gateCount: gates.length,
    gates,
    effectiveLogic,
    effectiveLogicSha256: logicSha256(effectiveLogic),
    hasAlternatives,
    mandatoryGates: [...MANDATORY_GATES],
    baseline: { actionPolicySha256: baseline.actionPolicySha256 },
  };
}

export function inspectActionEvidenceLogic(input: {
  workspace: string;
  actionClass: string;
}): ActionEvidenceLogicInspection {
  const parsedActionClass = actionClassSchema.safeParse(input.actionClass);
  if (!parsedActionClass.success) throw boundedError("ACTION_RULE_MISSING");
  const workspace = resolve(input.workspace);
  return inspectFromBaseline(readTrustedBaseline(workspace), parsedActionClass.data);
}

function validationForRule(logic: PolicyEvidenceLogic, rule: ActionPolicyRule): PolicyEvidenceLogicValidation {
  const gateCount = policyEvidenceGateIdsForRule(rule).length;
  if (gateCount === 0) throw boundedError("NO_EVIDENCE_GATES");
  if (gateCount > POLICY_EVIDENCE_LOGIC_MAX_GATES) throw boundedError("LOGIC_INVALID");
  try {
    return validatePolicyEvidenceLogicForRule(logic, rule);
  } catch {
    throw boundedError("LOGIC_INVALID");
  }
}

function compileInternal(input: {
  workspace: string;
  actionClass: ActionClass;
  logic: PolicyEvidenceLogic;
}): CompiledActionEvidenceLogic {
  const baseline = readTrustedBaseline(input.workspace);
  const rule = actionRule(baseline.policy, input.actionClass);
  const validation = validationForRule(input.logic, rule);
  const defaultLogic = defaultPolicyEvidenceLogicForRule(rule);
  const currentLogic = rule.evidenceLogic
    ? canonicalizePolicyEvidenceLogic(rule.evidenceLogic)
    : defaultLogic;
  const semanticNoOp = currentLogic !== null
    && policyEvidenceLogicSemanticHash(currentLogic) === policyEvidenceLogicSemanticHash(validation.logic);
  const candidateShouldBeImplicit = !validation.hasAlternatives;

  let parsedCandidate: ActionPolicy;
  let candidateBytes: Buffer;
  if (semanticNoOp) {
    parsedCandidate = baseline.policy;
    candidateBytes = baseline.policyBytes;
  } else {
    try {
      const actionIndex = baseline.policy.actions.findIndex((candidate) => candidate.actionClass === input.actionClass);
      if (actionIndex < 0) throw boundedError("ACTION_RULE_MISSING");
      const document = YAML.parseDocument(baseline.policyBytes.toString("utf8"));
      if (document.errors.length > 0) throw new Error("Action Policy YAML document is invalid.");
      const logicPath = ["actions", actionIndex, "evidenceLogic"];
      if (candidateShouldBeImplicit) document.deleteIn(logicPath);
      else document.setIn(logicPath, validation.logic);
      candidateBytes = Buffer.from(document.toString(), "utf8");
      parsedCandidate = actionPolicySchema.parse(YAML.parse(candidateBytes.toString("utf8")) as unknown);
      assertUniqueActionRules(parsedCandidate);
    } catch (error) {
      if (error instanceof ActionEvidenceLogicError) throw error;
      throw boundedError("POLICY_SCHEMA_INVALID");
    }
  }
  const candidateSha256 = sha256Hex(candidateBytes);
  const changed = candidateSha256 !== baseline.actionPolicySha256;
  const candidateRule = actionRule(parsedCandidate, input.actionClass);
  const candidateLogic = candidateRule.evidenceLogic
    ? canonicalizePolicyEvidenceLogic(candidateRule.evidenceLogic)
    : defaultLogic;
  const compileHash = sha256Hex(canonicalize({
    schemaVersion: ACTION_EVIDENCE_LOGIC_SCHEMA_VERSION,
    actionClass: input.actionClass,
    baselineActionPolicySha256: baseline.actionPolicySha256,
    candidateActionPolicySha256: candidateSha256,
    candidateLogicSha256: logicSha256(candidateLogic),
  }));
  const publicCompilation: ActionEvidenceLogicCompilation = {
    schemaVersion: ACTION_EVIDENCE_LOGIC_SCHEMA_VERSION,
    compileId: `action-logic-compile-${compileHash.slice(0, 16)}`,
    actionClass: input.actionClass,
    status: changed ? "ready" : "no_changes",
    canApply: changed,
    hasAlternatives: validation.hasAlternatives,
    requiresAlternativeAcknowledgement: changed && validation.hasAlternatives,
    gateCount: validation.gateCount,
    gates: gateCatalog(rule),
    mandatoryGates: [...MANDATORY_GATES],
    baseline: { actionPolicySha256: baseline.actionPolicySha256 },
    candidate: { actionPolicySha256: candidateSha256 },
    logic: {
      configuredBefore: rule.evidenceLogic !== undefined,
      current: currentLogic,
      candidate: candidateLogic,
      currentSha256: logicSha256(currentLogic),
      candidateSha256: logicSha256(candidateLogic),
    },
  };
  return { public: publicCompilation, candidatePolicy: parsedCandidate, candidateBytes, baseline };
}

export function compileActionEvidenceLogic(input: {
  workspace: string;
  actionClass: string;
  logic: unknown;
}): ActionEvidenceLogicCompilation {
  const parsed = actionEvidenceLogicCompileRequestSchema.safeParse({
    actionClass: input.actionClass,
    logic: input.logic,
  });
  if (!parsed.success) throw boundedError("LOGIC_INVALID");
  return compileInternal({ workspace: resolve(input.workspace), ...parsed.data }).public;
}

function restoreBaseline(workspace: string, baseline: TrustedActionPolicyBaseline): void {
  writeFileAtomic(actionPolicyPath(workspace), baseline.policyBytes, 0o644);
  writeFileAtomic(actionPolicySigPath(workspace), baseline.signatureBytes, 0o644);
}

function assertBaselineCurrent(workspace: string, baseline: TrustedActionPolicyBaseline): void {
  const policyPath = actionPolicyPath(workspace);
  const signaturePath = actionPolicySigPath(workspace);
  rejectSymlink(policyPath);
  rejectSymlink(signaturePath);
  if (
    !readFileSync(policyPath).equals(baseline.policyBytes)
    || !readFileSync(signaturePath).equals(baseline.signatureBytes)
  ) throw boundedError("STATE_CHANGED");
}

function pendingMutationFor(
  compiled: CompiledActionEvidenceLogic,
  artifactSha256: string,
): PendingMutation {
  return pendingMutationSchema.parse({
    version: 1,
    operation: "action-policy-evidence-logic",
    phase: "PREPARED",
    compileId: compiled.public.compileId,
    actionClass: compiled.public.actionClass,
    gateCount: compiled.public.gateCount,
    hasAlternatives: compiled.public.hasAlternatives,
    logicSha256: compiled.public.logic.candidateSha256,
    artifactSha256,
    baselinePolicySha256: compiled.public.baseline.actionPolicySha256,
    candidatePolicySha256: compiled.public.candidate.actionPolicySha256,
    baselinePolicyBase64: compiled.baseline.policyBytes.toString("base64"),
    baselineSignatureBase64: compiled.baseline.signatureBytes.toString("base64"),
  });
}

function restorePendingBaseline(workspace: string, pending: PendingMutation): void {
  const baseline: TrustedActionPolicyBaseline = {
    policy: actionPolicySchema.parse(YAML.parse(Buffer.from(pending.baselinePolicyBase64, "base64").toString("utf8")) as unknown),
    policyBytes: Buffer.from(pending.baselinePolicyBase64, "base64"),
    signatureBytes: Buffer.from(pending.baselineSignatureBase64, "base64"),
    actionPolicySha256: pending.baselinePolicySha256,
  };
  if (sha256Hex(baseline.policyBytes) !== pending.baselinePolicySha256) throw boundedError("STATE_CHANGED");
  restoreBaseline(workspace, baseline);
  if (
    !readFileSync(actionPolicyPath(workspace)).equals(baseline.policyBytes)
    || !readFileSync(actionPolicySigPath(workspace)).equals(baseline.signatureBytes)
    || !verifyActionPolicySignature(workspace).valid
  ) throw boundedError("APPLY_FAILED");
}

function verifyCandidate(workspace: string, compiled: CompiledActionEvidenceLogic): void {
  const policyPath = actionPolicyPath(workspace);
  const signaturePath = actionPolicySigPath(workspace);
  rejectSymlink(policyPath);
  rejectSymlink(signaturePath);
  const firstPolicy = readFileSync(policyPath);
  if (!firstPolicy.equals(compiled.candidateBytes)) throw new Error("candidate bytes differ");
  loadActionPolicy(workspace);
  if (!verifyActionPolicySignature(workspace).valid) throw new Error("candidate signature invalid");
  if (!readFileSync(policyPath).equals(firstPolicy)) throw new Error("candidate state changed");
}

function writeAuditPayload(
  workspace: string,
  payload: Record<string, unknown> & { auditType: string; severity: string; agentId: string },
): string {
  const ledger = openLedger(workspace);
  const sessionId = `action-evidence-logic-${randomUUID()}`;
  const body = JSON.stringify(payload);
  const bodySha256 = sha256Hex(Buffer.from(body, "utf8"));
  try {
    ledger.startSession({
      sessionId,
      runtime: "unknown",
      binaryPath: "amc-policy-action-logic",
      binarySha256: "amc-policy-action-logic",
    });
    const event = ledger.appendEvidenceWithReceipt({
      sessionId,
      runtime: "unknown",
      eventType: "audit",
      payload: body,
      payloadExt: "json",
      inline: true,
      meta: { ...payload, trustTier: "OBSERVED", bodySha256 },
      receipt: { kind: "guard_check", agentId: "system", providerId: "unknown", model: null, bodySha256 },
    });
    ledger.sealSession(sessionId);
    return event.id;
  } finally {
    ledger.close();
  }
}

function writeAudit(workspace: string, compilation: ActionEvidenceLogicCompilation): string {
  return writeAuditPayload(workspace, {
    auditType: "ACTION_POLICY_EVIDENCE_LOGIC_APPLIED",
    severity: "MEDIUM",
    agentId: "system",
    actionClass: compilation.actionClass,
    compileId: compilation.compileId,
    gateCount: compilation.gateCount,
    hasAlternatives: compilation.hasAlternatives,
    logicSha256: compilation.logic.candidateSha256,
    baseline: compilation.baseline,
    candidate: compilation.candidate,
  });
}

function writeRollbackAudit(workspace: string, pending: PendingMutation): string | null {
  try {
    const ledger = openLedger(workspace);
    try {
      const existing = ledger.db.prepare(
        "SELECT id FROM evidence_events WHERE event_type = 'audit' AND meta_json LIKE ? AND meta_json LIKE ? ORDER BY rowid DESC LIMIT 1",
      ).get(
        `%\"auditType\":\"ACTION_POLICY_EVIDENCE_LOGIC_ROLLED_BACK\"%`,
        `%\"compileId\":\"${pending.compileId}\"%`,
      ) as { id: string } | undefined;
      if (existing) return existing.id;
    } finally {
      ledger.close();
    }
    return writeAuditPayload(workspace, {
      auditType: "ACTION_POLICY_EVIDENCE_LOGIC_ROLLED_BACK",
      severity: "HIGH",
      agentId: "system",
      actionClass: pending.actionClass,
      compileId: pending.compileId,
      gateCount: pending.gateCount,
      hasAlternatives: pending.hasAlternatives,
      logicSha256: pending.logicSha256,
      baseline: { actionPolicySha256: pending.baselinePolicySha256 },
      candidate: { actionPolicySha256: pending.candidatePolicySha256 },
    });
  } catch {
    return null;
  }
}

function appendRollbackTransparency(workspace: string, pending: PendingMutation): boolean {
  try {
    const entries = readTransparencyEntries(workspace);
    const applied = entries.some((entry) => (
      entry.type === "ACTION_POLICY_EVIDENCE_LOGIC_APPLIED"
      && entry.artifact.id === pending.compileId
    ));
    const rolledBack = entries.some((entry) => (
      entry.type === "ACTION_POLICY_EVIDENCE_LOGIC_ROLLED_BACK"
      && entry.artifact.id === pending.compileId
    ));
    if (!applied || rolledBack) return true;
    appendTransparencyEntry({
      workspace,
      type: "ACTION_POLICY_EVIDENCE_LOGIC_ROLLED_BACK",
      agentId: "system",
      artifact: { kind: "policy", sha256: pending.artifactSha256, id: pending.compileId },
    });
    return true;
  } catch {
    // Recovery remains fail-closed on policy state even if a damaged evidence store cannot accept compensation.
    return false;
  }
}

function finalizeRollbackEvidence(workspace: string, pending: PendingMutation): boolean {
  const transparencyComplete = appendRollbackTransparency(workspace, pending);
  const auditComplete = writeRollbackAudit(workspace, pending) !== null;
  return transparencyComplete && auditComplete;
}

function recoverPendingMutation(workspace: string): void {
  const path = pendingMutationPath(workspace);
  if (!pathExists(path)) return;
  if (lstatSync(path).isSymbolicLink()) throw boundedError("STATE_CHANGED");
  let pending: PendingMutation;
  try {
    pending = pendingMutationSchema.parse(JSON.parse(readFileSync(path, "utf8")) as unknown);
  } catch {
    throw boundedError("STATE_CHANGED");
  }

  rejectSymlink(actionPolicyPath(workspace));
  rejectSymlink(actionPolicySigPath(workspace));
  const currentPolicySha256 = sha256Hex(readFileSync(actionPolicyPath(workspace)));
  const baselineSignature = Buffer.from(pending.baselineSignatureBase64, "base64");
  const currentSignature = readFileSync(actionPolicySigPath(workspace));
  const baselineIsCurrent = currentPolicySha256 === pending.baselinePolicySha256
    && currentSignature.equals(baselineSignature);
  const candidateIsCurrent = currentPolicySha256 === pending.candidatePolicySha256;
  if (!baselineIsCurrent && !candidateIsCurrent) throw boundedError("STATE_CHANGED");

  if (pending.phase === "EVIDENCE_COMPLETE" && candidateIsCurrent && verifyActionPolicySignature(workspace).valid) {
    removePendingMutation(workspace);
    return;
  }
  if (!baselineIsCurrent) restorePendingBaseline(workspace, pending);
  if (finalizeRollbackEvidence(workspace, pending)) removePendingMutation(workspace);
}

function applyLocked(input: {
  workspace: string;
  actionClass: ActionClass;
  logic: PolicyEvidenceLogic;
  confirmCompileId: string;
  acknowledgeAlternatives: boolean;
}): ActionEvidenceLogicApplyResult {
  recoverPendingMutation(input.workspace);
  const compiled = compileInternal(input);
  if (compiled.public.compileId !== input.confirmCompileId) throw boundedError("CONFIRMATION_REQUIRED");
  if (!compiled.public.canApply) {
    return {
      schemaVersion: ACTION_EVIDENCE_LOGIC_SCHEMA_VERSION,
      applied: false,
      reason: "NO_CHANGES",
      compileId: compiled.public.compileId,
      compilation: compiled.public,
      transparencyHash: null,
      auditEventId: null,
    };
  }
  if (compiled.public.hasAlternatives && !input.acknowledgeAlternatives) {
    throw boundedError("ALTERNATIVE_ACK_REQUIRED");
  }

  const artifactSha256 = sha256Hex(canonicalize({
    compileId: compiled.public.compileId,
    candidate: compiled.public.candidate,
    logicSha256: compiled.public.logic.candidateSha256,
  }));
  const pending = pendingMutationFor(compiled, artifactSha256);
  writePendingMutation(input.workspace, pending);
  let policyWriteStarted = false;
  try {
    assertBaselineCurrent(input.workspace, compiled.baseline);
    policyWriteStarted = true;
    writeFileAtomic(actionPolicyPath(input.workspace), compiled.candidateBytes, 0o644);
    signActionPolicyWithLockHeld(input.workspace);
    verifyCandidate(input.workspace, compiled);
    pending.phase = "POLICY_APPLIED";
    writePendingMutation(input.workspace, pending);

    const transparency = appendTransparencyEntry({
      workspace: input.workspace,
      type: "ACTION_POLICY_EVIDENCE_LOGIC_APPLIED",
      agentId: "system",
      artifact: { kind: "policy", sha256: artifactSha256, id: compiled.public.compileId },
    });
    pending.phase = "TRANSPARENCY_WRITTEN";
    writePendingMutation(input.workspace, pending);
    const auditEventId = writeAudit(input.workspace, compiled.public);
    pending.phase = "EVIDENCE_COMPLETE";
    writePendingMutation(input.workspace, pending);
    removePendingMutation(input.workspace);
    return {
      schemaVersion: ACTION_EVIDENCE_LOGIC_SCHEMA_VERSION,
      applied: true,
      reason: null,
      compileId: compiled.public.compileId,
      compilation: compiled.public,
      transparencyHash: transparency.hash,
      auditEventId,
    };
  } catch (error) {
    if (!policyWriteStarted) {
      removePendingMutation(input.workspace);
      if (error instanceof ActionEvidenceLogicError) throw error;
      throw boundedError("APPLY_FAILED");
    }
    try {
      restoreBaseline(input.workspace, compiled.baseline);
      if (
        !readFileSync(actionPolicyPath(input.workspace)).equals(compiled.baseline.policyBytes)
        || !readFileSync(actionPolicySigPath(input.workspace)).equals(compiled.baseline.signatureBytes)
        || !verifyActionPolicySignature(input.workspace).valid
      ) throw new Error("baseline restore verification failed");
      if (finalizeRollbackEvidence(input.workspace, pending)) removePendingMutation(input.workspace);
    } catch {
      // Keep the journal for authenticated recovery on the next apply attempt.
    }
    throw boundedError("APPLY_FAILED");
  }
}

export function applyActionEvidenceLogic(input: {
  workspace: string;
  actionClass: string;
  logic: unknown;
  confirmCompileId: string;
  acknowledgeAlternatives?: boolean;
}): ActionEvidenceLogicApplyResult {
  const parsed = actionEvidenceLogicApplyRequestSchema.safeParse({
    actionClass: input.actionClass,
    logic: input.logic,
    confirmCompileId: input.confirmCompileId,
    acknowledgeAlternatives: input.acknowledgeAlternatives ?? false,
  });
  if (!parsed.success) throw boundedError("LOGIC_INVALID");
  const workspace = resolve(input.workspace);
  try {
    return withControlFileLock({
      root: dirname(actionPolicyPath(workspace)),
      name: ACTION_POLICY_WRITER_LOCK,
      timeoutMs: 500,
      operation: () => applyLocked({ workspace, ...parsed.data }),
    });
  } catch (error) {
    if (error instanceof ActionEvidenceLogicError) throw error;
    if (error instanceof ControlFileLockError) throw boundedError("LOCK_BUSY");
    throw boundedError("APPLY_FAILED");
  }
}
