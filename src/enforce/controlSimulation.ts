import { resolve } from "node:path";
import { z } from "zod";
import {
  evaluateApprovalRequestPolicy,
  loadApprovalPolicy,
  verifyApprovalPolicySignature,
  type ApprovalPolicyConditionResult,
} from "../approvals/approvalPolicyEngine.js";
import { ACTION_CLASS_TITLES, isActionClass } from "../governor/actionCatalog.js";
import { runGovernorCheck } from "../governor/governorCli.js";
import type { GovernorConditionResult } from "../governor/actionPolicyEngine.js";
import {
  evaluateRuntimeFirewall,
  type RuntimeFirewallDirection,
  type RuntimeFirewallMatch,
} from "../runtime/firewall.js";
import type { ActionClass, ExecutionMode, RiskTier } from "../types.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import {
  buildControlProjection,
  type ControlSourceIntegrity,
  type ProjectedControlAction,
} from "./controlProjection.js";

export const CONTROL_SIMULATION_SCHEMA_VERSION = "2026-07-11" as const;

const RUNTIME_CONTROL_RULE_IDS = {
  "runtime:prompt-injection": ["prompt-injection"],
  "runtime:secret-exposure": ["secret-exposure-request", "secret-exposure-response"],
  "runtime:destructive-action": ["destructive-action-without-approval"],
  "runtime:pii-leakage": ["pii-leakage-response"],
  "runtime:payload-anomaly": ["payload-size-anomaly"],
} as const;

type RuntimeControlId = keyof typeof RUNTIME_CONTROL_RULE_IDS;
type ActionControlId = `action:${ActionClass}`;
type ApprovalControlId = `approval:${ActionClass}`;
export type ControlSimulationId = RuntimeControlId | ActionControlId | ApprovalControlId;

export interface ControlSimulationCondition {
  conditionId: string;
  label: string;
  passed: boolean | null;
  actual: string | number | boolean | null;
  expected: string | number | boolean | null;
  reason: string;
}

export interface ControlSimulation {
  schemaVersion: typeof CONTROL_SIMULATION_SCHEMA_VERSION;
  simulatedAt: string;
  familyId: "runtime-traffic" | "action-policy" | "approval-policy";
  controlId: ControlSimulationId;
  label: string;
  sourceIntegrity: ControlSourceIntegrity;
  evaluator: "runtime-firewall" | "action-policy" | "approval-policy";
  evaluatorParity: "production";
  outcome: Exclude<ProjectedControlAction, "inactive" | "unavailable">;
  matched: boolean;
  matchedRuleIds: string[];
  matchedControlIds: ControlSimulationId[];
  conditions: ControlSimulationCondition[];
  reasons: string[];
  inputSha256: string;
  simulationOnly: true;
  recorded: false;
  proofEligible: false;
  failClosed: boolean;
}

const requestBaseSchema = z.object({
  controlId: z.string().trim().min(1).max(100),
  content: z.string().min(1).max(250_000).optional(),
  direction: z.enum(["request", "response"]).optional(),
  agentId: z.string().trim().min(1).max(200).optional(),
  riskTier: z.enum(["low", "med", "high", "critical"]).optional(),
  requestedMode: z.enum(["SIMULATE", "EXECUTE"]).optional(),
  hasExecTicket: z.boolean().optional(),
}).strict();

function normalizeControlId(value: string): string {
  const trimmed = value.trim();
  const separator = trimmed.indexOf(":");
  if (separator < 0) return trimmed;
  const family = trimmed.slice(0, separator).toLowerCase();
  const subject = trimmed.slice(separator + 1);
  return family === "action" || family === "approval"
    ? `${family}:${subject.toUpperCase()}`
    : `${family}:${subject.toLowerCase()}`;
}

function isRuntimeControlId(value: string): value is RuntimeControlId {
  return Object.hasOwn(RUNTIME_CONTROL_RULE_IDS, value);
}

