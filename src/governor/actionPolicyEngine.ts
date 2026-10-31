import { readdirSync } from "node:fs";
import { join } from "node:path";
import { openLedger } from "../ledger/ledger.js";
import {
  type ActionClass,
  type DiagnosticReport,
  type ExecutionMode,
  type RiskTier,
  type TargetProfile,
  type TrustTier
} from "../types.js";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { DEFAULT_RUN_INTEGRITY_AT_LEAST, runIntegrityAtLeast, type ActionPolicy, type ActionPolicyRule, type TrustTierAtLeast } from "./actionPolicySchema.js";
import { getAgentPaths } from "../fleet/paths.js";
import { latestTrustedRun } from "./runTrust.js";
import { defaultActionPolicy } from "./actionPolicyStore.js";
export { latestTrustedRun } from "./runTrust.js";
export { ACTION_POLICY_WRITER_LOCK, actionPolicyWriterPendingPath, assertActionPolicyWriterReady,
  actionPolicyPath, actionPolicySigPath, defaultActionPolicy, loadActionPolicy,
  signActionPolicyWithLockHeld, signActionPolicy, initActionPolicy, initActionPolicyAsync, prepareActionPolicyPair, verifyActionPolicySignature } from "./actionPolicyStore.js";
import {
  evaluatePolicyEvidenceLogic,
  policyEvidenceGateId,
} from "./policyEvidenceLogic.js";

export interface GovernorAssurancePackStatus {
  score: number;
  succeeded: number;
  observed: boolean;
}

export interface GovernorAssuranceSummary {
  packs: Record<string, GovernorAssurancePackStatus>;
}

export interface GovernorTrustSummary {
  trustTier: TrustTier;
  sandboxEvidence: boolean;
  /**
   * A hard gate no rule waives: the run history is refused (`runRefusal`), or the latest trusted run failed ledger
   * verification, is not VALID or violated the trust boundary (`runTrustGap`). Callers OR in their own signature failures
   * (ToolHub: `!configTrusted`; the runner: `anyUntrustedConfig`). Never set for a merely missing or low-integrity run:
   * that is the rule's `run-integrity` condition.
   */
  untrustedConfig: boolean;
  correlationRatio: number;
  /** Why the latest run file was not used (seal, agent or ledger anchor failed); absent when nothing was refused. */
  runRefusal?: string;
  /** With `untrustedConfig` from the run: why the latest trusted run cannot vouch at any threshold. */
  runTrustGap?: string;
}

export interface GovernorWorkOrderContext {
  workOrderId: string;
  riskTier: RiskTier;
  allowedActionClasses: ActionClass[];
}

export interface GovernorDecisionInput {
  agentId: string;
  actionClass: ActionClass;
  riskTier: RiskTier;
  currentDiagnosticRun: DiagnosticReport | null;
  targetProfile: TargetProfile | null;
  trustSummary: GovernorTrustSummary;
  assuranceSummary: GovernorAssuranceSummary;
  workOrder?: GovernorWorkOrderContext;
  requestedMode: ExecutionMode;
  hasExecTicket?: boolean;
  freezeStatus?: {
    active: boolean;
    actionClasses: ActionClass[];
  };
  budgetStatus?: {
    ok: boolean;
    reasons: string[];
    exceededActionClasses: ActionClass[];
    budgetConfigValid: boolean;
  };
  policy?: ActionPolicy;
  policySignatureValid?: boolean;
}

export interface GovernorUpgradeSuggestion {
  questionId: string;
  fromLevel: number;
  toLevel: number;
  why: string;
  how: string;
}

export interface GovernorConditionResult {
  conditionId: string;
  label: string;
  passed: boolean | null;
  actual: string | number | boolean | null;
  expected: string | number | boolean | null;
  reason: string;
}

export interface GovernorDecision {
  allowed: boolean;
  effectiveMode: ExecutionMode;
  matchedRuleId: string;
  conditionResults: GovernorConditionResult[];
  reasons: string[];
  requiredEvidence: string[];
  upgradeSuggestions: GovernorUpgradeSuggestion[];
  requiredApprovals: string[];
  requiredExecTicket: boolean;
}

