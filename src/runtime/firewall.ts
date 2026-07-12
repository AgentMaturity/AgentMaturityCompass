import { randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { z } from "zod";
import YAML from "yaml";
import {
  GUARDRAIL_RUNTIME_BINDINGS,
  inspectGuardrailControlState,
  inspectGuardrailControlStateReadOnly,
  type BoundGuardrailName
} from "../enforce/guardrailControlState.js";
import {
  artifactSigPath,
  readAndVerifyArtifactFileSignature,
  signArtifactFile,
  trySignArtifactFile,
  verifyArtifactFileSignature
} from "../lifecycle/artifactSignature.js";
import { ControlFileLockError, withControlFileLock } from "../lifecycle/controlFileLock.js";
import {
  appendSignedControlJournal,
  readSignedControlJournal,
  type SignedControlJournalSnapshot
} from "../lifecycle/signedControlJournal.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { appendRuntimeRunEvent } from "./runManager.js";

export type RuntimeFirewallMode = "observe" | "warn" | "block";
export type RuntimeFirewallDirection = "request" | "response";
export type RuntimeFirewallAction = "allow" | "warn" | "block";
export type RuntimeFirewallSeverity = "info" | "low" | "medium" | "high" | "critical";

export interface RuntimeFirewallPolicy {
  schemaVersion: "2026-05-22";
  enabled: boolean;
  mode: RuntimeFirewallMode;
  failClosedOnMissingPolicy: boolean;
  thresholds: {
    warnAt: number;
    blockAt: number;
  };
  rules: {
    promptInjection: boolean;
    secretExposure: boolean;
    destructiveAction: boolean;
    piiLeakage: boolean;
    payloadAnomaly: boolean;
    maxPayloadChars: number;
  };
  redaction: {
    redactSecrets: boolean;
    maxPreviewChars: number;
  };
  updatedAt: string;
}

export interface RuntimeFirewallMatch {
  ruleId: string;
  surface: "Shield" | "Enforce" | "Vault" | "Watch" | "Comply";
  severity: RuntimeFirewallSeverity;
  scoreImpact: number;
  reason: string;
}

export interface RuntimeFirewallDecision {
  schemaVersion: "2026-05-22" | "2026-07-12";
  decisionId: string;
  createdAt: string;
  workspace: string;
  source: "cli" | "studio" | "api" | "bridge" | "gateway" | "sdk";
  agentId: string;
  direction: RuntimeFirewallDirection;
  mode: RuntimeFirewallMode | "disabled" | "missing-policy" | "invalid-policy" | "invalid-control-state";
  action: RuntimeFirewallAction;
  riskScore: number;
  severity: RuntimeFirewallSeverity;
  degraded: boolean;
  reasons: string[];
  matches: RuntimeFirewallMatch[];
  redactedPreview: string;
  request: {
    provider: string | null;
    model: string | null;
    route: string | null;
    method: string | null;
  };
  guardrailControl: {
    integrity: "uninitialized" | "trusted" | "invalid";
    revision: number | null;
    applied: BoundGuardrailName[];
    reason: string;
  };
  links: {
    runId: string | null;
    episodeId: string | null;
    lifecycleRunId: string | null;
    bridgeRequestId: string | null;
    receiptId: string;
    receiptSha256: string;
  };
  eventPath: string | null;
  signaturePath: string | null;
  rollout?: RuntimeFirewallRolloutBinding;
}

export interface RuntimeFirewallRolloutBinding {
  schemaVersion: "2026-07-12";
  mode: RuntimeFirewallDecision["mode"];
  sourceIntegrity: RuntimeFirewallPolicyInspection["integrity"];
  policyRevision: number | null;
  policySha256: string | null;
  thresholds: RuntimeFirewallPolicy["thresholds"] | null;
  candidateAction: RuntimeFirewallAction;
  actualAction: RuntimeFirewallAction;
  enforcementSuppressed: boolean;
}

export interface RuntimeFirewallRolloutEvidenceCounts {
  totalEvaluations: number;
  trustedEvaluations: number;
  invalidEvaluations: number;
  legacyUnclassifiedEvaluations: number;
  otherPolicyEvaluations: number;
}

export interface RuntimeFirewallRolloutCounters {
  evaluations: number;
  matchedEvaluations: number;
  nonMatchedEvaluations: number;
  candidateAllow: number;
  wouldWarn: number;
  wouldBlock: number;
  actualAllow: number;
  actualWarn: number;
  actualBlock: number;
  enforcementSuppressed: number;
}

export interface RuntimeFirewallRolloutRuleCounters {
  matches: number;
  wouldWarn: number;
  wouldBlock: number;
  actualWarn: number;
  actualBlock: number;
  enforcementSuppressed: number;
}

export interface RuntimeFirewallRolloutStatus {
  schemaVersion: "2026-07-12";
  status: "empty" | "trusted" | "partial" | "fail_closed";
  claimEligible: boolean;
  currentPolicy: {
    integrity: RuntimeFirewallPolicyInspection["integrity"];
    enabled: boolean;
    mode: RuntimeFirewallDecision["mode"];
    revision: number | null;
    sha256: string | null;
  };
  evidence: RuntimeFirewallRolloutEvidenceCounts;
  counters: RuntimeFirewallRolloutCounters;
  byRule: Record<string, RuntimeFirewallRolloutRuleCounters>;
  window: { firstEventAt: string | null; lastEventAt: string | null };
  reasonCodes: string[];
  claimBoundary: string;
}

export interface RuntimeFirewallEvaluateInput {
  workspace: string;
  content: string;
  direction: RuntimeFirewallDirection;
  source: RuntimeFirewallDecision["source"];
  agentId?: string | null;
  provider?: string | null;
  model?: string | null;
  route?: string | null;
  method?: string | null;
  runId?: string | null;
  episodeId?: string | null;
  lifecycleRunId?: string | null;
  bridgeRequestId?: string | null;
  requirePolicy?: boolean;
  record?: boolean;
  policy?: RuntimeFirewallPolicy | null;
}

export interface RuntimeFirewallExportResult {
  outputPath: string;
  format: "json" | "jsonl" | "splunk";
  redacted: boolean;
  count: number;
}

const SECRET_RE = /(sk-[a-z0-9_-]{12,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|xox[baprs]-[a-z0-9-]{10,})/gi;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const CREDIT_CARD_RE = /\b(?:\d[ -]*?){13,19}\b/g;
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;

const runtimeFirewallPolicySchema = z.object({
  schemaVersion: z.literal("2026-05-22"),
  enabled: z.boolean(),
  mode: z.enum(["observe", "warn", "block"]),
  failClosedOnMissingPolicy: z.boolean(),
  thresholds: z.object({
    warnAt: z.number().min(0).max(100),
    blockAt: z.number().min(0).max(100)
  }).strict(),
  rules: z.object({
    promptInjection: z.boolean(),
    secretExposure: z.boolean(),
    destructiveAction: z.boolean(),
    piiLeakage: z.boolean(),
    payloadAnomaly: z.boolean(),
    maxPayloadChars: z.number().int().positive()
  }).strict(),
  redaction: z.object({
    redactSecrets: z.boolean(),
    maxPreviewChars: z.number().int().positive()
  }).strict(),
  updatedAt: z.iso.datetime()
}).strict();

const runtimeFirewallActionSchema = z.enum(["allow", "warn", "block"]);
const runtimeFirewallModeSchema = z.enum([
  "observe",
  "warn",
  "block",
  "disabled",
  "missing-policy",
  "invalid-policy",
  "invalid-control-state",
]);
const runtimeFirewallSeveritySchema = z.enum(["info", "low", "medium", "high", "critical"]);
const runtimeFirewallMatchSchema = z.object({
  ruleId: z.string().min(1),
  surface: z.enum(["Shield", "Enforce", "Vault", "Watch", "Comply"]),
  severity: runtimeFirewallSeveritySchema,
  scoreImpact: z.number().min(0).max(100),
  reason: z.string().min(1),
}).strict();
const runtimeFirewallRolloutBindingSchema = z.object({
  schemaVersion: z.literal("2026-07-12"),
  mode: runtimeFirewallModeSchema,
  sourceIntegrity: z.enum(["uninitialized", "trusted", "invalid"]),
  policyRevision: z.number().int().positive().nullable(),
  policySha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  thresholds: z.object({
    warnAt: z.number().min(0).max(100),
    blockAt: z.number().min(0).max(100),
  }).strict().nullable(),
  candidateAction: runtimeFirewallActionSchema,
  actualAction: runtimeFirewallActionSchema,
  enforcementSuppressed: z.boolean(),
}).strict();
const runtimeFirewallDecisionFields = {
  decisionId: z.string().regex(/^fw_[A-Za-z0-9-]+$/),
  createdAt: z.iso.datetime(),
  workspace: z.string().min(1),
  source: z.enum(["cli", "studio", "api", "bridge", "gateway", "sdk"]),
  agentId: z.string().min(1),
  direction: z.enum(["request", "response"]),
  mode: runtimeFirewallModeSchema,
  action: runtimeFirewallActionSchema,
  riskScore: z.number().int().min(0).max(100),
  severity: runtimeFirewallSeveritySchema,
  degraded: z.boolean(),
  reasons: z.array(z.string().min(1)).min(1),
  matches: z.array(runtimeFirewallMatchSchema),
  redactedPreview: z.string(),
  request: z.object({
    provider: z.string().nullable(),
    model: z.string().nullable(),
    route: z.string().nullable(),
    method: z.string().nullable(),
  }).strict(),
  guardrailControl: z.object({
    integrity: z.enum(["uninitialized", "trusted", "invalid"]),
    revision: z.number().int().positive().nullable(),
    applied: z.array(z.string()),
    reason: z.string(),
  }).strict(),
  links: z.object({
    runId: z.string().nullable(),
    episodeId: z.string().nullable(),
    lifecycleRunId: z.string().nullable(),
    bridgeRequestId: z.string().nullable(),
    receiptId: z.string().min(1),
    receiptSha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
  eventPath: z.string().nullable(),
  signaturePath: z.string().nullable(),
};

const legacyRuntimeFirewallDecisionSchema = z.object({
  schemaVersion: z.literal("2026-05-22"),
  ...runtimeFirewallDecisionFields,
}).strict();

function expectedRuntimeFirewallReceiptSha256(decision: RuntimeFirewallDecision): string {
  const {
    links,
    eventPath: _eventPath,
    signaturePath: _signaturePath,
    ...baseDecision
  } = decision;
  const { receiptSha256: _receiptSha256, ...receiptLinks } = links;
  return sha256Hex(JSON.stringify({ ...baseDecision, links: receiptLinks }));
}

const currentRuntimeFirewallDecisionSchema = z.object({
  schemaVersion: z.literal("2026-07-12"),
  ...runtimeFirewallDecisionFields,
  rollout: runtimeFirewallRolloutBindingSchema,
}).strict().superRefine((decision, context) => {
  const matchIds = decision.matches.map((match) => match.ruleId);
  if (new Set(matchIds).size !== matchIds.length) {
    context.addIssue({ code: "custom", path: ["matches"], message: "duplicate rule match" });
  }
  if (decision.rollout.mode !== decision.mode) {
    context.addIssue({ code: "custom", path: ["rollout", "mode"], message: "rollout mode mismatch" });
  }
  if (decision.rollout.actualAction !== decision.action) {
    context.addIssue({ code: "custom", path: ["rollout", "actualAction"], message: "actual action mismatch" });
  }
  const expectedRiskScore = Math.max(0, Math.min(100, Math.round(
    decision.matches.reduce((maximum, match) => Math.max(maximum, match.scoreImpact), 0),
  )));
  if (decision.riskScore !== expectedRiskScore) {
    context.addIssue({ code: "custom", path: ["riskScore"], message: "risk score does not match rule evidence" });
  }
  if (decision.severity !== severityForScore(decision.riskScore)) {
    context.addIssue({ code: "custom", path: ["severity"], message: "severity does not match risk score" });
  }
  const expectedDegraded = decision.mode === "missing-policy"
    || decision.mode === "invalid-policy"
    || decision.mode === "invalid-control-state";
  if (decision.degraded !== expectedDegraded) {
    context.addIssue({ code: "custom", path: ["degraded"], message: "degraded flag does not match decision mode" });
  }
  if (decision.matches.length > 0) {
    const expectedReasons = decision.matches.map((match) => match.reason);
    if (JSON.stringify(decision.reasons) !== JSON.stringify(expectedReasons)) {
      context.addIssue({ code: "custom", path: ["reasons"], message: "reasons do not match rule evidence" });
    }
  }
  if (decision.links.receiptSha256 !== expectedRuntimeFirewallReceiptSha256(decision as RuntimeFirewallDecision)) {
    context.addIssue({ code: "custom", path: ["links", "receiptSha256"], message: "receipt digest mismatch" });
  }

  let expectedCandidate: RuntimeFirewallAction;
  let expectedActual: RuntimeFirewallAction;
  if (decision.mode === "missing-policy" || decision.mode === "invalid-policy" || decision.mode === "invalid-control-state") {
    expectedCandidate = "block";
    expectedActual = "block";
    if (decision.rollout.policySha256 !== null || decision.rollout.thresholds !== null) {
      context.addIssue({ code: "custom", path: ["rollout"], message: "fail-closed state cannot claim policy thresholds" });
    }
  } else if (decision.mode === "disabled") {
    expectedCandidate = "allow";
    expectedActual = "allow";
  } else {
    if (decision.rollout.sourceIntegrity !== "trusted") {
      context.addIssue({ code: "custom", path: ["rollout", "sourceIntegrity"], message: "active rollout source is not trusted" });
    }
    if (!decision.rollout.thresholds || !decision.rollout.policySha256) {
      context.addIssue({ code: "custom", path: ["rollout"], message: "active rollout requires policy hash and thresholds" });
      return;
    }
    const { warnAt, blockAt } = decision.rollout.thresholds;
    if (warnAt > blockAt) {
      context.addIssue({ code: "custom", path: ["rollout", "thresholds"], message: "warn threshold exceeds block threshold" });
    }
    expectedCandidate = decision.riskScore <= 0
      ? "allow"
      : decision.riskScore >= blockAt
        ? "block"
        : decision.riskScore >= warnAt
          ? "warn"
          : "allow";
    expectedActual = decision.mode === "observe"
      ? "allow"
      : decision.mode === "warn"
        ? expectedCandidate === "allow" ? "allow" : "warn"
        : expectedCandidate;
  }
  const expectedSuppressed = expectedCandidate !== expectedActual
    && (decision.mode === "observe" || decision.mode === "warn");
  if (decision.rollout.candidateAction !== expectedCandidate) {
    context.addIssue({ code: "custom", path: ["rollout", "candidateAction"], message: "candidate action mismatch" });
  }
  if (decision.action !== expectedActual) {
    context.addIssue({ code: "custom", path: ["action"], message: "mode/action mapping mismatch" });
  }
  if (decision.rollout.enforcementSuppressed !== expectedSuppressed) {
    context.addIssue({ code: "custom", path: ["rollout", "enforcementSuppressed"], message: "suppression flag mismatch" });
  }
});

const storedRuntimeFirewallDecisionSchema = z.discriminatedUnion("schemaVersion", [
  legacyRuntimeFirewallDecisionSchema,
  currentRuntimeFirewallDecisionSchema,
]);

export interface RuntimeFirewallPolicyInspection {
  integrity: "uninitialized" | "trusted" | "invalid";
  policy: RuntimeFirewallPolicy | null;
  path: string;
  signaturePath: string;
  revision: number | null;
  journalPath: string | null;
  checkpointPath: string | null;
  reason: string;
}

export interface RuntimeFirewallMigrationReceipt {
  schemaVersion: "2026-07-10";
  preservation: "semantic";
  sourceSignatureSchemaVersion: string;
  sourceArtifactSha256: string;
  sourceSignatureRecordSha256: string;
  committedPolicySha256: string;
}

const runtimeFirewallMigrationReceiptSchema = z.object({
  schemaVersion: z.literal("2026-07-10"),
  preservation: z.literal("semantic"),
  sourceSignatureSchemaVersion: z.string().min(1),
  sourceArtifactSha256: z.string().length(64),
  sourceSignatureRecordSha256: z.string().length(64),
  committedPolicySha256: z.string().length(64)
}).strict();

const runtimeFirewallMigrationMetadataSchema = z.object({
  type: z.literal("legacy-runtime-firewall-migration"),
  receipt: runtimeFirewallMigrationReceiptSchema
}).strict();

function migrationReceiptFromMetadata(metadata: unknown): RuntimeFirewallMigrationReceipt | null {
  const parsed = runtimeFirewallMigrationMetadataSchema.safeParse(metadata);
  return parsed.success ? parsed.data.receipt : null;
}

export function runtimeFirewallRoot(workspace: string): string {
  return join(workspace, ".amc", "firewall");
}

export function runtimeFirewallPolicyPath(workspace: string): string {
  return join(runtimeFirewallRoot(workspace), "policy.json");
}

export function runtimeFirewallPolicyJournalDir(workspace: string): string {
  return join(runtimeFirewallRoot(workspace), "policy-revisions");
}

export function runtimeFirewallEventsDir(workspace: string): string {
  return join(runtimeFirewallRoot(workspace), "events");
}

export function defaultRuntimeFirewallPolicy(mode: RuntimeFirewallMode = "warn"): RuntimeFirewallPolicy {
  return {
    schemaVersion: "2026-05-22",
    enabled: true,
    mode,
    failClosedOnMissingPolicy: true,
    thresholds: {
      warnAt: 30,
      blockAt: 70
    },
    rules: {
      promptInjection: true,
      secretExposure: true,
      destructiveAction: true,
      piiLeakage: true,
      payloadAnomaly: true,
      maxPayloadChars: 60_000
    },
    redaction: {
      redactSecrets: true,
      maxPreviewChars: 700
    },
    updatedAt: new Date().toISOString()
  };
}

function validateRuntimeFirewallPolicy(raw: unknown): RuntimeFirewallPolicy {
  const policy = runtimeFirewallPolicySchema.parse(raw) as RuntimeFirewallPolicy;
  if (policy.thresholds.warnAt > policy.thresholds.blockAt) {
    throw new Error("warnAt must be less than or equal to blockAt");
  }
  return policy;
}

function readRuntimeFirewallPolicyJournal(
  workspace: string,
  recoverPendingPublication = false
): SignedControlJournalSnapshot<RuntimeFirewallPolicy> {
  return readSignedControlJournal({
    workspace,
    controlKind: "runtime-firewall-policy",
    journalDir: runtimeFirewallPolicyJournalDir(workspace),
    parsePayload: validateRuntimeFirewallPolicy,
    recoverPendingPublication
  });
}

function withRuntimeFirewallPolicyLock<T>(workspace: string, operation: () => T): T {
  try {
    return withControlFileLock({ root: runtimeFirewallRoot(workspace), name: "policy", operation });
  } catch (error) {
    if (error instanceof ControlFileLockError) {
      throw new Error("Runtime Firewall policy is busy; retry the operation.");
    }
    throw error;
  }
}

function writeRuntimeFirewallPolicyMirror(workspace: string, policy: RuntimeFirewallPolicy): {
  signaturePath: string;
  trusted: boolean;
  warning: string | null;
} {
  const path = runtimeFirewallPolicyPath(workspace);
  try {
    writeFileAtomic(path, `${JSON.stringify(policy, null, 2)}\n`, 0o600);
    const signed = signArtifactFile({ workspace, path, artifactKind: "runtime-firewall-policy" });
    const verification = verifyArtifactFileSignature({
      workspace,
      path,
      artifactKind: "runtime-firewall-policy",
      requireDomainSeparated: true
    });
    if (!verification.valid) throw new Error(verification.reason ?? "signature verification failed");
    return { signaturePath: signed.sigPath, trusted: true, warning: null };
  } catch (error) {
    const warning = `Runtime Firewall policy committed, but compatibility mirror refresh failed: ${error instanceof Error ? error.message : String(error)}`;
    process.emitWarning(warning);
    return { signaturePath: artifactSigPath(path), trusted: false, warning };
  }
}

function commitRuntimeFirewallPolicy(
  workspace: string,
  policy: RuntimeFirewallPolicy,
  previous: SignedControlJournalSnapshot<RuntimeFirewallPolicy>,
  journalOptions: {
    metadata?: unknown;
    afterPendingCommit?: () => void;
    beforeCheckpointCommit?: () => void;
    afterTrustPinCommit?: () => void;
    afterCheckpointCommit?: () => void;
  } = {}
): {
  policy: RuntimeFirewallPolicy;
  path: string;
  signaturePath: string;
  revision: number;
  checkpointPath: string;
  mirrorTrusted: boolean;
  mirrorWarning: string | null;
} {
  const validatedPolicy = validateRuntimeFirewallPolicy(policy);
  const committed = appendSignedControlJournal({
    workspace,
    controlKind: "runtime-firewall-policy",
    journalDir: runtimeFirewallPolicyJournalDir(workspace),
    previous,
    payload: validatedPolicy,
    metadata: journalOptions.metadata,
    afterPendingCommit: journalOptions.afterPendingCommit,
    beforeCheckpointCommit: journalOptions.beforeCheckpointCommit,
    afterTrustPinCommit: journalOptions.afterTrustPinCommit,
    afterCheckpointCommit: journalOptions.afterCheckpointCommit
  });
  const mirror = writeRuntimeFirewallPolicyMirror(workspace, validatedPolicy);
  return {
    policy: validatedPolicy,
    path: runtimeFirewallPolicyPath(workspace),
    signaturePath: mirror.signaturePath,
    revision: committed.revision,
    checkpointPath: committed.checkpointPath!,
    mirrorTrusted: mirror.trusted,
    mirrorWarning: mirror.warning
  };
}

export function writeRuntimeFirewallPolicy(input: {
  workspace: string;
  mode?: RuntimeFirewallMode;
  enabled?: boolean;
  failClosedOnMissingPolicy?: boolean;
}): {
  policy: RuntimeFirewallPolicy;
  path: string;
  signaturePath: string;
  revision: number;
  checkpointPath: string;
  mirrorTrusted: boolean;
  mirrorWarning: string | null;
} {
  return withRuntimeFirewallPolicyLock(input.workspace, () => {
    const previous = readRuntimeFirewallPolicyJournal(input.workspace, true);
    const mirrorPath = runtimeFirewallPolicyPath(input.workspace);
    if (previous.integrity === "uninitialized" && (pathExists(mirrorPath) || pathExists(artifactSigPath(mirrorPath)))) {
      const inspected = inspectRuntimeFirewallPolicy(input.workspace);
      if (inspected.integrity === "invalid") {
        throw new Error(`${inspected.reason} Run 'amc firewall migrate-signature --approve-legacy-kind' for a verified legacy policy.`);
      }
    }
    const policy = validateRuntimeFirewallPolicy({
      ...defaultRuntimeFirewallPolicy(input.mode ?? "warn"),
      enabled: input.enabled ?? true,
      failClosedOnMissingPolicy: input.failClosedOnMissingPolicy ?? true,
      updatedAt: new Date().toISOString()
    });
    return commitRuntimeFirewallPolicy(input.workspace, policy, previous);
  });
}

export function inspectRuntimeFirewallPolicy(workspace: string): RuntimeFirewallPolicyInspection {
  const path = runtimeFirewallPolicyPath(workspace);
  const signaturePath = artifactSigPath(path);
  const policyExists = pathExists(path);
  const signatureExists = pathExists(signaturePath);
  let journal: SignedControlJournalSnapshot<RuntimeFirewallPolicy>;
  try {
    journal = readRuntimeFirewallPolicyJournal(workspace);
  } catch (error) {
    return {
      integrity: "invalid",
      policy: null,
      path,
      signaturePath,
      revision: null,
      journalPath: null,
      checkpointPath: null,
      reason: `Runtime Firewall policy journal invalid: ${error instanceof Error ? error.message : String(error)}`
    };
  }
  if (journal.integrity === "uninitialized" && !policyExists && !signatureExists) {
    return {
      integrity: "uninitialized",
      policy: null,
      path,
      signaturePath,
      revision: null,
      journalPath: null,
      checkpointPath: null,
      reason: "No Runtime Firewall policy has been initialized."
    };
  }
  if (journal.integrity === "uninitialized") {
    const legacyVerification = verifyArtifactFileSignature({
      workspace,
      path,
      artifactKind: "runtime-firewall-policy"
    });
    return {
      integrity: "invalid",
      policy: null,
      path,
      signaturePath,
      revision: null,
      journalPath: null,
      checkpointPath: null,
      reason: legacyVerification.valid
        ? "Runtime Firewall policy is valid but lacks a host-local checkpoint; run the explicit signature migration command."
        : `Runtime Firewall policy is uncheckpointed or invalid: ${legacyVerification.reason ?? "unknown"}.`
    };
  }
  const policy = journal.payload!;
  const mirrorVerification = verifyArtifactFileSignature({
    workspace,
    path,
    artifactKind: "runtime-firewall-policy",
    requireDomainSeparated: true
  });
  let mirrorReason = `Compatibility mirror unavailable: ${mirrorVerification.reason ?? "invalid"}.`;
  if (mirrorVerification.valid) {
    try {
      const mirror = validateRuntimeFirewallPolicy(JSON.parse(readUtf8(path)) as unknown);
      mirrorReason = canonicalize(mirror) === canonicalize(policy)
        ? "Compatibility mirror is valid."
        : "Compatibility mirror is stale; canonical signed journal remains authoritative.";
    } catch (error) {
      mirrorReason = `Compatibility mirror invalid: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  return {
    integrity: "trusted",
    policy,
    path,
    signaturePath,
    revision: journal.revision,
    journalPath: journal.entryPath,
    checkpointPath: journal.checkpointPath,
    reason: `${journal.reason} ${mirrorReason}`
  };
}

export function migrateRuntimeFirewallPolicySignature(input: {
  workspace: string;
  approveLegacyArtifactKind: boolean;
  beforeLegacyCommit?: () => void;
  afterPendingCommit?: () => void;
  beforeCheckpointCommit?: () => void;
  afterTrustPinCommit?: () => void;
  afterCheckpointCommit?: () => void;
}): {
  policy: RuntimeFirewallPolicy;
  path: string;
  signaturePath: string;
  revision: number;
  checkpointPath: string;
  mirrorTrusted: boolean;
  mirrorWarning: string | null;
  migratedFrom: string;
  migrationReceipt: RuntimeFirewallMigrationReceipt | null;
} {
  return withRuntimeFirewallPolicyLock(input.workspace, () => {
    const previous = readRuntimeFirewallPolicyJournal(input.workspace, true);
    if (previous.integrity === "trusted") {
      const inspected = inspectRuntimeFirewallPolicy(input.workspace);
      const receipt = migrationReceiptFromMetadata(previous.metadata);
      const mirror = writeRuntimeFirewallPolicyMirror(input.workspace, inspected.policy!);
      return {
        policy: inspected.policy!,
        path: inspected.path,
        signaturePath: mirror.signaturePath,
        revision: inspected.revision!,
        checkpointPath: inspected.checkpointPath!,
        mirrorTrusted: mirror.trusted,
        mirrorWarning: mirror.warning,
        migratedFrom: receipt?.sourceSignatureSchemaVersion ?? "already-journaled",
        migrationReceipt: receipt
      };
    }
    const path = runtimeFirewallPolicyPath(input.workspace);
    const verification = readAndVerifyArtifactFileSignature({
      workspace: input.workspace,
      path,
      artifactKind: "runtime-firewall-policy"
    });
    if (!verification.valid) {
      throw new Error(`Legacy Runtime Firewall policy verification failed: ${verification.reason ?? "unknown"}.`);
    }
    const schemaVersion = verification.signature?.schemaVersion ?? "unknown";
    if (schemaVersion === "2026-05-22" && !input.approveLegacyArtifactKind) {
      throw new Error("Legacy artifact kind was not cryptographically bound. Re-run with --approve-legacy-kind after reviewing the exact policy bytes.");
    }
    const policy = validateRuntimeFirewallPolicy(JSON.parse(verification.artifactBytes!.toString("utf8")) as unknown);
    const migrationReceipt: RuntimeFirewallMigrationReceipt = {
      schemaVersion: "2026-07-10",
      preservation: "semantic",
      sourceSignatureSchemaVersion: schemaVersion,
      sourceArtifactSha256: verification.artifactSha256!,
      sourceSignatureRecordSha256: sha256Hex(canonicalize(verification.signature)),
      committedPolicySha256: sha256Hex(canonicalize(policy))
    };
    input.beforeLegacyCommit?.();
    return {
      ...commitRuntimeFirewallPolicy(input.workspace, policy, previous, {
        metadata: {
          type: "legacy-runtime-firewall-migration",
          receipt: migrationReceipt
        },
        afterPendingCommit: input.afterPendingCommit,
        beforeCheckpointCommit: input.beforeCheckpointCommit,
        afterTrustPinCommit: input.afterTrustPinCommit,
        afterCheckpointCommit: input.afterCheckpointCommit
      }),
      migratedFrom: schemaVersion,
      migrationReceipt
    };
  });
}

export function loadRuntimeFirewallPolicy(workspace: string): RuntimeFirewallPolicy | null {
  const inspected = inspectRuntimeFirewallPolicy(workspace);
  if (inspected.integrity === "invalid") {
    throw new Error(inspected.reason);
  }
  return inspected.policy;
}

export function runtimeFirewallEnabled(workspace: string): boolean {
  if (process.env.AMC_FIREWALL_ENABLED === "1") {
    return true;
  }
  const policy = inspectRuntimeFirewallPolicy(workspace);
  const control = inspectGuardrailControlState(workspace);
  if (policy.integrity === "invalid" || control.integrity === "invalid") {
    return true;
  }
  return policy.policy?.enabled === true || (control.state?.requestedGuardrails.length ?? 0) > 0;
}

interface EffectiveRuntimeFirewallPolicy {
  policy: RuntimeFirewallPolicy | null;
  policyIntegrity: RuntimeFirewallPolicyInspection["integrity"];
  policyRevision: number | null;
  policySha256: string | null;
  policyReason: string;
  control: RuntimeFirewallDecision["guardrailControl"];
  integrityFailure: "policy" | "control" | null;
}

function resolveEffectiveRuntimeFirewallPolicy(
  input: RuntimeFirewallEvaluateInput,
  snapshots?: {
    control: ReturnType<typeof inspectGuardrailControlState>;
    policy: RuntimeFirewallPolicyInspection;
  },
): EffectiveRuntimeFirewallPolicy {
  const workspace = resolve(input.workspace);
  const controlSnapshot = snapshots?.control ?? (input.record === false
    ? inspectGuardrailControlStateReadOnly(workspace)
    : inspectGuardrailControlState(workspace));
  const applied = (controlSnapshot.state?.requestedGuardrails ?? []) as BoundGuardrailName[];
  const control: RuntimeFirewallDecision["guardrailControl"] = {
    integrity: controlSnapshot.integrity,
    revision: controlSnapshot.state?.revision ?? null,
    applied,
    reason: controlSnapshot.reason
  };
  if (controlSnapshot.integrity === "invalid") {
    return {
      policy: null,
      policyIntegrity: "uninitialized",
      policyRevision: null,
      policySha256: null,
      policyReason: "Runtime Firewall policy was not evaluated because guardrail control state is invalid.",
      control,
      integrityFailure: "control"
    };
  }

  const inspected = input.policy === undefined
    ? snapshots?.policy ?? inspectRuntimeFirewallPolicy(workspace)
    : {
        integrity: "trusted" as const,
        policy: input.policy,
        path: "provided",
        signaturePath: "provided",
        revision: null,
        reason: "Runtime Firewall policy was supplied by the trusted caller."
      };
  if (inspected.integrity === "invalid") {
    return {
      policy: null,
      policyIntegrity: inspected.integrity,
      policyRevision: inspected.revision,
      policySha256: null,
      policyReason: inspected.reason,
      control,
      integrityFailure: "policy"
    };
  }

  let policy = inspected.policy ? runtimeFirewallPolicySchema.parse(inspected.policy) as RuntimeFirewallPolicy : null;
  if (applied.length > 0) {
    const hadEnabledPolicy = policy?.enabled === true;
    const guardrailOnlyDefault = defaultRuntimeFirewallPolicy("block");
    policy = policy
      ? {
          ...policy,
          enabled: true,
          mode: hadEnabledPolicy ? policy.mode : "block",
          rules: { ...policy.rules }
        }
      : {
          ...guardrailOnlyDefault,
          updatedAt: controlSnapshot.state!.updatedAt,
          rules: {
            ...guardrailOnlyDefault.rules,
            promptInjection: false,
            secretExposure: false,
            destructiveAction: false,
            piiLeakage: false,
            payloadAnomaly: false
          }
        };
    for (const guardrail of applied) {
      policy.rules[GUARDRAIL_RUNTIME_BINDINGS[guardrail]] = true;
    }
  }
  return {
    policy,
    policyIntegrity: inspected.integrity,
    policyRevision: inspected.revision,
    policySha256: policy ? sha256Hex(canonicalize(policy)) : null,
    policyReason: inspected.reason,
    control,
    integrityFailure: null
  };
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function severityForScore(score: number): RuntimeFirewallSeverity {
  if (score >= 85) return "critical";
  if (score >= 70) return "high";
  if (score >= 45) return "medium";
  if (score >= 15) return "low";
  return "info";
}

function redactText(text: string, maxChars: number): string {
  const redacted = text
    .replace(SECRET_RE, "[REDACTED_SECRET]")
    .replace(CREDIT_CARD_RE, "[REDACTED_CARD]")
    .replace(SSN_RE, "[REDACTED_SSN]")
    .replace(EMAIL_RE, "[REDACTED_EMAIL]");
  return redacted.length > maxChars ? `${redacted.slice(0, maxChars)}...` : redacted;
}

function collectMatches(content: string, direction: RuntimeFirewallDirection, policy: RuntimeFirewallPolicy): RuntimeFirewallMatch[] {
  const matches: RuntimeFirewallMatch[] = [];
  const add = (match: RuntimeFirewallMatch): void => {
    matches.push(match);
  };

  if (policy.rules.promptInjection && direction === "request" && /(ignore (all )?(previous|prior|system) instructions|reveal (the )?(system|hidden) prompt|jailbreak|developer message|bypass (policy|guardrails)|act as DAN)/i.test(content)) {
    add({
      ruleId: "prompt-injection",
      surface: "Shield",
      severity: "critical",
      scoreImpact: 85,
      reason: "Prompt-injection or instruction-hierarchy bypass language detected."
    });
  }

  if (policy.rules.secretExposure && /(api key|secret|token|private key|password|credential|environment variable)/i.test(content)) {
    add({
      ruleId: direction === "response" ? "secret-exposure-response" : "secret-exposure-request",
      surface: "Vault",
      severity: direction === "response" ? "critical" : "high",
      scoreImpact: direction === "response" ? 90 : 72,
      reason: direction === "response"
        ? "Response appears to expose or discuss sensitive secret material."
        : "Request is attempting to access sensitive secret material."
    });
  }

  if (policy.rules.destructiveAction && direction === "request" && /\b(drop|delete|truncate|revoke|transfer|disable|force push|wipe|destroy)\b/i.test(content) && !/\b(approved|authorized|ticket|workorder|work order|consent)\b/i.test(content)) {
    add({
      ruleId: "destructive-action-without-approval",
      surface: "Enforce",
      severity: "high",
      scoreImpact: 76,
      reason: "Potentially destructive action lacks an approval, ticket, or work-order marker."
    });
  }

  if (policy.rules.piiLeakage && direction === "response" && (EMAIL_RE.test(content) || CREDIT_CARD_RE.test(content) || SSN_RE.test(content))) {
    EMAIL_RE.lastIndex = 0;
    CREDIT_CARD_RE.lastIndex = 0;
    SSN_RE.lastIndex = 0;
    add({
      ruleId: "pii-leakage-response",
      surface: "Comply",
      severity: "medium",
      scoreImpact: 55,
      reason: "Response contains personal-data shaped content that should be reviewed or redacted."
    });
  }

  if (policy.rules.payloadAnomaly && content.length > policy.rules.maxPayloadChars) {
    add({
      ruleId: "payload-size-anomaly",
      surface: "Watch",
      severity: "medium",
      scoreImpact: 35,
      reason: `Payload length ${content.length} exceeds configured max ${policy.rules.maxPayloadChars}.`
    });
  }

  return matches;
}

function candidateActionFor(policy: RuntimeFirewallPolicy, riskScore: number): RuntimeFirewallAction {
  if (riskScore <= 0) return "allow";
  if (riskScore >= policy.thresholds.blockAt) return "block";
  if (riskScore >= policy.thresholds.warnAt) return "warn";
  return "allow";
}

function actionFor(policy: RuntimeFirewallPolicy, candidateAction: RuntimeFirewallAction): RuntimeFirewallAction {
  if (policy.mode === "observe") return "allow";
  if (policy.mode === "warn") return candidateAction === "allow" ? "allow" : "warn";
  return candidateAction;
}

function rolloutSourceIntegrity(resolved: EffectiveRuntimeFirewallPolicy): RuntimeFirewallPolicyInspection["integrity"] {
  if (resolved.integrityFailure) return "invalid";
  if (resolved.policy && (resolved.policyIntegrity === "trusted" || resolved.control.integrity === "trusted")) {
    return "trusted";
  }
  return resolved.policyIntegrity;
}

function eventPath(workspace: string, decisionId: string): string {
  return join(runtimeFirewallEventsDir(workspace), `${decisionId}.json`);
}

function receiptHashFor(decision: Omit<RuntimeFirewallDecision, "links" | "eventPath" | "signaturePath"> & {
  links: Omit<RuntimeFirewallDecision["links"], "receiptSha256">;
}): string {
  return sha256Hex(JSON.stringify(decision));
}

function recordRuntimeRunDecision(input: RuntimeFirewallEvaluateInput, decision: RuntimeFirewallDecision): RuntimeFirewallDecision {
  if (!decision.links.runId) {
    return decision;
  }
  try {
    appendRuntimeRunEvent({
      workspace: input.workspace,
      runId: decision.links.runId,
      agentId: decision.agentId,
      episodeId: decision.links.episodeId,
      lifecycleRunId: decision.links.lifecycleRunId,
      source: input.source,
      type: "policy.decision",
      stage: "runtime.firewall",
      severity: decision.severity,
      message: `Runtime Firewall ${decision.action} decision at risk ${decision.riskScore}.`,
      payload: {
        decisionId: decision.decisionId,
        action: decision.action,
        mode: decision.mode,
        riskScore: decision.riskScore,
        severity: decision.severity,
        reasons: decision.reasons,
        eventPath: decision.eventPath,
        receiptSha256: decision.links.receiptSha256
      },
      links: {
        receiptId: decision.links.receiptId,
        decisionId: decision.decisionId,
        policyDecisionId: decision.decisionId
      },
      createIfMissing: true
    });
  } catch {
    // Runtime Firewall decisions must still return even if the optional run-state store is unavailable.
  }
  return decision;
}

export function evaluateRuntimeFirewall(input: RuntimeFirewallEvaluateInput): RuntimeFirewallDecision {
  if (input.policy !== undefined && input.record !== false) {
    throw new Error("Caller-supplied Runtime Firewall policy may be simulated only; recorded rollout evidence requires the signed workspace policy.");
  }
  const workspace = resolve(input.workspace);
  const resolvedPolicy = resolveEffectiveRuntimeFirewallPolicy(input);
  const loadedPolicy = resolvedPolicy.policy;
  const envRequiresPolicy = process.env.AMC_FIREWALL_ENABLED === "1";
  const requirePolicy = input.requirePolicy === true || envRequiresPolicy;
  const policy = loadedPolicy ?? (requirePolicy ? null : { ...defaultRuntimeFirewallPolicy("observe"), enabled: false });
  const decisionId = `fw_${randomUUID()}`;
  const createdAt = new Date().toISOString();
  const agentId = input.agentId && input.agentId.trim().length > 0 ? input.agentId : "default";

  let matches: RuntimeFirewallMatch[] = [];
  let riskScore = 0;
  let candidateAction: RuntimeFirewallAction = "allow";
  let action: RuntimeFirewallAction = "allow";
  let mode: RuntimeFirewallDecision["mode"] = "disabled";
  let degraded = false;
  let reasons: string[] = [];
  const redaction = loadedPolicy?.redaction ?? defaultRuntimeFirewallPolicy().redaction;

  if (resolvedPolicy.integrityFailure === "control") {
    degraded = true;
    mode = "invalid-control-state";
    candidateAction = "block";
    action = "block";
    riskScore = 100;
    matches = [{
      ruleId: "guardrail-control-state-invalid",
      surface: "Enforce",
      severity: "critical",
      scoreImpact: 100,
      reason: resolvedPolicy.control.reason
    }];
    reasons = matches.map((match) => match.reason);
  } else if (resolvedPolicy.integrityFailure === "policy") {
    degraded = true;
    mode = "invalid-policy";
    candidateAction = "block";
    action = "block";
    riskScore = 100;
    matches = [{
      ruleId: "runtime-firewall-policy-invalid",
      surface: "Enforce",
      severity: "critical",
      scoreImpact: 100,
      reason: resolvedPolicy.policyReason
    }];
    reasons = matches.map((match) => match.reason);
  } else if (!policy) {
    degraded = true;
    mode = "missing-policy";
    candidateAction = "block";
    action = "block";
    riskScore = 100;
    matches = [{
      ruleId: "firewall-policy-missing",
      surface: "Enforce",
      severity: "critical",
      scoreImpact: 100,
      reason: "Runtime Firewall was required but no policy file was found."
    }];
    reasons = matches.map((match) => match.reason);
  } else if (!policy.enabled) {
    mode = "disabled";
    reasons = ["Runtime Firewall is disabled for this workspace."];
  } else {
    mode = policy.mode;
    matches = collectMatches(input.content, input.direction, policy);
    riskScore = clampScore(matches.reduce((max, match) => Math.max(max, match.scoreImpact), 0));
    candidateAction = candidateActionFor(policy, riskScore);
    action = actionFor(policy, candidateAction);
    reasons = matches.length > 0 ? matches.map((match) => match.reason) : ["No runtime firewall rule matched."];
  }

  const rollout: RuntimeFirewallRolloutBinding = {
    schemaVersion: "2026-07-12",
    mode,
    sourceIntegrity: rolloutSourceIntegrity(resolvedPolicy),
    policyRevision: resolvedPolicy.policyRevision,
    policySha256: resolvedPolicy.policySha256,
    thresholds: resolvedPolicy.policy?.thresholds ?? null,
    candidateAction,
    actualAction: action,
    enforcementSuppressed: candidateAction !== action && (mode === "observe" || mode === "warn"),
  };

  const baseDecision = {
    schemaVersion: "2026-07-12" as const,
    decisionId,
    createdAt,
    workspace,
    source: input.source,
    agentId,
    direction: input.direction,
    mode,
    action,
    riskScore,
    severity: severityForScore(riskScore),
    degraded,
    reasons,
    matches,
    redactedPreview: redactText(input.content, redaction.maxPreviewChars),
    request: {
      provider: input.provider ?? null,
      model: input.model ?? null,
      route: input.route ?? null,
      method: input.method ?? null
    },
    guardrailControl: resolvedPolicy.control,
    rollout,
  };
  const receiptId = `fwrec_${sha256Hex(`${decisionId}:${createdAt}`).slice(0, 16)}`;
  const receiptSha256 = receiptHashFor({
    ...baseDecision,
    links: {
      runId: input.runId ?? null,
      episodeId: input.episodeId ?? null,
      lifecycleRunId: input.lifecycleRunId ?? null,
      bridgeRequestId: input.bridgeRequestId ?? null,
      receiptId
    }
  });
  const decision: RuntimeFirewallDecision = {
    ...baseDecision,
    links: {
      runId: input.runId ?? null,
      episodeId: input.episodeId ?? null,
      lifecycleRunId: input.lifecycleRunId ?? null,
      bridgeRequestId: input.bridgeRequestId ?? null,
      receiptId,
      receiptSha256
    },
    eventPath: null,
    signaturePath: null
  };

  const shouldRecord = input.record !== false && (policy?.enabled === true || requirePolicy || matches.length > 0);
  if (!shouldRecord) {
    return decision;
  }

  ensureDir(runtimeFirewallEventsDir(workspace));
  const path = eventPath(workspace, decisionId);
  const withPath: RuntimeFirewallDecision = {
    ...decision,
    eventPath: path
  };
  writeFileAtomic(path, `${JSON.stringify(withPath, null, 2)}\n`, 0o644);
  const signed = trySignArtifactFile({ workspace, path, artifactKind: "runtime-firewall-decision" });
  if (!signed) {
    return recordRuntimeRunDecision(input, withPath);
  }
  const signedDecision: RuntimeFirewallDecision = {
    ...withPath,
    signaturePath: signed.sigPath
  };
  writeFileAtomic(path, `${JSON.stringify(signedDecision, null, 2)}\n`, 0o644);
  const refreshed = trySignArtifactFile({ workspace, path, artifactKind: "runtime-firewall-decision" });
  return recordRuntimeRunDecision(input, {
    ...signedDecision,
    signaturePath: refreshed?.sigPath ?? signed.sigPath
  });
}

export function listRuntimeFirewallDecisions(input: { workspace: string; limit?: number; redacted?: boolean }): RuntimeFirewallDecision[] {
  const dir = runtimeFirewallEventsDir(input.workspace);
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => JSON.parse(readUtf8(join(dir, entry))) as RuntimeFirewallDecision)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, input.limit ?? Number.POSITIVE_INFINITY)
    .map((decision) => input.redacted ? redactRuntimeFirewallDecision(decision) : decision);
}

function redactPath(path: string | null, workspace: string): string | null {
  if (!path) return null;
  const root = resolve(workspace);
  const full = resolve(path);
  if (full === root) return "$WORKSPACE";
  if (full.startsWith(`${root}/`)) return `$WORKSPACE/${full.slice(root.length + 1)}`;
  return path;
}

export function redactRuntimeFirewallDecision(decision: RuntimeFirewallDecision): RuntimeFirewallDecision {
  return {
    ...decision,
    workspace: "$WORKSPACE",
    redactedPreview: redactText(decision.redactedPreview, 700),
    eventPath: redactPath(decision.eventPath, decision.workspace),
    signaturePath: redactPath(decision.signaturePath, decision.workspace)
  };
}

function emptyRolloutCounters(): RuntimeFirewallRolloutCounters {
  return {
    evaluations: 0,
    matchedEvaluations: 0,
    nonMatchedEvaluations: 0,
    candidateAllow: 0,
    wouldWarn: 0,
    wouldBlock: 0,
    actualAllow: 0,
    actualWarn: 0,
    actualBlock: 0,
    enforcementSuppressed: 0,
  };
}

function emptyRuleCounters(): RuntimeFirewallRolloutRuleCounters {
  return {
    matches: 0,
    wouldWarn: 0,
    wouldBlock: 0,
    actualWarn: 0,
    actualBlock: 0,
    enforcementSuppressed: 0,
  };
}

function rolloutCountersConsistent(input: {
  evidence: RuntimeFirewallRolloutEvidenceCounts;
  counters: RuntimeFirewallRolloutCounters;
}): boolean {
  const { evidence, counters } = input;
  return evidence.totalEvaluations === evidence.trustedEvaluations + evidence.invalidEvaluations
    && evidence.trustedEvaluations === (
      evidence.legacyUnclassifiedEvaluations + evidence.otherPolicyEvaluations + counters.evaluations
    )
    && counters.evaluations === counters.matchedEvaluations + counters.nonMatchedEvaluations
    && counters.evaluations === counters.candidateAllow + counters.wouldWarn + counters.wouldBlock
    && counters.evaluations === counters.actualAllow + counters.actualWarn + counters.actualBlock
    && counters.enforcementSuppressed <= counters.wouldWarn + counters.wouldBlock;
}

function rolloutThresholdsEqual(
  left: RuntimeFirewallPolicy["thresholds"] | null,
  right: RuntimeFirewallPolicy["thresholds"] | null,
): boolean {
  return left === null || right === null
    ? left === right
    : left.warnAt === right.warnAt && left.blockAt === right.blockAt;
}

function buildRuntimeFirewallRolloutStatus(input: {
  workspace: string;
  currentPolicy: RuntimeFirewallRolloutStatus["currentPolicy"];
  currentThresholds: RuntimeFirewallPolicy["thresholds"] | null;
}): { rollout: RuntimeFirewallRolloutStatus; latestTrustedDecision: RuntimeFirewallDecision | null } {
  const dir = runtimeFirewallEventsDir(input.workspace);
  const entries = existsSync(dir)
    ? readdirSync(dir).filter((entry) => entry.endsWith(".json")).sort()
    : [];
  const trusted: RuntimeFirewallDecision[] = [];
  let invalidEvaluations = 0;

  for (const entry of entries) {
    const path = join(dir, entry);
    const verification = readAndVerifyArtifactFileSignature({
      workspace: input.workspace,
      path,
      artifactKind: "runtime-firewall-decision",
      requireDomainSeparated: true,
    });
    if (!verification.valid || !verification.artifactBytes) {
      invalidEvaluations += 1;
      continue;
    }
    let value: unknown;
    try {
      const raw = verification.artifactBytes.toString("utf8");
      const document = YAML.parseDocument(raw, { uniqueKeys: true });
      if (document.errors.length > 0) {
        invalidEvaluations += 1;
        continue;
      }
      value = JSON.parse(raw) as unknown;
    } catch {
      invalidEvaluations += 1;
      continue;
    }
    const parsed = storedRuntimeFirewallDecisionSchema.safeParse(value);
    if (!parsed.success) {
      invalidEvaluations += 1;
      continue;
    }
    const decision = parsed.data as RuntimeFirewallDecision;
    const pathBound = decision.eventPath !== null
      && decision.signaturePath !== null
      && resolve(decision.workspace) === resolve(input.workspace)
      && resolve(decision.eventPath) === resolve(path)
      && resolve(decision.signaturePath) === resolve(artifactSigPath(path))
      && basename(path) === `${decision.decisionId}.json`;
    if (!pathBound) {
      invalidEvaluations += 1;
      continue;
    }
    if (decision.schemaVersion === "2026-07-12" && input.currentPolicy.sha256 !== null) {
      const rollout = decision.rollout;
      if (rollout?.policySha256 === input.currentPolicy.sha256 && (
        rollout.mode !== input.currentPolicy.mode
        || rollout.sourceIntegrity !== input.currentPolicy.integrity
        || rollout.policyRevision !== input.currentPolicy.revision
        || !rolloutThresholdsEqual(rollout.thresholds, input.currentThresholds)
      )) {
        invalidEvaluations += 1;
        continue;
      }
    }
    trusted.push(decision);
  }

  const legacy = trusted.filter((decision) => decision.schemaVersion === "2026-05-22");
  const current = trusted.filter((decision) =>
    decision.schemaVersion === "2026-07-12"
    && input.currentPolicy.sha256 !== null
    && decision.rollout?.policySha256 === input.currentPolicy.sha256
  );
  const otherPolicyEvaluations = trusted.length - legacy.length - current.length;
  const evidence: RuntimeFirewallRolloutEvidenceCounts = {
    totalEvaluations: entries.length,
    trustedEvaluations: trusted.length,
    invalidEvaluations,
    legacyUnclassifiedEvaluations: legacy.length,
    otherPolicyEvaluations,
  };
  const counters = emptyRolloutCounters();
  const byRule: Record<string, RuntimeFirewallRolloutRuleCounters> = {};

  for (const decision of current) {
    const rollout = decision.rollout!;
    counters.evaluations += 1;
    if (decision.matches.length > 0) counters.matchedEvaluations += 1;
    else counters.nonMatchedEvaluations += 1;
    if (rollout.candidateAction === "allow") counters.candidateAllow += 1;
    else if (rollout.candidateAction === "warn") counters.wouldWarn += 1;
    else counters.wouldBlock += 1;
    if (decision.action === "allow") counters.actualAllow += 1;
    else if (decision.action === "warn") counters.actualWarn += 1;
    else counters.actualBlock += 1;
    if (rollout.enforcementSuppressed) counters.enforcementSuppressed += 1;

    for (const match of decision.matches) {
      const row = byRule[match.ruleId] ?? emptyRuleCounters();
      row.matches += 1;
      if (rollout.candidateAction === "warn") row.wouldWarn += 1;
      else if (rollout.candidateAction === "block") row.wouldBlock += 1;
      if (decision.action === "warn") row.actualWarn += 1;
      else if (decision.action === "block") row.actualBlock += 1;
      if (rollout.enforcementSuppressed) row.enforcementSuppressed += 1;
      byRule[match.ruleId] = row;
    }
  }

  const currentDates = current.map((decision) => decision.createdAt).sort();
  const unscopedFailClosedEvidence = input.currentPolicy.sha256 === null && trusted.some((decision) =>
    decision.schemaVersion === "2026-07-12"
    && (decision.mode === "missing-policy" || decision.mode === "invalid-policy" || decision.mode === "invalid-control-state")
  );
  const policyUnavailable = input.currentPolicy.mode === "missing-policy"
    || input.currentPolicy.mode === "invalid-policy"
    || input.currentPolicy.mode === "invalid-control-state"
    || (input.currentPolicy.enabled && input.currentPolicy.sha256 === null)
    || unscopedFailClosedEvidence;
  const invariantFailure = !rolloutCountersConsistent({ evidence, counters });
  const reasonCodes: string[] = [];
  if (entries.length === 0) reasonCodes.push("NO_DECISION_EVIDENCE");
  if (policyUnavailable) reasonCodes.push("CURRENT_POLICY_UNAVAILABLE");
  if (invalidEvaluations > 0) reasonCodes.push("INVALID_DECISION_EVIDENCE");
  if (legacy.length > 0) reasonCodes.push("LEGACY_UNCLASSIFIED_EVIDENCE");
  if (otherPolicyEvaluations > 0) reasonCodes.push("HISTORICAL_POLICY_EVIDENCE_EXCLUDED");
  if (input.currentPolicy.enabled && current.length === 0) reasonCodes.push("NO_CURRENT_POLICY_EVIDENCE");
  if (!input.currentPolicy.enabled) reasonCodes.push("CURRENT_POLICY_DISABLED");
  if (invariantFailure) reasonCodes.push("COUNTER_INVARIANT_FAILED");

  const status: RuntimeFirewallRolloutStatus["status"] = policyUnavailable
    || invalidEvaluations > 0
    || invariantFailure
    ? "fail_closed"
    : current.length > 0
      ? "trusted"
      : entries.length > 0
        ? "partial"
        : "empty";
  const latestTrustedDecision = trusted
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
  return {
    rollout: {
      schemaVersion: "2026-07-12",
      status,
      claimEligible: status === "trusted"
        && input.currentPolicy.enabled
        && (input.currentPolicy.mode === "observe" || input.currentPolicy.mode === "warn" || input.currentPolicy.mode === "block"),
      currentPolicy: input.currentPolicy,
      evidence,
      counters,
      byRule: Object.fromEntries(Object.entries(byRule).sort(([left], [right]) => left.localeCompare(right))),
      window: {
        firstEventAt: currentDates[0] ?? null,
        lastEventAt: currentDates.at(-1) ?? null,
      },
      reasonCodes,
      claimBoundary: "Would-warn and would-block counters cover only strict, domain-separated, signature-verified decisions produced by the same exact signed policy hash. They do not authorize promotion or enforcement.",
    },
    latestTrustedDecision,
  };
}

export function runtimeFirewallStatus(workspace: string): {
  enabled: boolean;
  policyPath: string;
  policyExists: boolean;
  policyCommitted: boolean;
  mirrorExists: boolean;
  policyRevision: number | null;
  policyJournalPath: string | null;
  policyCheckpointPath: string | null;
  mode: RuntimeFirewallDecision["mode"];
  integrity: RuntimeFirewallPolicyInspection["integrity"];
  controlIntegrity: RuntimeFirewallDecision["guardrailControl"]["integrity"];
  controlRevision: number | null;
  trusted: boolean;
  reason: string;
  eventCount: number;
  latestDecision: RuntimeFirewallDecision | null;
  rollout: RuntimeFirewallRolloutStatus;
} {
  const inspected = inspectRuntimeFirewallPolicy(workspace);
  const control = inspectGuardrailControlState(workspace);
  const mirrorExists = pathExists(runtimeFirewallPolicyPath(workspace));
  let effective: EffectiveRuntimeFirewallPolicy;
  try {
    effective = resolveEffectiveRuntimeFirewallPolicy({
      workspace,
      content: "",
      direction: "request",
      source: "cli",
      record: false,
    }, { control, policy: inspected });
  } catch (error) {
    effective = {
      policy: null,
      policyIntegrity: "invalid",
      policyRevision: null,
      policySha256: null,
      policyReason: error instanceof Error ? error.message : "Runtime Firewall status evaluation failed.",
      control: {
        integrity: control.integrity,
        revision: control.state?.revision ?? null,
        applied: (control.state?.requestedGuardrails ?? []) as BoundGuardrailName[],
        reason: control.reason,
      },
      integrityFailure: "policy",
    };
  }
  const mode: RuntimeFirewallDecision["mode"] = effective.integrityFailure === "control"
    ? "invalid-control-state"
    : effective.integrityFailure === "policy"
      ? "invalid-policy"
      : effective.policy?.enabled
        ? effective.policy.mode
        : process.env.AMC_FIREWALL_ENABLED === "1"
          ? "missing-policy"
          : "disabled";
  const enabled = effective.policy?.enabled === true
    || process.env.AMC_FIREWALL_ENABLED === "1"
    || effective.integrityFailure !== null;
  const rolloutResult = buildRuntimeFirewallRolloutStatus({
    workspace,
    currentPolicy: {
      integrity: rolloutSourceIntegrity(effective),
      enabled: effective.policy?.enabled === true,
      mode,
      revision: effective.policyRevision,
      sha256: effective.policySha256,
    },
    currentThresholds: effective.policy?.thresholds ?? null,
  });
  return {
    enabled,
    policyPath: runtimeFirewallPolicyPath(workspace),
    policyExists: mirrorExists,
    policyCommitted: inspected.policy !== null,
    mirrorExists,
    policyRevision: inspected.revision,
    policyJournalPath: inspected.journalPath,
    policyCheckpointPath: inspected.checkpointPath,
    mode,
    integrity: effective.policyIntegrity,
    controlIntegrity: effective.control.integrity,
    controlRevision: effective.control.revision,
    trusted: effective.integrityFailure === null && rolloutSourceIntegrity(effective) === "trusted",
    reason: effective.integrityFailure === "control"
      ? effective.control.reason
      : effective.control.applied.length > 0 && effective.policyIntegrity === "uninitialized"
        ? effective.control.reason
        : effective.policyReason,
    eventCount: rolloutResult.rollout.evidence.totalEvaluations,
    latestDecision: rolloutResult.latestTrustedDecision
      ? redactRuntimeFirewallDecision(rolloutResult.latestTrustedDecision)
      : null,
    rollout: rolloutResult.rollout,
  };
}

export function renderRuntimeFirewallStatusText(status: ReturnType<typeof runtimeFirewallStatus>): string {
  const rollout = status.rollout;
  const lines = [
    `Runtime Firewall: ${status.enabled ? "enabled" : "disabled"} (${status.mode})`,
    `Policy journal: ${status.policyCommitted ? status.policyJournalPath : "missing"}`,
    `Compatibility mirror: ${status.mirrorExists ? status.policyPath : "missing"}`,
  ];
  if (status.policyRevision !== null) lines.push(`Revision: ${status.policyRevision}`);
  if (status.policyCheckpointPath) lines.push(`Checkpoint: ${status.policyCheckpointPath}`);
  lines.push(
    `Decisions: ${status.eventCount}`,
    `Rollout evidence: ${rollout.status.replaceAll("_", " ").toUpperCase()} (${rollout.evidence.trustedEvaluations} verified / ${rollout.evidence.totalEvaluations} total)`,
    `Would warn/block: ${rollout.counters.wouldWarn}/${rollout.counters.wouldBlock}`,
    `Actual allow/warn/block: ${rollout.counters.actualAllow}/${rollout.counters.actualWarn}/${rollout.counters.actualBlock}`,
    `Suppressed by mode: ${rollout.counters.enforcementSuppressed}`,
  );
  if (status.latestDecision) {
    lines.push(`Latest: ${status.latestDecision.decisionId} ${status.latestDecision.action} risk=${status.latestDecision.riskScore}`);
  }
  if (rollout.reasonCodes.length > 0) lines.push(`Rollout notes: ${rollout.reasonCodes.join(", ")}`);
  lines.push(`Claim boundary: ${rollout.claimBoundary}`);
  return `${lines.join("\n")}\n`;
}

function splunkLine(decision: RuntimeFirewallDecision): string {
  return JSON.stringify({
    time: Math.floor(Date.parse(decision.createdAt) / 1000),
    sourcetype: "amc:firewall",
    event: {
      decisionId: decision.decisionId,
      action: decision.action,
      candidateAction: decision.rollout?.candidateAction ?? null,
      actualAction: decision.rollout?.actualAction ?? decision.action,
      enforcementSuppressed: decision.rollout?.enforcementSuppressed ?? null,
      policyRevision: decision.rollout?.policyRevision ?? null,
      policySha256: decision.rollout?.policySha256 ?? null,
      severity: decision.severity,
      riskScore: decision.riskScore,
      agentId: decision.agentId,
      direction: decision.direction,
      source: decision.source,
      reasons: decision.reasons,
      runId: decision.links.runId,
      episodeId: decision.links.episodeId,
      lifecycleRunId: decision.links.lifecycleRunId,
      receiptId: decision.links.receiptId,
      receiptSha256: decision.links.receiptSha256
    }
  });
}

export function exportRuntimeFirewallDecisions(input: {
  workspace: string;
  outputPath: string;
  format?: "json" | "jsonl" | "splunk";
  redacted?: boolean;
  limit?: number;
}): RuntimeFirewallExportResult {
  const format = input.format ?? (input.outputPath.endsWith(".json") ? "json" : "jsonl");
  const decisions = listRuntimeFirewallDecisions({
    workspace: input.workspace,
    limit: input.limit,
    redacted: input.redacted ?? true
  });
  const body = format === "json"
    ? `${JSON.stringify({ decisions, total: decisions.length }, null, 2)}\n`
    : format === "splunk"
      ? `${decisions.map(splunkLine).join("\n")}${decisions.length > 0 ? "\n" : ""}`
      : `${decisions.map((decision) => JSON.stringify(decision)).join("\n")}${decisions.length > 0 ? "\n" : ""}`;
  writeFileAtomic(input.outputPath, body, 0o644);
  return {
    outputPath: input.outputPath,
    format,
    redacted: input.redacted ?? true,
    count: decisions.length
  };
}