function actionClassForControl(controlId: string, family: "action" | "approval"): ActionClass | null {
  if (!controlId.startsWith(`${family}:`)) return null;
  const candidate = controlId.slice(family.length + 1);
  return isActionClass(candidate) ? candidate : null;
}

export class ControlSimulationInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ControlSimulationInputError";
  }
}

export const controlSimulationRequestSchema = requestBaseSchema.superRefine((request, context) => {
  const controlId = normalizeControlId(request.controlId);
  if (isRuntimeControlId(controlId)) {
    if (request.content === undefined) {
      context.addIssue({ code: "custom", path: ["content"], message: "content is required for Runtime Firewall controls" });
    }
    if (request.direction === undefined) {
      context.addIssue({ code: "custom", path: ["direction"], message: "direction is required for Runtime Firewall controls" });
    }
    for (const key of ["riskTier", "requestedMode", "hasExecTicket"] as const) {
      if (request[key] !== undefined) {
        context.addIssue({ code: "custom", path: [key], message: `${key} is not valid for Runtime Firewall controls` });
      }
    }
    return;
  }

  const actionClass = actionClassForControl(controlId, "action");
  if (actionClass) {
    if (request.riskTier === undefined) {
      context.addIssue({ code: "custom", path: ["riskTier"], message: "riskTier is required for Action Policy controls" });
    }
    if (request.requestedMode === undefined) {
      context.addIssue({ code: "custom", path: ["requestedMode"], message: "requestedMode is required for Action Policy controls" });
    }
    for (const key of ["content", "direction"] as const) {
      if (request[key] !== undefined) {
        context.addIssue({ code: "custom", path: [key], message: `${key} is not valid for Action Policy controls` });
      }
    }
    return;
  }

  const approvalClass = actionClassForControl(controlId, "approval");
  if (approvalClass) {
    for (const key of ["content", "direction", "agentId", "riskTier", "requestedMode", "hasExecTicket"] as const) {
      if (request[key] !== undefined) {
        context.addIssue({ code: "custom", path: [key], message: `${key} is not valid for Approval Policy controls` });
      }
    }
    return;
  }

  context.addIssue({ code: "custom", path: ["controlId"], message: `unknown control: ${controlId}` });
});

export type ControlSimulationRequest = z.infer<typeof controlSimulationRequestSchema>;

function parseRequest(input: ControlSimulationRequest): ControlSimulationRequest & { controlId: ControlSimulationId } {
  const normalized = { ...input, controlId: normalizeControlId(input.controlId) };
  const parsed = controlSimulationRequestSchema.safeParse(normalized);
  if (!parsed.success) {
    throw new ControlSimulationInputError(parsed.error.issues[0]?.message ?? "invalid control simulation request");
  }
  return parsed.data as ControlSimulationRequest & { controlId: ControlSimulationId };
}

function familyIntegrity(workspace: string, familyId: ControlSimulation["familyId"]): ControlSourceIntegrity {
  return buildControlProjection(workspace).families
    .find((family) => family.familyId === familyId)?.integrity ?? "uninitialized";
}

function safeText(value: string, workspace: string): string {
  const root = resolve(workspace);
  return value
    .replaceAll(root, "$WORKSPACE")
    .replace(/(sk-[a-z0-9_-]{8,}|AKIA[0-9A-Z]{16}|xox[baprs]-[a-z0-9-]{8,})/gi, "[REDACTED_SECRET]")
    .slice(0, 1_000);
}

function safeScalar(value: ControlSimulationCondition["actual"], workspace: string): ControlSimulationCondition["actual"] {
  return typeof value === "string" ? safeText(value, workspace) : value;
}

function safeConditions(
  conditions: Array<GovernorConditionResult | ApprovalPolicyConditionResult | ControlSimulationCondition>,
  workspace: string,
): ControlSimulationCondition[] {
  return conditions.map((condition) => ({
    ...condition,
    actual: safeScalar(condition.actual, workspace),
    expected: safeScalar(condition.expected, workspace),
    reason: safeText(condition.reason, workspace),
  }));
}