const TRUST_RANK: Record<TrustTierAtLeast | TrustTier, number> = {
  SELF_REPORTED: 1,
  ATTESTED: 2,
  OBSERVED: 3,
  OBSERVED_HARDENED: 4
};

function findRule(policy: ActionPolicy, actionClass: ActionClass): ActionPolicyRule | null {
  return policy.actions.find((rule) => rule.actionClass === actionClass) ?? null;
}

function effectiveLevelForQuestion(run: DiagnosticReport | null, target: TargetProfile | null, questionId: string): number {
  const current = run?.questionScores.find((row) => row.questionId === questionId)?.finalLevel ?? 0;
  const desired = target?.mapping[questionId];
  if (typeof desired !== "number") {
    return current;
  }
  return Math.min(current, desired);
}

function normalizeRiskTier(riskTier: RiskTier): "low" | "medium" | "high" | "critical" {
  if (riskTier === "med") {
    return "medium";
  }
  return riskTier;
}

function compareTrustTier(actual: TrustTier, required: TrustTierAtLeast): boolean {
  return TRUST_RANK[actual] >= TRUST_RANK[required];
}

function newDecision(mode: ExecutionMode, matchedRuleId: string): GovernorDecision {
  return {
    allowed: false,
    effectiveMode: mode,
    matchedRuleId,
    conditionResults: [],
    reasons: [],
    requiredEvidence: [],
    upgradeSuggestions: [],
    requiredApprovals: [],
    requiredExecTicket: false
  };
}

function addCondition(decision: GovernorDecision, condition: GovernorConditionResult): void {
  decision.conditionResults.push(condition);
}

