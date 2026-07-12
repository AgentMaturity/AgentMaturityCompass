import { randomUUID } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import {
  approvalPolicyPath,
  approvalPolicySigPath,
  loadApprovalPolicy,
  signApprovalPolicy,
  verifyApprovalPolicySignature,
} from "../approvals/approvalPolicyEngine.js";
import { approvalPolicySchema, type ApprovalClassPolicy, type ApprovalPolicy } from "../approvals/approvalPolicySchema.js";
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
import { openLedger } from "../ledger/ledger.js";
import { ControlFileLockError, withControlFileLock } from "../lifecycle/controlFileLock.js";
import { getPolicyPack } from "../policyPacks/builtInPacks.js";
import { appendTransparencyEntry } from "../transparency/logChain.js";
import type { ActionClass } from "../types.js";
import { pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export const SCOPE_TEMPLATE_SCHEMA_VERSION = "2026-07-11" as const;

const actionClassSchema = z.enum(ACTION_CLASSES as [ActionClass, ...ActionClass[]]);
const templateIdSchema = z.enum([
  "read-only",
  "workspace-change",
  "release-external",
  "privileged-sensitive",
]);

const scopeTemplateSchema = z.object({
  schemaVersion: z.literal(SCOPE_TEMPLATE_SCHEMA_VERSION),
  templateId: templateIdSchema,
  version: z.literal(1),
  label: z.string().min(1).max(80),
  description: z.string().min(1).max(240),
  actionClasses: z.array(actionClassSchema).min(1).max(ACTION_CLASSES.length),
}).strict();

export const scopeTemplateCompileRequestSchema = z.object({
  templateId: templateIdSchema,
  packId: z.string().min(1).max(120).regex(/^[a-z0-9][a-z0-9.-]*$/),
}).strict();

export const scopeTemplateApplyRequestSchema = scopeTemplateCompileRequestSchema.extend({
  confirmCompileId: z.string().regex(/^scope-compile-[a-f0-9]{16}$/),
}).strict();

export type ScopeTemplateId = z.infer<typeof templateIdSchema>;
export type ScopeTemplate = z.infer<typeof scopeTemplateSchema>;

export type ScopeTemplateErrorCode =
  | "TEMPLATE_NOT_FOUND"
  | "PACK_NOT_FOUND"
  | "BASELINE_UNTRUSTED"
  | "POLICY_SCHEMA_INVALID"
  | "POLICY_DUPLICATE_ACTION"
  | "PACK_SCOPE_INCOMPLETE"
  | "CONFIRMATION_REQUIRED"
  | "STATE_CHANGED"
  | "LOCK_BUSY"
  | "APPLY_FAILED";

export class ScopeTemplateError extends Error {
  constructor(readonly code: ScopeTemplateErrorCode, message: string) {
    super(message);
    this.name = "ScopeTemplateError";
  }
}

export function isScopeTemplateError(value: unknown): value is ScopeTemplateError {
  return value instanceof ScopeTemplateError;
}

export interface ScopeTemplatePolicyChange {
  actionClass: ActionClass;
  actionPolicy: {
    changed: boolean;
    beforeSha256: string;
    afterSha256: string;
  };
  approvalPolicy: {
    changed: boolean;
    beforeSha256: string;
    afterSha256: string;
  };
}

export interface ScopeTemplateCompilation {
  schemaVersion: typeof SCOPE_TEMPLATE_SCHEMA_VERSION;
  compileId: string;
  scope: "workspace";
  fleetBoundary: string;
  template: ScopeTemplate;
  pack: {
    packId: string;
    name: string;
    riskTier: string;
  };
  status: "ready" | "no_changes";
  canApply: boolean;
  baseline: {
    actionPolicySha256: string;
    approvalPolicySha256: string;
  };
  candidate: {
    actionPolicySha256: string;
    approvalPolicySha256: string;
  };
  changes: ScopeTemplatePolicyChange[];
}

export interface ScopeTemplateApplyResult {
  schemaVersion: typeof SCOPE_TEMPLATE_SCHEMA_VERSION;
  applied: boolean;
  reason: "NO_CHANGES" | null;
  compileId: string;
  compilation: ScopeTemplateCompilation;
  transparencyHash: string | null;
  auditEventId: string | null;
}

interface TrustedBaseline {
  actionPolicy: ActionPolicy;
  approvalPolicy: ApprovalPolicy;
  actionBytes: Buffer;
  approvalBytes: Buffer;
  actionSigBytes: Buffer;
  approvalSigBytes: Buffer;
  actionPolicySha256: string;
  approvalPolicySha256: string;
}

interface CompiledScopeTemplate {
  public: ScopeTemplateCompilation;
  candidateActionPolicy: ActionPolicy;
  candidateApprovalPolicy: ApprovalPolicy;
  candidateActionBytes: Buffer;
  candidateApprovalBytes: Buffer;
  baseline: TrustedBaseline;
}

const FLEET_BOUNDARY = "Workspace Action and Approval Policies apply to every registered agent; this is not per-agent or per-environment scope.";

const SCOPE_TEMPLATES: readonly ScopeTemplate[] = Object.freeze([
  scopeTemplateSchema.parse({
    schemaVersion: SCOPE_TEMPLATE_SCHEMA_VERSION,
    templateId: "read-only",
    version: 1,
    label: "Read only",
    description: "Read operations that do not intentionally mutate workspace or external state.",
    actionClasses: ["READ_ONLY"],
  }),
  scopeTemplateSchema.parse({
    schemaVersion: SCOPE_TEMPLATE_SCHEMA_VERSION,
    templateId: "workspace-change",
    version: 1,
    label: "Workspace change",
    description: "Low- and high-impact writes to workspace-owned state.",
    actionClasses: ["WRITE_LOW", "WRITE_HIGH"],
  }),
  scopeTemplateSchema.parse({
    schemaVersion: SCOPE_TEMPLATE_SCHEMA_VERSION,
    templateId: "release-external",
    version: 1,
    label: "Release and external effect",
    description: "Deployments and network actions that can affect systems outside the workspace.",
    actionClasses: ["DEPLOY", "NETWORK_EXTERNAL"],
  }),
  scopeTemplateSchema.parse({
    schemaVersion: SCOPE_TEMPLATE_SCHEMA_VERSION,
    templateId: "privileged-sensitive",
    version: 1,
    label: "Privileged and sensitive",
    description: "Security, financial, data export, and identity operations requiring the strictest review.",
    actionClasses: ["SECURITY", "FINANCIAL", "DATA_EXPORT", "IDENTITY"],
  }),
]);

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function boundedError(code: ScopeTemplateErrorCode): ScopeTemplateError {
  const messages: Record<ScopeTemplateErrorCode, string> = {
    TEMPLATE_NOT_FOUND: "Unknown AMC scope template.",
    PACK_NOT_FOUND: "Unknown AMC built-in Policy Pack.",
    BASELINE_UNTRUSTED: "Current Action or Approval Policy baseline is not trusted.",
    POLICY_SCHEMA_INVALID: "Action or Approval Policy does not match the existing AMC schema.",
    POLICY_DUPLICATE_ACTION: "Action Policy contains duplicate action classes.",
    PACK_SCOPE_INCOMPLETE: "The selected Policy Pack does not define every action class in this scope.",
    CONFIRMATION_REQUIRED: "Exact current compile ID confirmation is required.",
    STATE_CHANGED: "Policy state changed during compilation; retry from a fresh preview.",
    LOCK_BUSY: "Another Action Policy writer is in progress; retry later.",
    APPLY_FAILED: "Scope template apply failed and prior policy bytes were restored.",
  };
  return new ScopeTemplateError(code, messages[code]);
}

function templateById(templateId: string): ScopeTemplate {
  const template = SCOPE_TEMPLATES.find((candidate) => candidate.templateId === templateId);
  if (!template) throw boundedError("TEMPLATE_NOT_FOUND");
  return clone(template);
}

export function listScopeTemplates(): ScopeTemplate[] {
  return SCOPE_TEMPLATES.map((template) => clone(template));
}

export function scopeTemplateIdsForActionClass(actionClass: ActionClass): ScopeTemplateId[] {
  const template = SCOPE_TEMPLATES.find((candidate) => candidate.actionClasses.includes(actionClass));
  if (!template) throw boundedError("TEMPLATE_NOT_FOUND");
  return [template.templateId];
}

function rejectSymlink(path: string): void {
  if (!pathExists(path) || lstatSync(path).isSymbolicLink()) throw boundedError("BASELINE_UNTRUSTED");
}

function readTrustedBaseline(workspace: string): TrustedBaseline {
  if (pathExists(actionPolicyWriterPendingPath(workspace))) throw boundedError("STATE_CHANGED");
  const actionPath = actionPolicyPath(workspace);
  const approvalPath = approvalPolicyPath(workspace);
  const actionSigPath = actionPolicySigPath(workspace);
  const approvalSigPath = approvalPolicySigPath(workspace);
  for (const path of [actionPath, approvalPath, actionSigPath, approvalSigPath]) rejectSymlink(path);

  const first = {
    action: readFileSync(actionPath),
    approval: readFileSync(approvalPath),
    actionSig: readFileSync(actionSigPath),
    approvalSig: readFileSync(approvalSigPath),
  };
  const actionVerification = verifyActionPolicySignature(workspace);
  const approvalVerification = verifyApprovalPolicySignature(workspace);
  if (!actionVerification.valid || !approvalVerification.valid) throw boundedError("BASELINE_UNTRUSTED");
  const second = {
    action: readFileSync(actionPath),
    approval: readFileSync(approvalPath),
    actionSig: readFileSync(actionSigPath),
    approvalSig: readFileSync(approvalSigPath),
  };
  if (
    !first.action.equals(second.action)
    || !first.approval.equals(second.approval)
    || !first.actionSig.equals(second.actionSig)
    || !first.approvalSig.equals(second.approvalSig)
  ) throw boundedError("STATE_CHANGED");

  try {
    const actionPolicy = actionPolicySchema.parse(YAML.parse(first.action.toString("utf8")) as unknown);
    const approvalPolicy = approvalPolicySchema.parse(YAML.parse(first.approval.toString("utf8")) as unknown);
    assertUniqueActionRules(actionPolicy);
    return {
      actionPolicy,
      approvalPolicy,
      actionBytes: first.action,
      approvalBytes: first.approval,
      actionSigBytes: first.actionSig,
      approvalSigBytes: first.approvalSig,
      actionPolicySha256: sha256Hex(first.action),
      approvalPolicySha256: sha256Hex(first.approval),
    };
  } catch (error) {
    if (error instanceof ScopeTemplateError) throw error;
    throw boundedError("POLICY_SCHEMA_INVALID");
  }
}

function assertUniqueActionRules(policy: ActionPolicy): void {
  const seen = new Set<ActionClass>();
  for (const rule of policy.actions) {
    if (seen.has(rule.actionClass)) throw boundedError("POLICY_DUPLICATE_ACTION");
    seen.add(rule.actionClass);
  }
}

function actionRuleMap(policy: ActionPolicy): Map<ActionClass, ActionPolicyRule> {
  assertUniqueActionRules(policy);
  return new Map(policy.actions.map((rule) => [rule.actionClass, rule]));
}

function approvalRuleMap(policy: ApprovalPolicy): Partial<Record<ActionClass, ApprovalClassPolicy>> {
  return policy.approvalPolicy.actionClasses;
}

function valueSha256(value: unknown): string {
  return sha256Hex(canonicalize(value ?? null));
}

function compileInternal(input: { workspace: string; templateId: string; packId: string }): CompiledScopeTemplate {
  const workspace = resolve(input.workspace);
  const template = templateById(input.templateId);
  const pack = getPolicyPack(input.packId);
  if (!pack) throw boundedError("PACK_NOT_FOUND");
  const baseline = readTrustedBaseline(workspace);

  let sourceAction: ActionPolicy;
  let sourceApproval: ApprovalPolicy;
  try {
    sourceAction = actionPolicySchema.parse(pack.actionPolicy);
    sourceApproval = approvalPolicySchema.parse(pack.approvalPolicy);
    assertUniqueActionRules(sourceAction);
  } catch (error) {
    if (error instanceof ScopeTemplateError) throw error;
    throw boundedError("POLICY_SCHEMA_INVALID");
  }

  const baselineActionRules = actionRuleMap(baseline.actionPolicy);
  const sourceActionRules = actionRuleMap(sourceAction);
  const baselineApprovalRules = approvalRuleMap(baseline.approvalPolicy);
  const sourceApprovalRules = approvalRuleMap(sourceApproval);
  for (const actionClass of template.actionClasses) {
    if (
      !baselineActionRules.has(actionClass)
      || !baselineApprovalRules[actionClass]
      || !sourceActionRules.has(actionClass)
      || !sourceApprovalRules[actionClass]
    ) throw boundedError("PACK_SCOPE_INCOMPLETE");
  }

  const selected = new Set(template.actionClasses);
  const candidateActionPolicy = actionPolicySchema.parse({
    ...clone(baseline.actionPolicy),
    actions: baseline.actionPolicy.actions.map((rule) =>
      selected.has(rule.actionClass) ? clone(sourceActionRules.get(rule.actionClass)!) : clone(rule)),
  });
  const candidateApprovalPolicy = approvalPolicySchema.parse({
    ...clone(baseline.approvalPolicy),
    approvalPolicy: {
      ...clone(baseline.approvalPolicy.approvalPolicy),
      actionClasses: {
        ...clone(baseline.approvalPolicy.approvalPolicy.actionClasses),
        ...Object.fromEntries(template.actionClasses.map((actionClass) => [actionClass, clone(sourceApprovalRules[actionClass]!)])),
      },
    },
  });
  assertUniqueActionRules(candidateActionPolicy);

  const candidateActionBytes = Buffer.from(YAML.stringify(candidateActionPolicy), "utf8");
  const candidateApprovalBytes = Buffer.from(YAML.stringify(candidateApprovalPolicy), "utf8");
  const candidateActionPolicySha256 = sha256Hex(candidateActionBytes);
  const candidateApprovalPolicySha256 = sha256Hex(candidateApprovalBytes);
  const candidateActionRules = actionRuleMap(candidateActionPolicy);
  const candidateApprovalRules = approvalRuleMap(candidateApprovalPolicy);
  const changes = template.actionClasses.map((actionClass): ScopeTemplatePolicyChange => {
    const actionBefore = valueSha256(baselineActionRules.get(actionClass));
    const actionAfter = valueSha256(candidateActionRules.get(actionClass));
    const approvalBefore = valueSha256(baselineApprovalRules[actionClass]);
    const approvalAfter = valueSha256(candidateApprovalRules[actionClass]);
    return {
      actionClass,
      actionPolicy: { changed: actionBefore !== actionAfter, beforeSha256: actionBefore, afterSha256: actionAfter },
      approvalPolicy: { changed: approvalBefore !== approvalAfter, beforeSha256: approvalBefore, afterSha256: approvalAfter },
    };
  });
  const changed = changes.some((entry) => entry.actionPolicy.changed || entry.approvalPolicy.changed);
  const compileHash = sha256Hex(canonicalize({
    schemaVersion: SCOPE_TEMPLATE_SCHEMA_VERSION,
    templateId: template.templateId,
    templateVersion: template.version,
    packId: pack.id,
    actionClasses: template.actionClasses,
    baseline: {
      actionPolicySha256: baseline.actionPolicySha256,
      approvalPolicySha256: baseline.approvalPolicySha256,
    },
    candidate: {
      actionPolicySha256: candidateActionPolicySha256,
      approvalPolicySha256: candidateApprovalPolicySha256,
    },
  }));
  const publicCompilation: ScopeTemplateCompilation = {
    schemaVersion: SCOPE_TEMPLATE_SCHEMA_VERSION,
    compileId: `scope-compile-${compileHash.slice(0, 16)}`,
    scope: "workspace",
    fleetBoundary: FLEET_BOUNDARY,
    template,
    pack: { packId: pack.id, name: pack.name, riskTier: pack.riskTier },
    status: changed ? "ready" : "no_changes",
    canApply: changed,
    baseline: {
      actionPolicySha256: baseline.actionPolicySha256,
      approvalPolicySha256: baseline.approvalPolicySha256,
    },
    candidate: {
      actionPolicySha256: candidateActionPolicySha256,
      approvalPolicySha256: candidateApprovalPolicySha256,
    },
    changes,
  };
  return {
    public: publicCompilation,
    candidateActionPolicy,
    candidateApprovalPolicy,
    candidateActionBytes,
    candidateApprovalBytes,
    baseline,
  };
}

export function compileScopeTemplate(input: { workspace: string; templateId: string; packId: string }): ScopeTemplateCompilation {
  return compileInternal(input).public;
}

function restoreBaseline(workspace: string, baseline: TrustedBaseline): void {
  writeFileAtomic(actionPolicyPath(workspace), baseline.actionBytes, 0o644);
  writeFileAtomic(actionPolicySigPath(workspace), baseline.actionSigBytes, 0o644);
  writeFileAtomic(approvalPolicyPath(workspace), baseline.approvalBytes, 0o644);
  writeFileAtomic(approvalPolicySigPath(workspace), baseline.approvalSigBytes, 0o644);
}

function assertBaselineCurrent(workspace: string, baseline: TrustedBaseline): void {
  const paths = [
    [actionPolicyPath(workspace), baseline.actionBytes],
    [actionPolicySigPath(workspace), baseline.actionSigBytes],
    [approvalPolicyPath(workspace), baseline.approvalBytes],
    [approvalPolicySigPath(workspace), baseline.approvalSigBytes],
  ] as const;
  for (const [path, expected] of paths) {
    rejectSymlink(path);
    if (!readFileSync(path).equals(expected)) throw boundedError("STATE_CHANGED");
  }
}

function verifyAppliedCandidate(workspace: string, compiled: CompiledScopeTemplate): void {
  const actionPath = actionPolicyPath(workspace);
  const approvalPath = approvalPolicyPath(workspace);
  for (const path of [
    actionPath,
    approvalPath,
    actionPolicySigPath(workspace),
    approvalPolicySigPath(workspace),
  ]) rejectSymlink(path);

  const firstAction = readFileSync(actionPath);
  const firstApproval = readFileSync(approvalPath);
  if (
    !firstAction.equals(compiled.candidateActionBytes)
    || !firstApproval.equals(compiled.candidateApprovalBytes)
  ) throw new Error("post-write policy bytes differ from compiled candidate");

  loadActionPolicy(workspace);
  loadApprovalPolicy(workspace);
  if (!verifyActionPolicySignature(workspace).valid || !verifyApprovalPolicySignature(workspace).valid) {
    throw new Error("post-write signature verification failed");
  }

  if (
    !readFileSync(actionPath).equals(firstAction)
    || !readFileSync(approvalPath).equals(firstApproval)
  ) throw new Error("policy state changed during post-write verification");
}

function writeAudit(workspace: string, compilation: ScopeTemplateCompilation): string {
  const ledger = openLedger(workspace);
  const sessionId = `scope-template-${randomUUID()}`;
  const payload = {
    auditType: "POLICY_SCOPE_TEMPLATE_APPLIED",
    severity: "LOW",
    agentId: "system",
    scope: compilation.scope,
    templateId: compilation.template.templateId,
    templateVersion: compilation.template.version,
    packId: compilation.pack.packId,
    actionClasses: compilation.template.actionClasses,
    compileId: compilation.compileId,
    baseline: compilation.baseline,
    candidate: compilation.candidate,
  };
  const body = JSON.stringify(payload);
  const bodySha256 = sha256Hex(Buffer.from(body, "utf8"));
  try {
    ledger.startSession({ sessionId, runtime: "unknown", binaryPath: "amc-policy-scope", binarySha256: "amc-policy-scope" });
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

function applyLocked(input: {
  workspace: string;
  templateId: string;
  packId: string;
  confirmCompileId: string;
}): ScopeTemplateApplyResult {
  const compiled = compileInternal(input);
  if (compiled.public.compileId !== input.confirmCompileId) throw boundedError("CONFIRMATION_REQUIRED");
  if (!compiled.public.canApply) {
    return {
      schemaVersion: SCOPE_TEMPLATE_SCHEMA_VERSION,
      applied: false,
      reason: "NO_CHANGES",
      compileId: compiled.public.compileId,
      compilation: compiled.public,
      transparencyHash: null,
      auditEventId: null,
    };
  }

  let policyWriteStarted = false;
  try {
    assertBaselineCurrent(input.workspace, compiled.baseline);
    policyWriteStarted = true;
    writeFileAtomic(actionPolicyPath(input.workspace), compiled.candidateActionBytes, 0o644);
    signActionPolicyWithLockHeld(input.workspace);
    writeFileAtomic(approvalPolicyPath(input.workspace), compiled.candidateApprovalBytes, 0o644);
    signApprovalPolicy(input.workspace);
    verifyAppliedCandidate(input.workspace, compiled);
  } catch (error) {
    if (!policyWriteStarted && error instanceof ScopeTemplateError) throw error;
    if (policyWriteStarted) restoreBaseline(input.workspace, compiled.baseline);
    throw boundedError("APPLY_FAILED");
  }

  const artifactSha256 = sha256Hex(canonicalize({
    compileId: compiled.public.compileId,
    candidate: compiled.public.candidate,
  }));
  const transparency = appendTransparencyEntry({
    workspace: input.workspace,
    type: "POLICY_SCOPE_TEMPLATE_APPLIED",
    agentId: "system",
    artifact: { kind: "policy", sha256: artifactSha256, id: compiled.public.compileId },
  });
  const auditEventId = writeAudit(input.workspace, compiled.public);
  return {
    schemaVersion: SCOPE_TEMPLATE_SCHEMA_VERSION,
    applied: true,
    reason: null,
    compileId: compiled.public.compileId,
    compilation: compiled.public,
    transparencyHash: transparency.hash,
    auditEventId,
  };
}

export function applyScopeTemplate(input: {
  workspace: string;
  templateId: string;
  packId: string;
  confirmCompileId: string;
}): ScopeTemplateApplyResult {
  const workspace = resolve(input.workspace);
  try {
    return withControlFileLock({
      root: dirname(actionPolicyPath(workspace)),
      name: ACTION_POLICY_WRITER_LOCK,
      timeoutMs: 500,
      operation: () => applyLocked({ ...input, workspace }),
    });
  } catch (error) {
    if (error instanceof ScopeTemplateError) throw error;
    if (error instanceof ControlFileLockError) throw boundedError("LOCK_BUSY");
    throw boundedError("APPLY_FAILED");
  }
}
