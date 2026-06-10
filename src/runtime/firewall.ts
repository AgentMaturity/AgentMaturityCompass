import { randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { trySignArtifactFile } from "../lifecycle/artifactSignature.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
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
  schemaVersion: "2026-05-22";
  decisionId: string;
  createdAt: string;
  workspace: string;
  source: "cli" | "studio" | "api" | "bridge" | "gateway" | "sdk";
  agentId: string;
  direction: RuntimeFirewallDirection;
  mode: RuntimeFirewallMode | "disabled" | "missing-policy";
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

export function runtimeFirewallRoot(workspace: string): string {
  return join(workspace, ".amc", "firewall");
}

export function runtimeFirewallPolicyPath(workspace: string): string {
  return join(runtimeFirewallRoot(workspace), "policy.json");
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

export function writeRuntimeFirewallPolicy(input: {
  workspace: string;
  mode?: RuntimeFirewallMode;
  enabled?: boolean;
  failClosedOnMissingPolicy?: boolean;
}): { policy: RuntimeFirewallPolicy; path: string; signaturePath: string | null } {
  const policy: RuntimeFirewallPolicy = {
    ...defaultRuntimeFirewallPolicy(input.mode ?? "warn"),
    enabled: input.enabled ?? true,
    failClosedOnMissingPolicy: input.failClosedOnMissingPolicy ?? true,
    updatedAt: new Date().toISOString()
  };
  const path = runtimeFirewallPolicyPath(input.workspace);
  writeFileAtomic(path, `${JSON.stringify(policy, null, 2)}\n`, 0o644);
  const signed = trySignArtifactFile({ workspace: input.workspace, path, artifactKind: "runtime-firewall-policy" });
  return { policy, path, signaturePath: signed?.sigPath ?? null };
}

export function loadRuntimeFirewallPolicy(workspace: string): RuntimeFirewallPolicy | null {
  const path = runtimeFirewallPolicyPath(workspace);
  if (!pathExists(path)) {
    return null;
  }
  const parsed = JSON.parse(readUtf8(path)) as RuntimeFirewallPolicy;
  return {
    ...defaultRuntimeFirewallPolicy(parsed.mode ?? "warn"),
    ...parsed,
    thresholds: {
      ...defaultRuntimeFirewallPolicy().thresholds,
      ...(parsed.thresholds ?? {})
    },
    rules: {
      ...defaultRuntimeFirewallPolicy().rules,
      ...(parsed.rules ?? {})
    },
    redaction: {
      ...defaultRuntimeFirewallPolicy().redaction,
      ...(parsed.redaction ?? {})
    }
  };
}

export function runtimeFirewallEnabled(workspace: string): boolean {
  if (process.env.AMC_FIREWALL_ENABLED === "1") {
    return true;
  }
  const policy = loadRuntimeFirewallPolicy(workspace);
  return policy?.enabled === true;
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

function actionFor(policy: RuntimeFirewallPolicy, riskScore: number): RuntimeFirewallAction {
  if (riskScore <= 0) return "allow";
  if (policy.mode === "observe") return "allow";
  if (policy.mode === "warn") return riskScore >= policy.thresholds.warnAt ? "warn" : "allow";
  if (riskScore >= policy.thresholds.blockAt) return "block";
  if (riskScore >= policy.thresholds.warnAt) return "warn";
  return "allow";
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
  const workspace = resolve(input.workspace);
  const loadedPolicy = input.policy === undefined ? loadRuntimeFirewallPolicy(workspace) : input.policy;
  const envRequiresPolicy = process.env.AMC_FIREWALL_ENABLED === "1";
  const requirePolicy = input.requirePolicy === true || envRequiresPolicy;
  const policy = loadedPolicy ?? (requirePolicy ? null : { ...defaultRuntimeFirewallPolicy("observe"), enabled: false });
  const decisionId = `fw_${randomUUID()}`;
  const createdAt = new Date().toISOString();
  const agentId = input.agentId && input.agentId.trim().length > 0 ? input.agentId : "default";

  let matches: RuntimeFirewallMatch[] = [];
  let riskScore = 0;
  let action: RuntimeFirewallAction = "allow";
  let mode: RuntimeFirewallDecision["mode"] = "disabled";
  let degraded = false;
  let reasons: string[] = [];
  const redaction = loadedPolicy?.redaction ?? defaultRuntimeFirewallPolicy().redaction;

  if (!policy) {
    degraded = true;
    mode = "missing-policy";
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
    action = actionFor(policy, riskScore);
    reasons = matches.length > 0 ? matches.map((match) => match.reason) : ["No runtime firewall rule matched."];
  }

  const baseDecision = {
    schemaVersion: "2026-05-22" as const,
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
    }
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

export function runtimeFirewallStatus(workspace: string): {
  enabled: boolean;
  policyPath: string;
  policyExists: boolean;
  mode: RuntimeFirewallDecision["mode"];
  eventCount: number;
  latestDecision: RuntimeFirewallDecision | null;
} {
  const policy = loadRuntimeFirewallPolicy(workspace);
  const decisions = listRuntimeFirewallDecisions({ workspace, limit: 1, redacted: true });
  return {
    enabled: policy?.enabled === true || process.env.AMC_FIREWALL_ENABLED === "1",
    policyPath: runtimeFirewallPolicyPath(workspace),
    policyExists: Boolean(policy),
    mode: policy?.enabled ? policy.mode : process.env.AMC_FIREWALL_ENABLED === "1" ? "missing-policy" : "disabled",
    eventCount: listRuntimeFirewallDecisions({ workspace }).length,
    latestDecision: decisions[0] ?? null
  };
}

function splunkLine(decision: RuntimeFirewallDecision): string {
  return JSON.stringify({
    time: Math.floor(Date.parse(decision.createdAt) / 1000),
    sourcetype: "amc:firewall",
    event: {
      decisionId: decision.decisionId,
      action: decision.action,
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