function evaluateRuleEvidence(
  input: GovernorDecisionInput,
  rule: ActionPolicyRule,
  decision: GovernorDecision,
): string[] {
  const issues: string[] = [];
  const evidenceGateResults: Record<string, boolean> = {};
  const evidenceFailures: Array<{
    gateId: string;
    issue: string;
    requiredEvidence?: string;
    upgradeSuggestion?: GovernorUpgradeSuggestion;
  }> = [];

  for (const [questionId, minLevel] of Object.entries(rule.minEffectiveQuestionLevels)) {
    const effective = effectiveLevelForQuestion(input.currentDiagnosticRun, input.targetProfile, questionId);
    const gateId = policyEvidenceGateId("maturity", questionId);
    evidenceGateResults[gateId] = effective >= minLevel;
    addCondition(decision, {
      conditionId: gateId,
      label: `${questionId} effective maturity`,
      passed: effective >= minLevel,
      actual: effective,
      expected: minLevel,
      reason: effective >= minLevel
        ? `${questionId} effective level ${effective} satisfies required ${minLevel}.`
        : `${questionId} effective level ${effective} < required ${minLevel}.`,
    });
    if (effective < minLevel) {
      evidenceFailures.push({
        gateId,
        issue: `${questionId} effective level ${effective} < required ${minLevel}`,
        upgradeSuggestion: {
          questionId,
          fromLevel: effective,
          toLevel: minLevel,
          why: `${input.actionClass} requires stronger maturity before EXECUTE is allowed.`,
          how: "Collect deterministic evidence to satisfy the next gate and update owner target if needed."
        },
      });
    }
  }

  for (const [packId, requirement] of Object.entries(rule.requireAssurancePacks)) {
    const pack = input.assuranceSummary.packs[packId];
    const gateId = policyEvidenceGateId("assurance", packId);
    const gatePassed = pack !== undefined
      && pack.score >= requirement.minScore
      && pack.succeeded <= requirement.maxSucceeded;
    evidenceGateResults[gateId] = gatePassed;
    addCondition(decision, {
      conditionId: `assurance:${packId}:present`,
      label: `${packId} assurance evidence present`,
      passed: Boolean(pack),
      actual: Boolean(pack),
      expected: true,
      reason: pack ? `Assurance pack ${packId} is present.` : `Assurance pack ${packId} is missing.`,
    });
    if (!pack) {
      evidenceFailures.push({
        gateId,
        issue: `assurance pack ${packId} missing`,
        requiredEvidence: `Run assurance pack '${packId}' and collect OBSERVED evidence.`,
      });
      continue;
    }
    addCondition(decision, {
      conditionId: `assurance:${packId}:score`,
      label: `${packId} minimum score`,
      passed: pack.score >= requirement.minScore,
      actual: pack.score,
      expected: requirement.minScore,
      reason: pack.score >= requirement.minScore
        ? `Assurance pack ${packId} score ${pack.score.toFixed(1)} satisfies ${requirement.minScore}.`
        : `Assurance pack ${packId} score ${pack.score.toFixed(1)} < ${requirement.minScore}.`,
    });
    addCondition(decision, {
      conditionId: `assurance:${packId}:succeeded`,
      label: `${packId} maximum succeeded attacks`,
      passed: pack.succeeded <= requirement.maxSucceeded,
      actual: pack.succeeded,
      expected: requirement.maxSucceeded,
      reason: pack.succeeded <= requirement.maxSucceeded
        ? `Assurance pack ${packId} has ${pack.succeeded} succeeded attacks, within the maximum ${requirement.maxSucceeded}.`
        : `Assurance pack ${packId} has ${pack.succeeded} succeeded attacks above maximum ${requirement.maxSucceeded}.`,
    });
    if (pack.score < requirement.minScore) {
      evidenceFailures.push({
        gateId,
        issue: `assurance pack ${packId} score ${pack.score.toFixed(1)} < ${requirement.minScore}`,
      });
    }
    if (pack.succeeded > requirement.maxSucceeded) {
      evidenceFailures.push({
        gateId,
        issue: `assurance pack ${packId} has ${pack.succeeded} *_SUCCEEDED violations`,
      });
    }
  }

  if (!rule.evidenceLogic) {
    if (Object.values(evidenceGateResults).every((passed) => passed)) return issues;
    for (const failure of evidenceFailures) {
      issues.push(failure.issue);
      if (failure.requiredEvidence) decision.requiredEvidence.push(failure.requiredEvidence);
      if (failure.upgradeSuggestion) decision.upgradeSuggestions.push(failure.upgradeSuggestion);
    }
    return issues;
  }
  const effectiveEvidenceLogic = rule.evidenceLogic;
  const evidenceEvaluation = evaluatePolicyEvidenceLogic(effectiveEvidenceLogic, evidenceGateResults);
  if (rule.evidenceLogic) {
    for (const node of evidenceEvaluation.nodes.filter((candidate) => candidate.nodeType !== "gate")) {
      const rootNode = node.path === "$logic";
      addCondition(decision, {
        conditionId: rootNode ? "evidence-logic" : `evidence-logic:${node.path.slice("$logic.".length)}`,
        label: rootNode ? "Action Policy evidence logic" : `${node.nodeType.toUpperCase()} evidence group`,
        passed: node.passed,
        actual: node.passed,
        expected: true,
        reason: `${node.nodeType.toUpperCase()} evidence group ${node.passed ? "is satisfied" : "is not satisfied"}.`,
      });
    }
  }
  if (evidenceEvaluation.passed) return issues;

  if (rule.evidenceLogic) issues.push("Action Policy evidence logic is not satisfied.");
  const blockingGateIds = new Set(evidenceEvaluation.blockingGateIds);
  for (const failure of evidenceFailures) {
    if (!blockingGateIds.has(failure.gateId)) continue;
    issues.push(failure.issue);
    if (failure.requiredEvidence) decision.requiredEvidence.push(failure.requiredEvidence);
    if (failure.upgradeSuggestion) decision.upgradeSuggestions.push(failure.upgradeSuggestion);
  }
  for (const gateId of evidenceEvaluation.unknownGateIds) {
    issues.push(`evidence gate ${gateId} did not produce a trusted boolean result`);
  }
  return issues;
}