function baseSimulation(input: {
  workspace: string;
  familyId: ControlSimulation["familyId"];
  controlId: ControlSimulationId;
  evaluator: ControlSimulation["evaluator"];
  label: string;
  sourceIntegrity: ControlSourceIntegrity;
  inputSha256: string;
}): Pick<ControlSimulation,
  "schemaVersion" | "simulatedAt" | "familyId" | "controlId" | "label" | "sourceIntegrity" |
  "evaluator" | "evaluatorParity" | "inputSha256" | "simulationOnly" | "recorded" | "proofEligible"
> {
  return {
    schemaVersion: CONTROL_SIMULATION_SCHEMA_VERSION,
    simulatedAt: new Date().toISOString(),
    familyId: input.familyId,
    controlId: input.controlId,
    label: input.label,
    sourceIntegrity: input.sourceIntegrity,
    evaluator: input.evaluator,
    evaluatorParity: "production",
    inputSha256: input.inputSha256,
    simulationOnly: true,
    recorded: false,
    proofEligible: false,
  };
}

function controlIdForRuntimeRule(ruleId: string): RuntimeControlId | null {
  for (const [controlId, ruleIds] of Object.entries(RUNTIME_CONTROL_RULE_IDS)) {
    if ((ruleIds as readonly string[]).includes(ruleId)) return controlId as RuntimeControlId;
  }
  return null;
}

function runtimeCondition(match: RuntimeFirewallMatch, failClosed: boolean): ControlSimulationCondition {
  return {
    conditionId: match.ruleId,
    label: match.ruleId.replaceAll("-", " "),
    passed: failClosed ? false : true,
    actual: match.scoreImpact,
    expected: "rule matched",
    reason: match.reason,
  };
}

function simulateRuntime(input: {
  workspace: string;
  request: ControlSimulationRequest & { controlId: RuntimeControlId; content: string; direction: RuntimeFirewallDirection };
}): ControlSimulation {
  const sourceIntegrity = familyIntegrity(input.workspace, "runtime-traffic");
  const decision = evaluateRuntimeFirewall({
    workspace: input.workspace,
    content: input.request.content,
    direction: input.request.direction,
    source: "cli",
    agentId: input.request.agentId,
    requirePolicy: true,
    record: false,
  });
  const failClosed = sourceIntegrity !== "trusted" || decision.degraded;
  const matchedControlIds = [...new Set(decision.matches
    .map((match) => controlIdForRuntimeRule(match.ruleId))
    .filter((controlId): controlId is RuntimeControlId => controlId !== null))];
  const matched = matchedControlIds.includes(input.request.controlId);
  const conditions = decision.matches.map((match) => runtimeCondition(match, failClosed));
  if (!matched && !decision.degraded) {
    const selectedRuleId = RUNTIME_CONTROL_RULE_IDS[input.request.controlId][0];
    conditions.push({
      conditionId: selectedRuleId,
      label: selectedRuleId.replaceAll("-", " "),
      passed: false,
      actual: false,
      expected: true,
      reason: `Selected control ${input.request.controlId} did not match this input.`,
    });
  }
  return {
    ...baseSimulation({
      workspace: input.workspace,
      familyId: "runtime-traffic",
      controlId: input.request.controlId,
      evaluator: "runtime-firewall",
      label: input.request.controlId.replace("runtime:", "").replaceAll("-", " "),
      sourceIntegrity,
      inputSha256: sha256Hex(input.request.content),
    }),
    outcome: decision.action,
    matched,
    matchedRuleIds: decision.matches.map((match) => match.ruleId),
    matchedControlIds,
    conditions: safeConditions(conditions, input.workspace),
    reasons: decision.reasons.map((reason) => safeText(reason, input.workspace)),
    failClosed,
  };
}

