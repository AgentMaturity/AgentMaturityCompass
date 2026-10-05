import type { ActionClass, ExecutionMode } from "../types.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export type ToolBlastRadiusDecisionStatus =
  | "not_required"
  | "pending"
  | "approved"
  | "denied"
  | "ticket_accepted"
  | "missing"
  | "blocked";

export interface ToolBlastRadiusImpactSummary {
  resources: string[];
  accounts: string[];
  externalSystems: string[];
  irreversibleEffects: string[];
  dataClasses: string[];
}

export interface ToolBlastRadiusReviewerDecision {
  status: ToolBlastRadiusDecisionStatus;
  approvalRequestId?: string | null;
  decidedBy?: string | null;
  reason?: string | null;
}

export interface ToolBlastRadiusExecutedScope {
  toolName: string;
  actionClass: ActionClass;
  effectiveMode: ExecutionMode;
  simulated: boolean;
  resources: string[];
  accounts: string[];
  externalSystems: string[];
  command?: string | null;
  httpMethod?: string | null;
  workOrderId?: string | null;
}

export interface ToolBlastRadiusConsent {
  source: "toolhub";
  intentId: string;
  agentId: string;
  toolName: string;
  actionClass: ActionClass;
  requestedMode: ExecutionMode;
  effectiveMode: ExecutionMode;
  highImpact: boolean;
  consentPrompt: string;
  impactSummary: ToolBlastRadiusImpactSummary;
  reviewerDecision: ToolBlastRadiusReviewerDecision;
  executedScope: ToolBlastRadiusExecutedScope | null;
  metadataOnlyAccepted: false;
}

export interface ToolBlastRadiusValidation {
  ok: boolean;
  reasons: string[];
}

const HIGH_IMPACT_ACTIONS = new Set<ActionClass>([
  "WRITE_HIGH",
  "DEPLOY",
  "SECURITY",
  "FINANCIAL",
  "NETWORK_EXTERNAL",
  "DATA_EXPORT",
  "IDENTITY"
]);

function cleanList(values: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text.length > 0 && !out.includes(text)) {
      out.push(text);
    }
  }
  return out;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(String).filter((entry) => entry.trim().length > 0);
}

function urlHost(value: unknown): string | null {
  try {
    const url = new URL(String(value ?? ""));
    return url.hostname;
  } catch {
    return null;
  }
}

export function isHighImpactAction(actionClass: ActionClass): boolean {
  return HIGH_IMPACT_ACTIONS.has(actionClass);
}

export function summarizeToolBlastRadius(params: {
  toolName: string;
  actionClass: ActionClass;
  args: Record<string, unknown>;
}): ToolBlastRadiusImpactSummary {
  const resources: string[] = [];
  const accounts: string[] = [];
  const externalSystems: string[] = [];
  const irreversibleEffects: string[] = [];
  const dataClasses: string[] = [];
  const cwd = String(params.args.cwd ?? "").trim();

  if (cwd.length > 0) {
    resources.push(`cwd:${cwd}`);
  }
  if (params.toolName === "fs.read" || params.toolName === "fs.write") {
    resources.push(`path:${String(params.args.path ?? "")}`);
    dataClasses.push(params.toolName === "fs.read" ? "file-read" : "file-write");
  }
  if (params.toolName.startsWith("git.")) {
    resources.push(cwd.length > 0 ? `repository:${cwd}` : "repository:workspace");
  }
  if (params.toolName === "http.fetch") {
    const host = urlHost(params.args.url);
    if (host) {
      externalSystems.push(host);
    }
    dataClasses.push("network-request");
  }
  if (params.toolName === "process.spawn") {
    resources.push(`binary:${String(params.args.binary ?? "")}`);
    dataClasses.push("process-execution");
  }
  if (params.args.env && typeof params.args.env === "object") {
    const envKeys = Object.keys(params.args.env as Record<string, unknown>);
    accounts.push(...envKeys.map((key) => `env:${key}`));
  }

  switch (params.actionClass) {
    case "WRITE_HIGH":
      irreversibleEffects.push("Can run high-impact local actions or mutate state outside low-impact write lanes.");
      break;
    case "DEPLOY":
      irreversibleEffects.push("Can publish commits, releases, or deployment state to shared systems.");
      break;
    case "SECURITY":
      irreversibleEffects.push("Can alter controls, credentials, policies, or security posture.");
      break;
    case "FINANCIAL":
      irreversibleEffects.push("Can affect billing, spend, payments, or financial records.");
      break;
    case "NETWORK_EXTERNAL":
      irreversibleEffects.push("Can transmit request metadata or payloads to an external system.");
      break;
    case "DATA_EXPORT":
      irreversibleEffects.push("Can move data outside the governed workspace boundary.");
      break;
    case "IDENTITY":
      irreversibleEffects.push("Can affect users, roles, accounts, or identity state.");
      break;
    case "WRITE_LOW":
      irreversibleEffects.push("Can write workspace output that may influence later runs.");
      break;
    case "READ_ONLY":
      break;
  }

  return {
    resources: cleanList(resources),
    accounts: cleanList(accounts),
    externalSystems: cleanList(externalSystems),
    irreversibleEffects: cleanList(irreversibleEffects),
    dataClasses: cleanList(dataClasses)
  };
}

