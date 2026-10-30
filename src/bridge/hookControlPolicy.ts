import { verifyBudgetsConfigSignature } from "../budgets/budgets.js";
import { loadApprovalPolicy, verifyApprovalPolicySignature } from "../approvals/approvalPolicyEngine.js";
import { runGovernorCheck } from "../governor/governorCli.js";
import { governedCallDenial } from "../tools/guards/governedCallDecision.js";
import { findToolDefinition, loadToolsConfig, validateToolRequest, verifyToolsConfigSignature } from "../toolhub/toolhubValidators.js";
import { verifyActionPolicySignature } from "../governor/actionPolicyEngine.js";
import type { ActionClass, RiskTier } from "../types.js";
import type { ShellCommandConnector, ShellCommandPlan } from "../enforce/shellCommandPlan.js";
import { hookCallRefusal, type CanonicalToolRequest, type HookCall, type HookControlOutcome, type HookProvider } from "./hookProviders.js";
import type { AuthorizationTarget } from "./hookAuthorization.js";

export type CompoundCommandBlastRadiusReasonCode =
  | "SIGNED_AUTHORITY_UNTRUSTED"
  | "COMMAND_PLAN_INVALID"
  | "TOOL_NOT_ALLOWED"
  | "TOOL_ARGUMENTS_REJECTED"
  | "ACTION_POLICY_DENIED"
  | "APPROVAL_QUORUM_UNSUPPORTED"
  | "APPROVAL_REQUIRED"
  | "POLICY_ALLOW"
  | "CONTROL_EVALUATION_FAILED";

export interface CompoundCommandBlastRadiusStep {
  index: number;
  connector: ShellCommandConnector;
  canonicalToolName: string;
  actionClass: ActionClass | null;
  outcome: HookControlOutcome;
  reasonCode: CompoundCommandBlastRadiusReasonCode;
}

export interface CompoundCommandBlastRadiusReview {
  schemaVersion: "2026-07-13";
  parseStatus: "parsed" | "invalid";
  trustStatus: "verified" | "untrusted";
  completeEvaluation: boolean;
  compound: boolean;
  segmentCount: number;
  highestActionClass: ActionClass | null;
  aggregateOutcome: HookControlOutcome;
  decisiveStepIndex: number | null;
  outcomeCounts: Record<HookControlOutcome, number>;
  steps: CompoundCommandBlastRadiusStep[];
  reasonCodes: string[];
  rawCommandStored: false;
  argumentValuesStored: false;
}


export interface NormalizedProviderToolRequest {
  provider: HookProvider;
  actionId: string;
  providerToolName: string;
  canonicalToolName: string | null;
  canonicalRequests: CanonicalToolRequest[];
  commandPlan: ShellCommandPlan | null;
  rawInputSha256: string;
  call: HookCall | null;
  toolInput: Record<string, unknown>;
}

function riskTierFor(actionClass: ActionClass): RiskTier {
  if (actionClass === "READ_ONLY") return "low";
  if (actionClass === "WRITE_LOW") return "med";
  if (actionClass === "WRITE_HIGH" || actionClass === "NETWORK_EXTERNAL") return "high";
  return "critical";
}

const OUTCOME_RANK: Record<HookControlOutcome, number> = {
  allow: 0,
  ask: 1,
  steer: 2,
  deny: 3,
};

const ACTION_CLASS_RANK: Record<ActionClass, number> = {
  READ_ONLY: 0,
  WRITE_LOW: 1,
  WRITE_HIGH: 2,
  NETWORK_EXTERNAL: 2,
  DATA_EXPORT: 3,
  DEPLOY: 3,
  SECURITY: 4,
  FINANCIAL: 4,
  IDENTITY: 4,
};

interface EvaluatedControlStep {
  request: CanonicalToolRequest;
  actionClass: ActionClass | null;
  outcome: HookControlOutcome;
  reason: string;
  reasonCode: CompoundCommandBlastRadiusReasonCode;
}