function simulateAction(input: {
  workspace: string;
  request: ControlSimulationRequest & {
    controlId: ActionControlId;
    riskTier: RiskTier;
    requestedMode: ExecutionMode;
  };
  actionClass: ActionClass;
}): ControlSimulation {
  const sourceIntegrity = familyIntegrity(input.workspace, "action-policy");
  const inputSha256 = sha256Hex(canonicalize({
    controlId: input.request.controlId,
    agentId: input.request.agentId ?? "default",
    riskTier: input.request.riskTier,
    requestedMode: input.request.requestedMode,
    hasExecTicket: input.request.hasExecTicket ?? false,
  }));
  try {
    const decision = runGovernorCheck({
      workspace: input.workspace,
      agentId: input.request.agentId,
      actionClass: input.actionClass,
      riskTier: input.request.riskTier,
      mode: input.request.requestedMode,
      hasExecTicket: input.request.hasExecTicket,
    });
    const matched = sourceIntegrity === "trusted" && decision.matchedRuleId === input.request.controlId;
    const evaluatorTrustFailed = decision.conditionResults.some((condition) =>
      condition.conditionId === "action-policy-signature" && condition.passed === false
    );
    return {
      ...baseSimulation({
        workspace: input.workspace,
        familyId: "action-policy",
        controlId: input.request.controlId,
        evaluator: "action-policy",
        label: ACTION_CLASS_TITLES[input.actionClass],
        sourceIntegrity,
        inputSha256,
      }),
      outcome: decision.allowed ? decision.effectiveMode.toLowerCase() as "simulate" | "execute" : "deny",
      matched,
      matchedRuleIds: [decision.matchedRuleId],
      matchedControlIds: matched ? [input.request.controlId] : [],
      conditions: safeConditions(decision.conditionResults, input.workspace),
      reasons: decision.reasons.map((reason) => safeText(reason, input.workspace)),
      failClosed: sourceIntegrity !== "trusted" || evaluatorTrustFailed,
    };
  } catch {
    const reason = sourceIntegrity === "uninitialized"
      ? "Action Policy is not initialized; EXECUTE is unavailable."
      : "Action Policy cannot be safely evaluated; EXECUTE is unavailable.";
    return {
      ...baseSimulation({
        workspace: input.workspace,
        familyId: "action-policy",
        controlId: input.request.controlId,
        evaluator: "action-policy",
        label: ACTION_CLASS_TITLES[input.actionClass],
        sourceIntegrity,
        inputSha256,
      }),
      outcome: "simulate",
      matched: false,
      matchedRuleIds: [],
      matchedControlIds: [],
      conditions: [{
        conditionId: "action-policy-integrity",
        label: "Trusted Action Policy",
        passed: false,
        actual: sourceIntegrity,
        expected: "trusted",
        reason,
      }],
      reasons: [reason],
      failClosed: true,
    };
  }
}