export function buildToolBlastRadiusPrompt(params: {
  toolName: string;
  actionClass: ActionClass;
  requestedMode: ExecutionMode;
  impactSummary: ToolBlastRadiusImpactSummary;
}): string {
  const resources = params.impactSummary.resources.length > 0 ? params.impactSummary.resources.join(", ") : "none declared";
  const systems =
    params.impactSummary.externalSystems.length > 0 ? params.impactSummary.externalSystems.join(", ") : "none declared";
  const effects =
    params.impactSummary.irreversibleEffects.length > 0
      ? params.impactSummary.irreversibleEffects.join(" ")
      : "No irreversible effect declared.";
  return [
    `Review ${params.toolName} before ${params.requestedMode}.`,
    `Action class: ${params.actionClass}.`,
    `Resources: ${resources}.`,
    `External systems: ${systems}.`,
    `Potential impact: ${effects}`
  ].join(" ");
}

export function buildToolBlastRadiusConsent(params: {
  intentId: string;
  agentId: string;
  toolName: string;
  actionClass: ActionClass;
  args: Record<string, unknown>;
  requestedMode: ExecutionMode;
  effectiveMode: ExecutionMode;
  approvalRequired: boolean;
  reviewerDecision?: ToolBlastRadiusReviewerDecision;
  executedScope?: ToolBlastRadiusExecutedScope | null;
}): ToolBlastRadiusConsent {
  const impactSummary = summarizeToolBlastRadius({
    toolName: params.toolName,
    actionClass: params.actionClass,
    args: params.args
  });
  const highImpact = isHighImpactAction(params.actionClass);
  const reviewerDecision =
    params.reviewerDecision ??
    (params.requestedMode === "EXECUTE" && (highImpact || params.approvalRequired)
      ? { status: "pending" as const }
      : { status: "not_required" as const });

  return {
    source: "toolhub",
    intentId: params.intentId,
    agentId: params.agentId,
    toolName: params.toolName,
    actionClass: params.actionClass,
    requestedMode: params.requestedMode,
    effectiveMode: params.effectiveMode,
    highImpact,
    consentPrompt: buildToolBlastRadiusPrompt({
      toolName: params.toolName,
      actionClass: params.actionClass,
      requestedMode: params.requestedMode,
      impactSummary
    }),
    impactSummary,
    reviewerDecision,
    executedScope: params.executedScope ?? null,
    metadataOnlyAccepted: false
  };
}