export function evaluateActionPermission(input: GovernorDecisionInput): GovernorDecision {
  const policy = input.policy ?? defaultActionPolicy();
  const rule = findRule(policy, input.actionClass);
  const decision = newDecision(
    input.requestedMode,
    rule ? `action:${input.actionClass}` : `action:default:${policy.defaultMode}`,
  );
  const policySignatureValid = input.policySignatureValid ?? true;
  const trustedConfig = policySignatureValid && !input.trustSummary.untrustedConfig;
  // A refused or unverifiable run history; a merely missing or low-integrity run is the rule's `run-integrity` condition.
  const runCause = input.trustSummary.runRefusal ?? input.trustSummary.runTrustGap;

  addCondition(decision, {
    conditionId: "action-policy-rule",
    label: "Explicit action rule",
    passed: rule !== null,
    actual: rule ? `action:${input.actionClass}` : `default:${policy.defaultMode}`,
    expected: `action:${input.actionClass}`,
    reason: rule
      ? `Matched the explicit ${input.actionClass} Action Policy rule.`
      : `No explicit ${input.actionClass} rule; signed default mode ${policy.defaultMode} applies.`,
  });
  addCondition(decision, {
    conditionId: "action-policy-signature",
    label: "Signed Action Policy configuration",
    passed: trustedConfig,
    actual: trustedConfig,
    expected: true,
    reason: trustedConfig ? "Action Policy and dependent configuration are trusted."
      : !policySignatureValid ? "Action Policy signature verification failed."
        : runCause !== undefined ? `The agent's run history cannot vouch for its configuration: ${runCause}.`
          : "Action Policy or dependent configuration trust verification failed.",
  });

  const simulateAllowed = !!rule || policy.defaultMode === "ALLOW";
  if (!rule && policy.defaultMode === "DENY") {
    decision.allowed = false;
    decision.effectiveMode = "SIMULATE";
    decision.reasons.push(`Action class ${input.actionClass} is denied by default policy.`);
    decision.requiredEvidence.push("Owner must add explicit action rule to .amc/action-policy.yaml and sign it.");
    return decision;
  }
  const evidenceIssues = rule ? evaluateRuleEvidence(input, rule, decision) : [];

  if (input.requestedMode === "SIMULATE") {
    decision.allowed = simulateAllowed;
    decision.effectiveMode = "SIMULATE";
    if (!simulateAllowed) {
      decision.reasons.push(`SIMULATE denied for ${input.actionClass} by policy.`);
    } else {
      decision.reasons.push(`SIMULATE allowed for ${input.actionClass}.`);
    }
    decision.requiredExecTicket = Boolean(rule?.requireExecTicket);
    return decision;
  }

  decision.requiredExecTicket = Boolean(rule?.requireExecTicket);
  if (!simulateAllowed) {
    decision.allowed = false;
    decision.effectiveMode = "SIMULATE";
    decision.reasons.push(`EXECUTE denied and SIMULATE not permitted for ${input.actionClass}.`);
    return decision;
  }

  if (!trustedConfig) {
    decision.allowed = true;
    decision.effectiveMode = "SIMULATE";
    decision.reasons.push("UNTRUSTED CONFIG: the policy/config signatures or the agent's trusted run do not vouch for it. EXECUTE is denied.");
    if (!policySignatureValid) decision.reasons.push("UNTRUSTED CONFIG: Action Policy signature verification failed.");
    if (runCause) decision.reasons.push(`UNTRUSTED RUN: ${runCause}.`);
    if (!policySignatureValid || !runCause) decision.requiredEvidence.push("Re-sign policy/config files and rerun amc verify.");
    if (runCause) decision.requiredEvidence.push("Restore the agent's run history: its newest sealed run must be ledger-anchored and verify; a planted, tampered, unanchored, rolled-back or verification-failed run never lifts SIMULATE.");
    return decision;
  }

  if (input.budgetStatus && !input.budgetStatus.budgetConfigValid) {
    addCondition(decision, {
      conditionId: "budget-policy-signature",
      label: "Signed budget configuration",
      passed: false,
      actual: false,
      expected: true,
      reason: "Budget configuration signature is invalid.",
    });
    decision.allowed = true;
    decision.effectiveMode = "SIMULATE";
    decision.reasons.push("UNTRUSTED CONFIG: budgets config signature invalid. EXECUTE is denied.");
    decision.requiredEvidence.push("Re-sign budgets.yaml and verify signatures.");
    return decision;
  }

  if (input.freezeStatus?.active && input.freezeStatus.actionClasses.includes(input.actionClass)) {
    addCondition(decision, {
      conditionId: "incident-freeze",
      label: "No active execution freeze",
      passed: false,
      actual: true,
      expected: false,
      reason: `An active incident freeze covers ${input.actionClass}.`,
    });
    decision.allowed = true;
    decision.effectiveMode = "SIMULATE";
    decision.reasons.push(`EXECUTE is frozen for action class ${input.actionClass}.`);
    decision.requiredEvidence.push("Resolve active incident freeze before execute is re-enabled.");
    return decision;
  }

  const executeBudgetExceeded =
    !!input.budgetStatus &&
    !input.budgetStatus.ok &&
    (input.budgetStatus.exceededActionClasses.includes(input.actionClass) ||
      input.budgetStatus.reasons.some((reason) => /daily llm|per-minute llm|daily llm cost/i.test(reason)));
  if (input.budgetStatus) {
    addCondition(decision, {
      conditionId: "execution-budget",
      label: "Execution budget available",
      passed: !executeBudgetExceeded,
      actual: input.budgetStatus.ok,
      expected: true,
      reason: executeBudgetExceeded
        ? "The active budget blocks EXECUTE for this action."
        : "No applicable execution budget is exceeded.",
    });
  }
  if (executeBudgetExceeded) {
    decision.allowed = true;
    decision.effectiveMode = "SIMULATE";
    decision.reasons.push("BUDGET_EXCEEDED: action downgraded to SIMULATE.");
    decision.requiredEvidence.push("Reduce budget pressure or reset policy budget before execute.");
    return decision;
  }

  const issues: string[] = [...evidenceIssues];

  if (!rule) {
    issues.push(`No explicit policy rule for ${input.actionClass}.`);
  } else {
    // The rule's threshold (absent: 0.6). Below 0.6 is an owner waiver: it still needs a sealed, anchored run (G1), never
    // covers findings against the agent (G2), and every decision made under it says so.
    const threshold = runIntegrityAtLeast(rule);
    const waived = threshold < DEFAULT_RUN_INTEGRITY_AT_LEAST;
    const run = input.currentDiagnosticRun;
    // The runner's matrix passes a scores-only stub when the agent has no trusted run: no finite index, no run.
    const measured = run && Number.isFinite(run.integrityIndex) ? run : null;
    const integrity = measured?.integrityIndex ?? 0;
    const findings = measured !== null && waived ? runFindings(measured) : [];
    const runState = measured === null ? `agent ${input.agentId} has no trusted diagnostic run`
      : `latest trusted run ${measured.runId} has integrity ${integrity.toFixed(3)} (${measured.trustLabel})`;
    // At or below the default a HIGH TRUST label also satisfies it, as the gate before this field did
    // (`trustLabel !== "HIGH TRUST" && integrity < 0.6`); above the default the number alone decides.
    const runSatisfied = measured !== null && findings.length === 0
      && (integrity >= threshold || (measured.trustLabel === "HIGH TRUST" && threshold <= DEFAULT_RUN_INTEGRITY_AT_LEAST));
    const findingList = findings.join(", ");
    addCondition(decision, {
      conditionId: "run-integrity",
      label: "Trusted run integrity",
      passed: runSatisfied,
      actual: measured === null ? null : integrity,
      expected: threshold,
      reason: runSatisfied
        ? waived ? `${runState}; satisfies the owner-signed threshold ${threshold}, below AMC's default ${DEFAULT_RUN_INTEGRITY_AT_LEAST} (rule ${input.actionClass} in .amc/action-policy.yaml).`
          : `${runState}; satisfies ${threshold}.`
        : measured === null ? `${runState}.`
          : findings.length > 0 ? `${runState}; the owner-signed threshold ${threshold} does not cover findings against the agent (${findingList}).`
            : `${runState}, below ${threshold}.`,
    });
    if (!runSatisfied) {
      issues.push(measured === null ? `UNTRUSTED RUN: ${runState}.`
        : findings.length > 0 ? `UNTRUSTED RUN: ${runState}; findings against the agent (${findingList}) are not covered by the ${input.actionClass} rule's threshold ${threshold}.`
          : `UNTRUSTED RUN: ${runState}, below ${threshold}.`);
      decision.requiredEvidence.push(findings.length > 0
        ? `A sealed amc run for this agent without findings against it (${findingList}); a threshold below ${DEFAULT_RUN_INTEGRITY_AT_LEAST} covers missing evidence, not findings.`
        : `A sealed amc run for this agent with integrity >= ${threshold}${threshold >= DEFAULT_RUN_INTEGRITY_AT_LEAST ? " (HIGH TRUST)" : ""}; see docs/GOVERNOR.md "Reaching EXECUTE".`);
    } else if (waived) {
      decision.reasons.push(`RUN INTEGRITY WAIVED: the signed ${input.actionClass} rule sets requireRunIntegrityAtLeast ${threshold} (AMC default ${DEFAULT_RUN_INTEGRITY_AT_LEAST}); ${runState}.`);
    }

    const trustTierSatisfied = compareTrustTier(input.trustSummary.trustTier, rule.requireTrustTierAtLeast);
    addCondition(decision, {
      conditionId: "trust-tier",
      label: "Minimum trust tier",
      passed: trustTierSatisfied,
      actual: input.trustSummary.trustTier,
      expected: rule.requireTrustTierAtLeast,
      reason: trustTierSatisfied
        ? `Trust tier ${input.trustSummary.trustTier} satisfies ${rule.requireTrustTierAtLeast}.`
        : `Trust tier ${input.trustSummary.trustTier} does not satisfy ${rule.requireTrustTierAtLeast}.`,
    });
    if (!trustTierSatisfied) {
      issues.push(`trust tier ${input.trustSummary.trustTier} does not satisfy ${rule.requireTrustTierAtLeast}`);
      decision.requiredEvidence.push(`Increase OBSERVED evidence quality to reach trust tier ${rule.requireTrustTierAtLeast}.`);
    }

    const riskKey = normalizeRiskTier(input.riskTier);
    const riskDefaults = policy.riskTierDefaults[riskKey];
    if (riskDefaults.requireSandboxForExecute) {
      addCondition(decision, {
        conditionId: "sandbox-attestation",
        label: "Sandbox attestation",
        passed: input.trustSummary.sandboxEvidence,
        actual: input.trustSummary.sandboxEvidence,
        expected: true,
        reason: input.trustSummary.sandboxEvidence
          ? `Risk tier ${input.riskTier} has sandbox attestation.`
          : `Risk tier ${input.riskTier} requires sandbox attestation for EXECUTE.`,
      });
    }
    if (riskDefaults.requireSandboxForExecute && !input.trustSummary.sandboxEvidence) {
      issues.push(`risk tier ${input.riskTier} requires sandbox attestation for EXECUTE`);
      decision.requiredEvidence.push("Run sandboxed execution and capture SANDBOX_EXECUTION_ENABLED evidence.");
    }

    if (rule.requireExecTicket) {
      addCondition(decision, {
        conditionId: "execution-ticket",
        label: "Execution ticket",
        passed: input.hasExecTicket === true,
        actual: input.hasExecTicket === true,
        expected: true,
        reason: input.hasExecTicket
          ? "A caller-declared execution ticket is present."
          : "An execution ticket is required but was not provided.",
      });
    }
    if (rule.requireExecTicket && !input.hasExecTicket) {
      issues.push("execution ticket required but not provided");
      decision.requiredApprovals.push("Owner-issued EXEC ticket (amc ticket issue ...) is required.");
    }

    if (input.workOrder) {
      const allowedByWorkOrder = input.workOrder.allowedActionClasses.includes(input.actionClass);
      addCondition(decision, {
        conditionId: "work-order-action-class",
        label: "Work-order action scope",
        passed: allowedByWorkOrder,
        actual: allowedByWorkOrder,
        expected: true,
        reason: allowedByWorkOrder
          ? `Work order ${input.workOrder.workOrderId} permits ${input.actionClass}.`
          : `Work order ${input.workOrder.workOrderId} does not allow action ${input.actionClass}.`,
      });
      if (!allowedByWorkOrder) {
        issues.push(`work order ${input.workOrder.workOrderId} does not allow action ${input.actionClass}`);
      }
    }

    addCondition(decision, {
      conditionId: "action-policy-execute",
      label: "Action rule permits EXECUTE",
      passed: rule.allowExecute,
      actual: rule.allowExecute,
      expected: true,
      reason: rule.allowExecute
        ? `${input.actionClass} is policy-authorized for EXECUTE when all gates pass.`
        : `${input.actionClass} is policy-defined as simulate-only unless owner overrides.`,
    });
    if (!rule.allowExecute) {
      issues.push(`${input.actionClass} is policy-defined as simulate-only unless owner overrides`);
      if (!rule.requireExecTicket) {
        decision.requiredApprovals.push("Owner must update action policy to permit EXECUTE or issue explicit override process.");
      }
    }
  }

  if (issues.length > 0) {
    decision.allowed = true;
    decision.effectiveMode = "SIMULATE";
    decision.reasons.push(...issues);
    return decision;
  }

  decision.allowed = true;
  decision.effectiveMode = "EXECUTE";
  decision.reasons.push(`EXECUTE allowed for ${input.actionClass}.`);
  return decision;
}