function emptyOutcomeCounts(): Record<HookControlOutcome, number> {
  return { allow: 0, deny: 0, ask: 0, steer: 0 };
}

function incompleteCommandReview(input: {
  plan: ShellCommandPlan;
  trustStatus: "verified" | "untrusted";
  reasonCodes: string[];
}): CompoundCommandBlastRadiusReview {
  return {
    schemaVersion: "2026-07-13",
    parseStatus: input.plan.status,
    trustStatus: input.trustStatus,
    completeEvaluation: false,
    compound: input.plan.compound,
    segmentCount: input.plan.segments.length,
    highestActionClass: null,
    aggregateOutcome: "deny",
    decisiveStepIndex: null,
    outcomeCounts: emptyOutcomeCounts(),
    steps: [],
    reasonCodes: input.reasonCodes,
    rawCommandStored: false,
    argumentValuesStored: false,
  };
}

function evaluateCanonicalRequest(input: {
  workspace: string;
  agentId: string;
  request: CanonicalToolRequest;
  tools: ReturnType<typeof loadToolsConfig>;
  approvalPolicy: ReturnType<typeof loadApprovalPolicy>;
  engineApprovals: boolean;
}): EvaluatedControlStep {
  const tool = findToolDefinition(input.tools, input.request.name);
  if (!tool) {
    return {
      request: input.request,
      actionClass: null,
      outcome: "deny",
      reason: `Canonical tool ${input.request.name} is not allowed by signed ToolHub config.`,
      reasonCode: "TOOL_NOT_ALLOWED",
    };
  }
  const minimum = input.request.minimumActionClass;
  if (minimum && ACTION_CLASS_RANK[tool.actionClass] < ACTION_CLASS_RANK[minimum]) {
    return { request: input.request, actionClass: tool.actionClass, outcome: "deny", reasonCode: "TOOL_NOT_ALLOWED",
      reason: `Signed ToolHub config gives ${tool.name} ${tool.actionClass}, below the ${minimum} the Pi mapping requires.` };
  }
  if (!input.request.argumentsReviewable) {
    return {
      request: input.request,
      actionClass: tool.actionClass,
      outcome: "steer",
      reason: `Signed ToolHub policy cannot verify the current ${tool.name} argument context.`,
      reasonCode: "TOOL_ARGUMENTS_REJECTED",
    };
  }
  if (!validateToolRequest({ workspace: input.workspace, tool, args: input.request.args }).ok) {
    return { request: input.request, actionClass: tool.actionClass, outcome: "steer", reasonCode: "TOOL_ARGUMENTS_REJECTED",
      reason: `Signed ToolHub policy rejected the current ${tool.name} arguments.` };
  }
  // AXR-01: the checks every governed plane shares, so this call is denied here wherever the native or ToolHub plane denies it.
  const governed = governedCallDenial(input.workspace, { name: tool.name, agentId: input.agentId, actionClass: tool.actionClass, arguments: input.request.args, requestedMode: "EXECUTE" });
  if (governed !== null) {
    return { request: input.request, actionClass: tool.actionClass, outcome: "deny", reasonCode: "ACTION_POLICY_DENIED",
      reason: `Signed AMC policy denied this call (${governed.label}): ${governed.reason}` };
  }

  const governor = runGovernorCheck({
    workspace: input.workspace,
    agentId: input.agentId,
    actionClass: tool.actionClass,
    riskTier: riskTierFor(tool.actionClass),
    mode: "EXECUTE",
  });
  if (!governor.allowed || governor.effectiveMode !== "EXECUTE") {
    return {
      request: input.request,
      actionClass: tool.actionClass,
      outcome: "deny",
      reason: governor.reasons.length > 0
        ? `Signed Action Policy denied native execution: ${governor.reasons.join(" ")}`
        : "Signed Action Policy denied native execution.",
      reasonCode: "ACTION_POLICY_DENIED",
    };
  }

  const approvalRule = input.approvalPolicy.approvalPolicy.actionClasses[tool.actionClass];
  if (!approvalRule) return { request: input.request, actionClass: tool.actionClass, outcome: "deny",
    reason: "Signed Approval Policy has no rule for this action class; control fails closed.", reasonCode: "CONTROL_EVALUATION_FAILED" };
  const requiredApprovals = approvalRule.requiredApprovals;
  if (requiredApprovals > 0) {
    if (!input.engineApprovals && (requiredApprovals !== 1 || approvalRule?.requireDistinctUsers === true)) {
      return {
        request: input.request,
        actionClass: tool.actionClass,
        outcome: "deny",
        reason: `Signed Approval Policy requires ${requiredApprovals} distinct or multi-user approvals and cannot be reduced to one provider-local ask.`,
        reasonCode: "APPROVAL_QUORUM_UNSUPPORTED",
      };
    }
    return {
      request: input.request,
      actionClass: tool.actionClass,
      outcome: "ask",
      reason: `Signed Approval Policy requires ${requiredApprovals} human approval before ${tool.actionClass}.`,
      reasonCode: "APPROVAL_REQUIRED",
    };
  }
  return {
    request: input.request,
    actionClass: tool.actionClass,
    outcome: "allow",
    reason: `Signed AMC policies allow ${tool.actionClass} through ${tool.name}.`,
    reasonCode: "POLICY_ALLOW",
  };
}

