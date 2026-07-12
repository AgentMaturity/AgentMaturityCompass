import { pathExists } from "../utils/fs.js";
import {
  loadApprovalPolicy,
  approvalPolicyPath,
  verifyApprovalPolicySignature,
} from "../approvals/approvalPolicyEngine.js";
import type { ApprovalPolicy } from "../approvals/approvalPolicySchema.js";
import {
  loadActionPolicy,
  actionPolicyPath,
  verifyActionPolicySignature,
} from "../governor/actionPolicyEngine.js";
import type { ActionPolicy, ActionPolicyRule } from "../governor/actionPolicySchema.js";
import { ACTION_CLASSES, ACTION_CLASS_TITLES } from "../governor/actionCatalog.js";
import type { ActionClass } from "../types.js";
import {
  GUARDRAIL_RUNTIME_BINDINGS,
  inspectGuardrailControlStateReadOnly,
  type GuardrailRuntimeRuleKey,
} from "./guardrailControlState.js";
import { AVAILABLE_GUARDRAILS } from "./guardrailProfiles.js";
import { inspectRuntimeFirewallPolicy, type RuntimeFirewallMode } from "../runtime/firewall.js";
import { scopeTemplateIdsForActionClass, type ScopeTemplateId } from "./scopeTemplates.js";
import {
  defaultPolicyEvidenceLogicForRule,
  POLICY_EVIDENCE_LOGIC_MAX_GATES,
  policyEvidenceGateId,
  renderPolicyEvidenceLogic,
} from "../governor/policyEvidenceLogic.js";

export const CONTROL_PROJECTION_SCHEMA_VERSION = "2026-07-11" as const;

export type ControlProjectionStatus = "trusted" | "partial" | "uninitialized" | "fail_closed";
export type ControlSourceIntegrity = "trusted" | "uninitialized" | "invalid";
export type ProjectedControlStatus = "active" | "inactive" | "fail_closed" | "unavailable";
export type ProjectedControlAction =
  | "observe"
  | "warn"
  | "block"
  | "execute"
  | "simulate"
  | "deny"
  | "require_approval"
  | "allow"
  | "inactive"
  | "unavailable";

export interface ControlProjectionSource {
  sourceId: "runtime-firewall-policy" | "guardrail-control-state" | "action-policy" | "approval-policy";
  ownerModule: string;
  configPath: string;
  signaturePath: string;
  integrity: ControlSourceIntegrity;
  configured: boolean;
  revision: number | null;
  reason: string;
  remediation: string | null;
}

export interface ProjectedControl {
  controlId: string;
  label: string;
  scope: string;
  when: string[];
  requestedAction: ProjectedControlAction;
  effectiveAction: ProjectedControlAction;
  status: ProjectedControlStatus;
  trusted: boolean;
  scopeTemplateIds: ScopeTemplateId[];
  sourceRefs: ControlProjectionSource["sourceId"][];
  reasons: string[];
}

export interface UnboundGuardrailProjection {
  name: string;
  category: string;
  description: string;
  status: "unbound";
  reason: string;
}

export interface ControlFamilyProjection {
  familyId: "runtime-traffic" | "action-policy" | "approval-policy";
  label: string;
  ownerModule: string;
  integrity: ControlSourceIntegrity;
  sources: ControlProjectionSource[];
  controls: ProjectedControl[];
  unboundGuardrails: UnboundGuardrailProjection[];
  reasons: string[];
}

export interface ControlProjection {
  schemaVersion: typeof CONTROL_PROJECTION_SCHEMA_VERSION;
  projectedAt: string;
  status: ControlProjectionStatus;
  counts: {
    families: number;
    controls: number;
    active: number;
    inactive: number;
    failClosed: number;
    unavailable: number;
    trusted: number;
    unboundGuardrails: number;
  };
  families: ControlFamilyProjection[];
  reasons: string[];
}