function parseAssuranceReportFile(file: string): {
  ts: number;
  windowStartTs: number;
  windowEndTs: number;
  trustTier: TrustTier;
  packResults: Array<{
    packId: string;
    score0to100: number;
    scenarioResults: Array<{ auditEventTypes: string[] }>;
  }>;
} | null {
  try {
    const parsed = JSON.parse(readUtf8(file)) as {
      ts?: number;
      windowStartTs?: number;
      windowEndTs?: number;
      trustTier?: TrustTier;
      packResults?: Array<{
        packId?: string;
        score0to100?: number;
        scenarioResults?: Array<{ auditEventTypes?: string[] }>;
      }>;
    };
    const packResults = (parsed.packResults ?? [])
      .filter((pack): pack is { packId: string; score0to100: number; scenarioResults: Array<{ auditEventTypes: string[] }> } =>
        typeof pack.packId === "string"
      )
      .map((pack) => ({
        packId: pack.packId,
        score0to100: typeof pack.score0to100 === "number" ? pack.score0to100 : 0,
        scenarioResults: (pack.scenarioResults ?? []).map((scenario) => ({
          auditEventTypes: Array.isArray(scenario.auditEventTypes) ? scenario.auditEventTypes.filter((item): item is string => typeof item === "string") : []
        }))
      }));
    return {
      ts: parsed.ts ?? 0,
      windowStartTs: parsed.windowStartTs ?? parsed.ts ?? 0,
      windowEndTs: parsed.windowEndTs ?? parsed.ts ?? 0,
      trustTier: parsed.trustTier ?? "SELF_REPORTED",
      packResults
    };
  } catch {
    return null;
  }
}