export function buildToolExecutedScope(params: {
  toolName: string;
  actionClass: ActionClass;
  args: Record<string, unknown>;
  effectiveMode: ExecutionMode;
  workOrderId?: string | null;
}): ToolBlastRadiusExecutedScope {
  const impactSummary = summarizeToolBlastRadius({
    toolName: params.toolName,
    actionClass: params.actionClass,
    args: params.args
  });
  const argv = asStringArray(params.args.argv);
  const binary = String(params.args.binary ?? "").trim();
  const command = binary.length > 0 ? cleanList([binary, ...argv]).join(" ") : null;
  const method = params.toolName === "http.fetch" ? String(params.args.method ?? "GET").toUpperCase() : null;

  return {
    toolName: params.toolName,
    actionClass: params.actionClass,
    effectiveMode: params.effectiveMode,
    simulated: params.effectiveMode !== "EXECUTE",
    resources: impactSummary.resources,
    accounts: impactSummary.accounts,
    externalSystems: impactSummary.externalSystems,
    command,
    httpMethod: method,
    workOrderId: params.workOrderId ?? null
  };
}

export function withToolBlastRadiusDecision(
  consent: ToolBlastRadiusConsent,
  reviewerDecision: ToolBlastRadiusReviewerDecision,
  executedScope?: ToolBlastRadiusExecutedScope | null
): ToolBlastRadiusConsent {
  return {
    ...consent,
    reviewerDecision,
    executedScope: executedScope ?? consent.executedScope
  };
}

export function hashToolBlastRadiusConsent(consent: ToolBlastRadiusConsent): string {
  return sha256Hex(canonicalize(consent));
}

export function validateToolBlastRadiusConsent(consent: {
  source?: unknown;
  intentId?: unknown;
  agentId?: unknown;
  toolName?: unknown;
  actionClass?: unknown;
  requestedMode?: unknown;
  effectiveMode?: unknown;
  highImpact?: unknown;
  consentPrompt?: unknown;
  impactSummary?: Partial<ToolBlastRadiusImpactSummary> | null;
  reviewerDecision?: Partial<ToolBlastRadiusReviewerDecision> | null;
  executedScope?: Partial<ToolBlastRadiusExecutedScope> | null;
  metadataOnlyAccepted?: unknown;
}): ToolBlastRadiusValidation {
  const reasons: string[] = [];
  const prompt = String(consent.consentPrompt ?? "").trim();
  const highImpact = consent.highImpact === true;
  const requestedMode = String(consent.requestedMode ?? "SIMULATE").toUpperCase();
  const effectiveMode = String(consent.effectiveMode ?? "SIMULATE").toUpperCase();
  const impact = consent.impactSummary;
  const reviewerDecision = consent.reviewerDecision;
  const executedScope = consent.executedScope;

  if (consent.source !== "toolhub") {
    reasons.push("source must be toolhub");
  }
  if (String(consent.intentId ?? "").trim().length === 0) {
    reasons.push("intent id missing");
  }
  if (String(consent.agentId ?? "").trim().length === 0) {
    reasons.push("agent id missing");
  }
  if (String(consent.toolName ?? "").trim().length === 0) {
    reasons.push("tool name missing");
  }
  if (prompt.length < 20) {
    reasons.push("consent prompt missing");
  }
  if (consent.metadataOnlyAccepted === true) {
    reasons.push("metadata-only consent evidence is not accepted");
  }
  if (!impact || !Array.isArray(impact.resources) || impact.resources.length === 0) {
    reasons.push("impact resources missing");
  }
  if (!reviewerDecision || String(reviewerDecision.status ?? "").trim().length === 0) {
    reasons.push("reviewer decision missing");
  }

  if (highImpact && requestedMode === "EXECUTE" && effectiveMode === "EXECUTE") {
    if (!impact || !Array.isArray(impact.irreversibleEffects) || impact.irreversibleEffects.length === 0) {
      reasons.push("irreversible effects missing for high-impact execution");
    }
    const decision = reviewerDecision?.status;
    if (decision !== "approved" && decision !== "ticket_accepted") {
      reasons.push("approved reviewer decision missing for high-impact execution");
    }
    if (!executedScope) {
      reasons.push("executed scope missing for high-impact execution");
    } else {
      if (!Array.isArray(executedScope.resources) || executedScope.resources.length === 0) {
        reasons.push("executed scope resources missing");
      }
      if (executedScope.simulated === true) {
        reasons.push("executed scope cannot be simulated for high-impact execution");
      }
    }
  }

  return {
    ok: reasons.length === 0,
    reasons
  };
}