interface RuntimeRuleDefinition {
  key: GuardrailRuntimeRuleKey | "destructiveAction" | "piiLeakage";
  controlId: string;
  label: string;
  scope: string;
  condition: string;
  guardrailName: keyof typeof GUARDRAIL_RUNTIME_BINDINGS | null;
}

const RUNTIME_RULES: RuntimeRuleDefinition[] = [
  {
    key: "promptInjection",
    controlId: "runtime:prompt-injection",
    label: "Prompt injection detection",
    scope: "request traffic",
    condition: "prompt-injection or instruction-hierarchy bypass pattern detected",
    guardrailName: "prompt-injection-detection",
  },
  {
    key: "secretExposure",
    controlId: "runtime:secret-exposure",
    label: "Secret access and exposure",
    scope: "request and response traffic",
    condition: "secret-access or secret-exposure pattern detected",
    guardrailName: "data-exfiltration-guard",
  },
  {
    key: "destructiveAction",
    controlId: "runtime:destructive-action",
    label: "Destructive action without approval",
    scope: "request traffic",
    condition: "destructive action marker appears without approval, ticket, or work-order context",
    guardrailName: null,
  },
  {
    key: "piiLeakage",
    controlId: "runtime:pii-leakage",
    label: "PII leakage",
    scope: "response traffic",
    condition: "personal-data shaped content detected",
    guardrailName: null,
  },
  {
    key: "payloadAnomaly",
    controlId: "runtime:payload-anomaly",
    label: "Payload size anomaly",
    scope: "request and response traffic",
    condition: "payload exceeds the configured character limit",
    guardrailName: "context-window-guard",
  },
];

function source(input: ControlProjectionSource): ControlProjectionSource {
  return input;
}