export function summarizeAssuranceForWindow(workspace: string, agentId: string, windowStartTs: number, windowEndTs: number): GovernorAssuranceSummary {
  const agentPaths = getAgentPaths(workspace, agentId);
  const dir = join(agentPaths.reportsDir, "assurance");
  if (!pathExists(dir)) {
    return { packs: {} };
  }
  const summary: GovernorAssuranceSummary = { packs: {} };
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) {
      continue;
    }
    const parsed = parseAssuranceReportFile(join(dir, file));
    if (!parsed) {
      continue;
    }
    if (parsed.windowEndTs < windowStartTs || parsed.windowStartTs > windowEndTs) {
      continue;
    }

    for (const pack of parsed.packResults) {
      let succeeded = 0;
      for (const scenario of pack.scenarioResults) {
        for (const auditType of scenario.auditEventTypes) {
          if (auditType.endsWith("_SUCCEEDED")) {
            succeeded += 1;
          }
        }
      }
      const existing = summary.packs[pack.packId];
      if (!existing || pack.score0to100 > existing.score) {
        summary.packs[pack.packId] = {
          score: pack.score0to100,
          succeeded,
          observed: parsed.trustTier === "OBSERVED" || parsed.trustTier === "OBSERVED_HARDENED"
        };
      }
    }
  }
  return summary;
}