function completeCommandReview(
  plan: ShellCommandPlan,
  evaluations: EvaluatedControlStep[],
): CompoundCommandBlastRadiusReview {
  const outcomeCounts = emptyOutcomeCounts();
  for (const evaluation of evaluations) outcomeCounts[evaluation.outcome] += 1;
  const aggregateOutcome = evaluations.reduce<HookControlOutcome>(
    (current, evaluation) => OUTCOME_RANK[evaluation.outcome] > OUTCOME_RANK[current]
      ? evaluation.outcome
      : current,
    "allow",
  );
  const decisiveStepIndex = evaluations.findIndex(
    (evaluation) => evaluation.outcome === aggregateOutcome,
  );
  const actionClasses = evaluations
    .map((evaluation) => evaluation.actionClass)
    .filter((actionClass): actionClass is ActionClass => actionClass !== null);
  const highestActionClass = actionClasses.reduce<ActionClass | null>(
    (current, actionClass) => current === null
      || ACTION_CLASS_RANK[actionClass] > ACTION_CLASS_RANK[current]
      ? actionClass
      : current,
    null,
  );
  return {
    schemaVersion: "2026-07-13",
    parseStatus: "parsed",
    trustStatus: "verified",
    completeEvaluation: true,
    compound: plan.compound,
    segmentCount: plan.segments.length,
    highestActionClass,
    aggregateOutcome,
    decisiveStepIndex: decisiveStepIndex >= 0 ? decisiveStepIndex : null,
    outcomeCounts,
    steps: evaluations.map((evaluation, index) => ({
      index,
      connector: evaluation.request.segment?.connector ?? null,
      canonicalToolName: evaluation.request.name,
      actionClass: evaluation.actionClass,
      outcome: evaluation.outcome,
      reasonCode: evaluation.reasonCode,
    })),
    reasonCodes: [...new Set(evaluations.map((evaluation) => evaluation.reasonCode))],
    rawCommandStored: false,
    argumentValuesStored: false,
  };
}

interface RequestedControlDecision {
  decision: HookControlOutcome;
  reason: string;
  commandBlastRadius: CompoundCommandBlastRadiusReview | null;
  /** The highest-class canonical tool evaluated: what an authorization record for this call names. */
  target?: AuthorizationTarget | null;
  approvals?: AuthorizationTarget[];
}