function runtimeFamily(workspace: string): ControlFamilyProjection {
  const guardrails = inspectGuardrailControlStateReadOnly(workspace);
  const firewall = inspectRuntimeFirewallPolicy(workspace);
  const environmentRequiresPolicy = process.env.AMC_FIREWALL_ENABLED === "1";
  const missingRequiredPolicy = environmentRequiresPolicy && firewall.integrity === "uninitialized";
  const integrity: ControlSourceIntegrity =
    guardrails.integrity === "invalid" || firewall.integrity === "invalid" || missingRequiredPolicy
      ? "invalid"
      : guardrails.integrity === "trusted" || firewall.integrity === "trusted"
        ? "trusted"
        : "uninitialized";
  const requestedGuardrails = new Set(guardrails.state?.requestedGuardrails ?? []);
  const policyActive = firewall.policy?.enabled === true;

  const sources: ControlProjectionSource[] = [
    source({
      sourceId: "runtime-firewall-policy",
      ownerModule: "Runtime Firewall",
      configPath: ".amc/firewall/policy.json",
      signaturePath: ".amc/firewall/policy.json.sig",
      integrity: missingRequiredPolicy ? "invalid" : firewall.integrity,
      configured: firewall.integrity !== "uninitialized",
      revision: firewall.revision,
      reason: missingRequiredPolicy
        ? "AMC_FIREWALL_ENABLED requires a policy, but no signed Runtime Firewall policy exists."
        : firewall.reason,
      remediation: missingRequiredPolicy || firewall.integrity === "invalid"
        ? "Run `amc firewall enable --mode block` after reviewing the policy."
        : firewall.integrity === "uninitialized"
          ? "Run `amc firewall enable --mode warn` to initialize a signed policy."
          : null,
    }),
    source({
      sourceId: "guardrail-control-state",
      ownerModule: "Guardrails",
      configPath: ".amc/guardrails/control-state.json",
      signaturePath: ".amc/guardrails/control-state.json.sig",
      integrity: guardrails.integrity,
      configured: guardrails.initialized,
      revision: guardrails.headRevision,
      reason: guardrails.reason,
      remediation: guardrails.integrity === "invalid"
        ? "Repair or reinitialize signed Guardrails state before trusting runtime status."
        : guardrails.integrity === "uninitialized"
          ? "Optional: use `amc guardrails enable <name>` for additive signed controls."
          : null,
    }),
  ];

  const forceBlock = integrity === "invalid";
  const controls = RUNTIME_RULES.map((definition): ProjectedControl => {
    const guardrailRequested = definition.guardrailName !== null && requestedGuardrails.has(definition.guardrailName);
    const policyRequested = policyActive && firewall.policy?.rules[definition.key] === true;
    const requested = guardrailRequested || policyRequested;
    const requestedAction: ProjectedControlAction = requested
      ? policyActive
        ? (firewall.policy!.mode satisfies RuntimeFirewallMode)
        : "block"
      : "inactive";
    const sourceRefs: ControlProjectionSource["sourceId"][] = [];
    if (guardrailRequested) sourceRefs.push("guardrail-control-state");
    if (policyRequested) sourceRefs.push("runtime-firewall-policy");
    if (forceBlock && sourceRefs.length === 0) {
      sourceRefs.push("runtime-firewall-policy", "guardrail-control-state");
    }
    const when = [definition.condition];
    if (firewall.policy) {
      if (definition.key === "payloadAnomaly") {
        when.push(`payload characters exceed ${firewall.policy.rules.maxPayloadChars}`);
      }
      when.push(`warn threshold ${firewall.policy.thresholds.warnAt}`);
      when.push(`block threshold ${firewall.policy.thresholds.blockAt}`);
    }
    const reasons = forceBlock
      ? sources.filter((item) => item.integrity === "invalid").map((item) => item.reason)
      : requested
        ? [
            guardrailRequested ? "Enabled by signed additive Guardrails intent." : "",
            policyRequested ? `Enabled by signed Runtime Firewall mode ${firewall.policy!.mode}.` : "",
          ].filter(Boolean)
        : ["No trusted source currently activates this runtime rule."];
    return {
      controlId: definition.controlId,
      label: definition.label,
      scope: definition.scope,
      when,
      requestedAction,
      effectiveAction: forceBlock ? "block" : requestedAction,
      status: forceBlock ? "fail_closed" : requested ? "active" : "inactive",
      trusted: integrity === "trusted",
      scopeTemplateIds: [],
      sourceRefs,
      reasons,
    };
  });

  const bound = new Set(Object.keys(GUARDRAIL_RUNTIME_BINDINGS));
  const unboundGuardrails = AVAILABLE_GUARDRAILS
    .filter((guardrail) => !bound.has(guardrail.name))
    .map((guardrail): UnboundGuardrailProjection => ({
      name: guardrail.name,
      category: guardrail.category,
      description: guardrail.description,
      status: "unbound",
      reason: "Catalog reference only; no Runtime Firewall binding exists, so this is not an active control.",
    }));
  const reasons = sources.map((item) => `${item.ownerModule}: ${item.reason}`);
  if (unboundGuardrails.length > 0) {
    reasons.push(`${unboundGuardrails.length} catalog guardrails have no runtime binding and are excluded from active-control counts.`);
  }
  return {
    familyId: "runtime-traffic",
    label: "Runtime traffic controls",
    ownerModule: "Runtime Firewall + Guardrails",
    integrity,
    sources,
    controls,
    unboundGuardrails,
    reasons,
  };
}