/**
 * The trust summary a decision reads. `untrustedConfig` is the hard gate no rule waives: a refused run history (G5:
 * `refusal`, resolved here when the caller passes none, so no caller can trust a refused history) or a latest trusted run
 * that cannot vouch at any threshold. A missing or low-integrity run is the rule's `run-integrity` condition instead.
 */
export function deriveTrustSummaryFromRun(workspace: string, agentId: string, run: DiagnosticReport | null, refusal?: string | null): GovernorTrustSummary {
  if (!run) {
    const cause = refusal === undefined ? latestTrustedRun(workspace, agentId).refusal : refusal;
    return { trustTier: "SELF_REPORTED", sandboxEvidence: false, untrustedConfig: cause !== null, correlationRatio: 0,
      ...(cause === null ? {} : { runRefusal: cause }) };
  }

  let trustTier: TrustTier = "SELF_REPORTED";
  const observed = run.evidenceTrustCoverage?.observed ?? 0;
  const attested = run.evidenceTrustCoverage?.attested ?? 0;
  if (observed >= 0.5) {
    trustTier = "OBSERVED";
  } else if (attested >= 0.5) {
    trustTier = "ATTESTED";
  }

  let sandboxEvidence = false;
  const ledger = openLedger(workspace);
  try {
    const events = ledger.getEventsBetween(run.windowStartTs, run.windowEndTs);
    for (const event of events) {
      try {
        const meta = JSON.parse(event.meta_json) as Record<string, unknown>;
        if (meta.agentId && meta.agentId !== agentId) {
          continue;
        }
        if (meta.auditType === "SANDBOX_EXECUTION_ENABLED") {
          sandboxEvidence = true;
          break;
        }
      } catch {
        // ignore
      }
    }
  } finally {
    ledger.close();
  }

  if (trustTier === "OBSERVED" && sandboxEvidence) {
    trustTier = "OBSERVED_HARDENED";
  }

  const hardGap = runHardGap(run);
  return { trustTier, sandboxEvidence, untrustedConfig: hardGap !== null, correlationRatio: run.correlationRatio,
    ...(hardGap === null ? {} : { runTrustGap: hardGap }) };
}