export function requestedControlDecision(input: {
  workspace: string;
  agentId: string;
  request: NormalizedProviderToolRequest;
}): RequestedControlDecision {
  const versionRefusal = input.request.call ? hookCallRefusal(input.request.call, input.workspace, input.request.providerToolName, input.request.toolInput) : null;
  if (versionRefusal) return { decision: "deny", reason: versionRefusal, commandBlastRadius: null };
  const signatureChecks = [
    ["action policy", verifyActionPolicySignature(input.workspace)],
    ["approval policy", verifyApprovalPolicySignature(input.workspace)],
    ["ToolHub config", verifyToolsConfigSignature(input.workspace)],
    ["budget policy", verifyBudgetsConfigSignature(input.workspace)],
  ] as const;
  for (const [label, check] of signatureChecks) {
    if (!check.valid) {
      return {
        decision: "deny",
        reason: `${label} signature invalid; control fails closed.`,
        commandBlastRadius: input.request.commandPlan
          ? incompleteCommandReview({
              plan: input.request.commandPlan,
              trustStatus: "untrusted",
              reasonCodes: ["SIGNED_AUTHORITY_UNTRUSTED"],
            })
          : null,
      };
    }
  }

  if (input.request.commandPlan?.status === "invalid") {
    return {
      decision: "deny",
      reason: `Provider command syntax is unsupported or invalid: ${input.request.commandPlan.reasonCodes[0] ?? "COMMAND_PLAN_INVALID"}.`,
      commandBlastRadius: incompleteCommandReview({
        plan: input.request.commandPlan,
        trustStatus: "verified",
        reasonCodes: ["COMMAND_PLAN_INVALID", ...input.request.commandPlan.reasonCodes],
      }),
    };
  }
  if (input.request.canonicalRequests.length === 0) {
    return {
      decision: "deny",
      reason: `${input.request.provider === "pi" ? "Pi" : "Provider"} tool ${input.request.providerToolName} is not mapped to an allowed ToolHub tool.`,
      commandBlastRadius: null,
    };
  }

  try {
    const tools = loadToolsConfig(input.workspace);
    const approvalPolicy = loadApprovalPolicy(input.workspace);
    const evaluations = input.request.canonicalRequests.map((request) => evaluateCanonicalRequest({
      workspace: input.workspace,
      agentId: input.agentId,
      request,
      tools,
      approvalPolicy,
      engineApprovals: input.request.provider === "claude-code" || input.request.provider === "gemini-cli",
    }));
    const approvals = evaluations.filter(evaluation => evaluation.outcome === "ask" && evaluation.actionClass !== null)
      .map(evaluation => ({ toolName: evaluation.request.name, actionClass: evaluation.actionClass! }));
    if (!input.request.commandPlan) {
      const evaluation = evaluations[0];
      if (!evaluation) throw new Error("control evaluation produced no result");
      return {
        approvals,
        decision: evaluation.outcome,
        reason: evaluation.reason,
        commandBlastRadius: null,
        target: evaluation.actionClass ? { toolName: evaluation.request.name, actionClass: evaluation.actionClass } : null,
      };
    }
    const review = completeCommandReview(input.request.commandPlan, evaluations);
    const decisive = review.decisiveStepIndex === null
      ? null
      : evaluations[review.decisiveStepIndex] ?? null;
    const reason = review.compound
      ? `Compound command review: ${review.segmentCount} steps; highest action class ${review.highestActionClass ?? "UNKNOWN"}; step ${(review.decisiveStepIndex ?? 0) + 1} requires ${review.aggregateOutcome}.`
      : decisive?.reason ?? "AMC control evaluation failed closed.";
    const top = evaluations.find((evaluation) => evaluation.actionClass === review.highestActionClass);
    const target = top?.actionClass ? { toolName: top.request.name, actionClass: top.actionClass } : null;
    return { decision: review.aggregateOutcome, reason, commandBlastRadius: review, target, approvals };
  } catch {
    return {
      decision: "deny",
      reason: "AMC control evaluation failed closed.",
      commandBlastRadius: input.request.commandPlan
        ? incompleteCommandReview({
            plan: input.request.commandPlan,
            trustStatus: "verified",
            reasonCodes: ["CONTROL_EVALUATION_FAILED"],
          })
        : null,
    };
  }
}