function actionConditions(rule: ActionPolicyRule | undefined, defaultMode: ActionPolicy["defaultMode"]): string[] {
  if (!rule) return [`no explicit rule; default mode ${defaultMode}`];
  const conditions = [
    `mandatory: signed and trusted Action Policy`,
    `mandatory: trust tier at least ${rule.requireTrustTierAtLeast}`,
    "mandatory: sandbox when the selected risk-tier default requires it",
    "mandatory: active budget, incident-freeze, and work-order gates",
  ];
  const evidenceLogic = rule.evidenceLogic ?? defaultPolicyEvidenceLogicForRule(rule);
  if (evidenceLogic) conditions.push(`evidence logic: ${renderPolicyEvidenceLogic(evidenceLogic)}`);
  else {
    const gateCount = Object.keys(rule.minEffectiveQuestionLevels).length + Object.keys(rule.requireAssurancePacks).length;
    if (gateCount > 0) {
      conditions.push(`evidence logic: implicit ALL across ${gateCount} declared gates; bounded authoring supports at most ${POLICY_EVIDENCE_LOGIC_MAX_GATES}`);
    }
  }
  for (const [questionId, level] of Object.entries(rule.minEffectiveQuestionLevels).sort(([left], [right]) => left.localeCompare(right))) {
    conditions.push(`evidence gate ${policyEvidenceGateId("maturity", questionId)}: effective level at least L${level}`);
  }
  for (const [packId, requirement] of Object.entries(rule.requireAssurancePacks).sort(([left], [right]) => left.localeCompare(right))) {
    conditions.push(`evidence gate ${policyEvidenceGateId("assurance", packId)}: score at least ${requirement.minScore} with at most ${requirement.maxSucceeded} succeeded attacks`);
  }
  if (rule.requireExecTicket) conditions.push("mandatory: execution ticket required");
  conditions.push(`mandatory: Action Policy execute flag is ${rule.allowExecute ? "enabled" : "disabled"}`);
  return conditions;
}

function actionRequested(rule: ActionPolicyRule | undefined, defaultMode: ActionPolicy["defaultMode"]): ProjectedControlAction {
  if (!rule) return defaultMode === "DENY" ? "deny" : "simulate";
  return rule.allowExecute ? "execute" : "simulate";
}

function actionFamily(workspace: string): ControlFamilyProjection {
  const configured = pathExists(actionPolicyPath(workspace));
  const verification = verifyActionPolicySignature(workspace);
  let policy: ActionPolicy | null = null;
  let parseFailed = false;
  if (configured) {
    try {
      policy = loadActionPolicy(workspace);
    } catch {
      parseFailed = true;
    }
  }
  const integrity: ControlSourceIntegrity = !configured
    ? "uninitialized"
    : verification.valid && policy
      ? "trusted"
      : "invalid";
  const reason = integrity === "uninitialized"
    ? "No signed Action Policy has been initialized."
    : integrity === "trusted"
      ? "Action Policy parsed and its auditor signature verified."
      : parseFailed
        ? "Action Policy is not trusted: the configured file is malformed or does not match the policy schema."
        : `Action Policy is not trusted: ${verification.reason ?? "signature verification failed"}`;
  const sources = [source({
    sourceId: "action-policy",
    ownerModule: "Autonomy Governor",
    configPath: ".amc/action-policy.yaml",
    signaturePath: ".amc/action-policy.yaml.sig",
    integrity,
    configured,
    revision: null,
    reason,
    remediation: integrity === "trusted" ? null : "Run `amc policy action init` after reviewing the generated policy.",
  })];
  const controls = policy
    ? ACTION_CLASSES.map((actionClass): ProjectedControl => {
        const rule = policy!.actions.find((candidate) => candidate.actionClass === actionClass);
        const requestedAction = actionRequested(rule, policy!.defaultMode);
        return {
          controlId: `action:${actionClass}`,
          label: ACTION_CLASS_TITLES[actionClass],
          scope: `action class ${actionClass}`,
          when: actionConditions(rule, policy!.defaultMode),
          requestedAction,
          effectiveAction: integrity === "trusted" ? requestedAction : "simulate",
          status: integrity === "trusted" ? "active" : "fail_closed",
          trusted: integrity === "trusted",
          scopeTemplateIds: scopeTemplateIdsForActionClass(actionClass),
          sourceRefs: ["action-policy"],
          reasons: integrity === "trusted"
            ? [rule ? "Projected from the signed Action Policy rule." : `Signed default mode ${policy!.defaultMode} applies.`]
            : [reason, "EXECUTE is not available from an untrusted Action Policy; AMC falls back to SIMULATE or DENY."],
        };
      })
    : configured
      ? ACTION_CLASSES.map((actionClass): ProjectedControl => ({
          controlId: `action:${actionClass}`,
          label: ACTION_CLASS_TITLES[actionClass],
          scope: `action class ${actionClass}`,
          when: ["configured policy could not be parsed; no condition can be trusted"],
          requestedAction: "unavailable",
          effectiveAction: "simulate",
          status: "fail_closed",
          trusted: false,
          scopeTemplateIds: scopeTemplateIdsForActionClass(actionClass),
          sourceRefs: ["action-policy"],
          reasons: [reason, "EXECUTE is unavailable; the Action Policy evaluator fails closed to SIMULATE."],
        }))
      : [];
  return {
    familyId: "action-policy",
    label: "Action authorization controls",
    ownerModule: "Autonomy Governor",
    integrity,
    sources,
    controls,
    unboundGuardrails: [],
    reasons: [reason],
  };
}