function simulateApproval(input: {
  workspace: string;
  request: ControlSimulationRequest & { controlId: ApprovalControlId };
  actionClass: ActionClass;
}): ControlSimulation {
  const sourceIntegrity = familyIntegrity(input.workspace, "approval-policy");
  const inputSha256 = sha256Hex(canonicalize({ controlId: input.request.controlId }));
  try {
    const verification = verifyApprovalPolicySignature(input.workspace);
    const evaluation = evaluateApprovalRequestPolicy({
      actionClass: input.actionClass,
      policy: loadApprovalPolicy(input.workspace),
      policySignatureValid: verification.valid,
      policySignatureReason: verification.reason,
    });
    const matched = sourceIntegrity === "trusted" && evaluation.rule !== null;
    return {
      ...baseSimulation({
        workspace: input.workspace,
        familyId: "approval-policy",
        controlId: input.request.controlId,
        evaluator: "approval-policy",
        label: `${ACTION_CLASS_TITLES[input.actionClass]} approval`,
        sourceIntegrity,
        inputSha256,
      }),
      outcome: evaluation.outcome,
      matched,
      matchedRuleIds: matched ? [evaluation.matchedRuleId] : [],
      matchedControlIds: matched ? [input.request.controlId] : [],
      conditions: safeConditions(evaluation.conditionResults, input.workspace),
      reasons: evaluation.reasons.map((reason) => safeText(reason, input.workspace)),
      failClosed: sourceIntegrity !== "trusted" || !evaluation.allowed,
    };
  } catch {
    const reason = sourceIntegrity === "uninitialized"
      ? "Approval Policy is not initialized; approval creation is denied."
      : "Approval Policy cannot be safely evaluated; approval creation is denied.";
    return {
      ...baseSimulation({
        workspace: input.workspace,
        familyId: "approval-policy",
        controlId: input.request.controlId,
        evaluator: "approval-policy",
        label: `${ACTION_CLASS_TITLES[input.actionClass]} approval`,
        sourceIntegrity,
        inputSha256,
      }),
      outcome: "deny",
      matched: false,
      matchedRuleIds: [],
      matchedControlIds: [],
      conditions: [{
        conditionId: "approval-policy-integrity",
        label: "Trusted Approval Policy",
        passed: false,
        actual: sourceIntegrity,
        expected: "trusted",
        reason,
      }],
      reasons: [reason],
      failClosed: true,
    };
  }
}

export function simulateControlDecision(input: ControlSimulationRequest & { workspace: string }): ControlSimulation {
  const { workspace, ...rawRequest } = input;
  const request = parseRequest(rawRequest);
  if (isRuntimeControlId(request.controlId)) {
    return simulateRuntime({
      workspace,
      request: request as typeof request & {
        controlId: RuntimeControlId;
        content: string;
        direction: RuntimeFirewallDirection;
      },
    });
  }
  const actionClass = actionClassForControl(request.controlId, "action");
  if (actionClass) {
    return simulateAction({
      workspace,
      request: request as typeof request & {
        controlId: ActionControlId;
        riskTier: RiskTier;
        requestedMode: ExecutionMode;
      },
      actionClass,
    });
  }
  const approvalClass = actionClassForControl(request.controlId, "approval");
  if (approvalClass) {
    return simulateApproval({
      workspace,
      request: request as typeof request & { controlId: ApprovalControlId },
      actionClass: approvalClass,
    });
  }
  throw new ControlSimulationInputError(`unknown control: ${request.controlId}`);
}

function displayOutcome(outcome: ControlSimulation["outcome"]): string {
  return outcome.replaceAll("_", " ").toUpperCase();
}

export function renderControlSimulationText(simulation: ControlSimulation): string {
  const lines = [
    "AMC Control Simulation",
    `Control: ${simulation.label} (${simulation.controlId})`,
    `Evaluator: ${simulation.evaluator} / ${simulation.evaluatorParity}`,
    `Source integrity: ${simulation.sourceIntegrity.toUpperCase()}`,
    `Outcome: ${displayOutcome(simulation.outcome)}`,
    `Matched: ${simulation.matched ? "YES" : "NO"}`,
    `Simulation only: ${simulation.simulationOnly ? "YES" : "NO"}`,
    `Recorded: ${simulation.recorded ? "YES" : "NO"}`,
    `Proof eligible: ${simulation.proofEligible ? "YES" : "NO"}`,
    `Input SHA-256: ${simulation.inputSha256}`,
    "",
    "Matched conditions:",
  ];
  for (const condition of simulation.conditions) {
    const status = condition.passed === null ? "REQUIRED" : condition.passed ? "PASS" : "FAIL";
    lines.push(`- [${status}] ${condition.conditionId}: ${condition.reason}`);
  }
  if (simulation.conditions.length === 0) lines.push("- None");
  lines.push("", "Reasons:");
  for (const reason of simulation.reasons) lines.push(`- ${reason}`);
  return `${lines.join("\n")}\n`;
}