/** Why a sealed run cannot vouch at any threshold: it is not a measurement. Never set for a merely low index. */
function runHardGap(run: DiagnosticReport): string | null {
  if (!run.verificationPassed || run.status !== "VALID") return `latest trusted run ${run.runId} failed ledger verification (status ${run.status})`;
  if (run.trustBoundaryViolated !== false) {
    return `latest trusted run ${run.runId} ${run.trustBoundaryViolated === true ? "violated the trust boundary" : "records no trust-boundary result"}${run.trustBoundaryMessage ? `: ${run.trustBoundaryMessage}` : ""}`;
  }
  return null;
}

/**
 * Evidence against the agent that an owner waiver never covers (G2): a waiver stands in for missing evidence, not for
 * findings. A count the run does not carry is read as a finding, never as zero.
 */
function runFindings(run: DiagnosticReport): string[] {
  const counts: ReadonlyArray<readonly [string, unknown]> = [["contradictions", run.contradictionCount], ["unsupported claims", run.unsupportedClaimCount],
    ["inflation attempts", Array.isArray(run.inflationAttempts) ? run.inflationAttempts.length : undefined], ["invalid receipts", run.invalidReceiptsCount]];
  return counts.flatMap(([name, count]) => typeof count !== "number" || !Number.isSafeInteger(count) || count < 0 ? [`${name} not recorded`]
    : count > 0 ? [`${count} ${name}`] : []);
}

/** `latestTrustedRun` without the reason. */
export function latestRunForAgent(workspace: string, agentId: string): DiagnosticReport | null {
  return latestTrustedRun(workspace, agentId).run;
}

export function summarizeGovernorInput(workspace: string, agentId: string): {
  run: DiagnosticReport | null;
  trust: GovernorTrustSummary;
  assurance: GovernorAssuranceSummary;
} {
  const { run, refusal } = latestTrustedRun(workspace, agentId);
  const trust = deriveTrustSummaryFromRun(workspace, agentId, run, refusal);
  const assurance = run
    ? summarizeAssuranceForWindow(workspace, agentId, run.windowStartTs, run.windowEndTs)
    : { packs: {} };
  return {
    run,
    trust,
    assurance
  };
}