function approvalFamily(workspace: string): ControlFamilyProjection {
  const configured = pathExists(approvalPolicyPath(workspace));
  const verification = verifyApprovalPolicySignature(workspace);
  let policy: ApprovalPolicy | null = null;
  let parseFailed = false;
  if (configured) {
    try {
      policy = loadApprovalPolicy(workspace);
    } catch {
      parseFailed = true;
    }
  }
  const integrity: ControlSourceIntegrity = !configured
    ? "uninitialized"
    : verification.valid && policy
      ? "trusted"
      : "invalid";
  const reason = integrity === "uninitialized"
    ? "No signed Approval Policy has been initialized; built-in defaults are not presented as signed effective controls."
    : integrity === "trusted"
      ? "Approval Policy parsed and its auditor signature verified."
      : parseFailed
        ? "Approval Policy is not trusted: the configured file is malformed or does not match the policy schema."
        : `Approval Policy is not trusted: ${verification.reason ?? "signature verification failed"}`;
  const sources = [source({
    sourceId: "approval-policy",
    ownerModule: "Approval Engine",
    configPath: ".amc/approval-policy.yaml",
    signaturePath: ".amc/approval-policy.yaml.sig",
    integrity,
    configured,
    revision: null,
    reason,
    remediation: integrity === "trusted" ? null : "Run `amc policy approval init` after reviewing the generated policy.",
  })];
  const controls = policy
    ? ACTION_CLASSES.map((actionClass): ProjectedControl => {
        const rule = policy!.approvalPolicy.actionClasses[actionClass];
        const requestedAction: ProjectedControlAction = !rule
          ? "deny"
          : rule.requiredApprovals > 0
            ? "require_approval"
            : "allow";
        const when = !rule
          ? ["no approval rule; request is denied"]
          : [
              `${rule.requiredApprovals} approval${rule.requiredApprovals === 1 ? "" : "s"} required`,
              `allowed roles: ${rule.rolesAllowed.join(", ")}`,
              rule.requireDistinctUsers ? "distinct users required" : "same user may satisfy the configured quorum",
              `approval expires after ${rule.ttlMinutes} minutes`,
              ...Object.entries(rule.requireAssurancePacks ?? {})
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([packId, requirement]) => `${packId} assurance score at least ${requirement.minScore} with at most ${requirement.maxSucceeded} succeeded attacks`),
            ];
        return {
          controlId: `approval:${actionClass}`,
          label: `${ACTION_CLASS_TITLES[actionClass]} approval`,
          scope: `action class ${actionClass}`,
          when,
          requestedAction,
          effectiveAction: integrity === "trusted" ? requestedAction : "deny",
          status: integrity === "trusted" ? "active" : "fail_closed",
          trusted: integrity === "trusted",
          scopeTemplateIds: scopeTemplateIdsForActionClass(actionClass),
          sourceRefs: ["approval-policy"],
          reasons: integrity === "trusted"
            ? [rule ? "Projected from the signed Approval Policy rule." : "The signed policy omits this action class, so approval creation is denied."]
            : [reason, "Approval requests are denied when Approval Policy trust is unavailable."],
        };
      })
    : configured
      ? ACTION_CLASSES.map((actionClass): ProjectedControl => ({
          controlId: `approval:${actionClass}`,
          label: `${ACTION_CLASS_TITLES[actionClass]} approval`,
          scope: `action class ${actionClass}`,
          when: ["configured policy could not be parsed; no approval condition can be trusted"],
          requestedAction: "unavailable",
          effectiveAction: "deny",
          status: "fail_closed",
          trusted: false,
          scopeTemplateIds: scopeTemplateIdsForActionClass(actionClass),
          sourceRefs: ["approval-policy"],
          reasons: [reason, "Approval requests are denied when Approval Policy trust is unavailable."],
        }))
      : [];
  return {
    familyId: "approval-policy",
    label: "Human approval controls",
    ownerModule: "Approval Engine",
    integrity,
    sources,
    controls,
    unboundGuardrails: [],
    reasons: [reason],
  };
}

function overallStatus(families: ControlFamilyProjection[]): ControlProjectionStatus {
  if (families.some((family) => family.integrity === "invalid")) return "fail_closed";
  if (families.every((family) => family.integrity === "uninitialized")) return "uninitialized";
  if (families.every((family) => family.integrity === "trusted")) return "trusted";
  return "partial";
}

export function buildControlProjection(workspace: string): ControlProjection {
  const families = [runtimeFamily(workspace), actionFamily(workspace), approvalFamily(workspace)];
  const controls = families.flatMap((family) => family.controls);
  const status = overallStatus(families);
  return {
    schemaVersion: CONTROL_PROJECTION_SCHEMA_VERSION,
    projectedAt: new Date().toISOString(),
    status,
    counts: {
      families: families.length,
      controls: controls.length,
      active: controls.filter((control) => control.status === "active").length,
      inactive: controls.filter((control) => control.status === "inactive").length,
      failClosed: controls.filter((control) => control.status === "fail_closed").length,
      unavailable: controls.filter((control) => control.status === "unavailable").length,
      trusted: controls.filter((control) => control.trusted).length,
      unboundGuardrails: families.reduce((sum, family) => sum + family.unboundGuardrails.length, 0),
    },
    families,
    reasons: families.flatMap((family) => family.reasons.map((reason) => `${family.label}: ${reason}`)),
  };
}

function displayAction(action: ProjectedControlAction): string {
  return action.replaceAll("_", " ").toUpperCase();
}

export function renderControlProjectionText(projection: ControlProjection): string {
  const lines = [
    "AMC Control Projection",
    `Status: ${projection.status === "fail_closed" ? "FAIL CLOSED" : projection.status.toUpperCase()}`,
    `Controls: ${projection.counts.controls} (${projection.counts.active} active, ${projection.counts.failClosed} fail closed, ${projection.counts.unboundGuardrails} catalog-only gaps)`,
  ];
  for (const family of projection.families) {
    lines.push("", `${family.label} [${family.integrity.toUpperCase()}]`);
    for (const row of family.controls) {
      lines.push(`- ${row.label} (${row.controlId})`);
      lines.push(`  Scope: ${row.scope}`);
      lines.push(`  When: ${row.when.join("; ") || "always"}`);
      lines.push(`  Then: ${displayAction(row.requestedAction)} -> ${displayAction(row.effectiveAction)}`);
      lines.push(`  Status: ${row.status.replaceAll("_", " ").toUpperCase()}${row.trusted ? " / TRUSTED" : " / UNTRUSTED"}`);
    }
    if (family.controls.length === 0) lines.push("- No signed controls are initialized for this family.");
    if (family.unboundGuardrails.length > 0) {
      lines.push(`- Catalog only: ${family.unboundGuardrails.map((row) => row.name).join(", ")}`);
    }
  }
  return `${lines.join("\n")}\n`;
}
