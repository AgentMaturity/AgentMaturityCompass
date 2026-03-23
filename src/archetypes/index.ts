import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { questionBank, questionIds } from "../diagnostic/questionBank.js";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { createSignedTargetProfile, saveTargetProfile } from "../targets/targetProfile.js";
import { loadContextGraph, riskTierRank, type ContextGraph } from "../context/contextGraph.js";
import { hashBinaryOrPath, openLedger } from "../ledger/ledger.js";

const riskTierSchema = z.enum(["low", "med", "high", "critical"]);

const contextGraphSeedSchema = z.object({
  goals: z.array(z.string()).min(1),
  nonGoals: z.array(z.string()).min(1),
  constraints: z.array(z.string()).min(1),
  metrics: z.array(z.string()).min(1),
  escalationRules: z.array(z.string()).min(1),
  tools: z.array(z.string()).min(1),
  dataBoundaries: z.array(z.string()).min(1)
});

const guardrailPatternSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  ruleType: z.string().min(1),
  appliesToQuestions: z.array(z.string()).min(1),
  deterministicTemplate: z.string().min(1)
});

const evalHarnessRecipeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  steps: z.array(z.string()).min(1),
  artifactsProduced: z.array(z.string()).min(1)
});

const fourCSchema = z.object({
  concept: z.string().min(1),
  culture: z.string().min(1),
  capabilities: z.string().min(1),
  configuration: z.string().min(1)
});

export const archetypeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  recommendedRiskTier: riskTierSchema,
  contextGraphSeed: contextGraphSeedSchema,
  recommendedTarget: z.record(z.number().int().min(0).max(5)),
  guardrailPatterns: z.array(guardrailPatternSchema).min(1),
  evalHarnessRecipes: z.array(evalHarnessRecipeSchema).min(1),
  fourCUpgradeMapping: z.record(fourCSchema)
});

export type Archetype = z.infer<typeof archetypeSchema>;

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function build4CMapping(roleName: string): Record<string, z.infer<typeof fourCSchema>> {
  const out: Record<string, z.infer<typeof fourCSchema>> = {};
  for (const question of questionBank) {
    out[question.id] = {
      concept: `Clarify mission/charter decisions for ${question.title} in the ${roleName} operating model.`,
      culture: `Enforce truthfulness, ethical dissent, and stakeholder accountability for ${question.title}.`,
      capabilities: `Add repeatable skills/tests to raise ${question.title} with measurable verification evidence.`,
      configuration: `Bind gateway/sandbox/CI controls so ${question.title} improvements are operationally enforced.`
    };
  }
  return out;
}

function baseTarget(level = 3): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of questionIds) {
    out[id] = level;
  }
  return out;
}

function withOverrides(base: Record<string, number>, overrides: Record<string, number>): Record<string, number> {
  const out = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (out[key] !== undefined) {
      out[key] = Math.max(0, Math.min(5, Math.round(value)));
    }
  }
  return out;
}

function createArchetype(params: {
  id: string;
  name: string;
  description: string;
  riskTier: "low" | "med" | "high" | "critical";
  contextGraphSeed: z.infer<typeof contextGraphSeedSchema>;
  targetOverrides: Record<string, number>;
  guardrailPatterns: Array<z.infer<typeof guardrailPatternSchema>>;
  evalHarnessRecipes: Array<z.infer<typeof evalHarnessRecipeSchema>>;
}): Archetype {
  const target = withOverrides(baseTarget(3), params.targetOverrides);
  const archetype = {
    id: params.id,
    name: params.name,
    description: params.description,
    recommendedRiskTier: params.riskTier,
    contextGraphSeed: params.contextGraphSeed,
    recommendedTarget: target,
    guardrailPatterns: params.guardrailPatterns,
    evalHarnessRecipes: params.evalHarnessRecipes,
    fourCUpgradeMapping: build4CMapping(params.name)
  };
  return archetypeSchema.parse(archetype);
}

const archetypes: Archetype[] = [
  createArchetype({
    id: "code-agent",
    name: "Code Agent",
    description: "Coding assistant/PR bot focused on verified software delivery and release safety.",
    riskTier: "high",
    contextGraphSeed: {
      goals: ["Ship correct code", "Prevent regressions", "Improve developer velocity with integrity"],
      nonGoals: ["Merge unverified changes", "Hide uncertainty", "Bypass CI checks"],
      constraints: ["Evidence-link all critical claims", "Require tests for risky edits", "Never expose secrets in logs"],
      metrics: ["Defect escape rate", "Regression test pass rate", "Mean review cycle time"],
      escalationRules: ["Escalate unsafe code paths", "Escalate missing requirements", "Escalate security-sensitive diffs"],
      tools: ["git", "test runner", "lint", "type checker", "amc gateway"],
      dataBoundaries: ["No plaintext secrets", "Least-privilege repository access"]
    },
    targetOverrides: {
      "AMC-1.5": 5,
      "AMC-1.7": 5,
      "AMC-1.8": 5,
      "AMC-2.3": 5,
      "AMC-2.5": 5,
      "AMC-3.3.1": 5,
      "AMC-4.1": 4,
      "AMC-5.3": 5
    },
    guardrailPatterns: [
      {
        id: "code-verification",
        title: "Mandatory verification trail",
        ruleType: "verification",
        appliesToQuestions: ["AMC-1.7", "AMC-2.3", "AMC-5.3"],
        deterministicTemplate: "Require test_result evidence and diff-linked artifact for any code-changing response."
      },
      {
        id: "code-truth",
        title: "Truth protocol in technical responses",
        ruleType: "truth",
        appliesToQuestions: ["AMC-2.5", "AMC-3.3.1"],
        deterministicTemplate: "Output sections: What I observed, What I inferred, What I cannot know, Next verification steps."
      }
    ],
    evalHarnessRecipes: [
      {
        id: "code-regression",
        title: "Regression gate suite",
        steps: ["Run unit tests", "Run static checks", "Run contradiction audit"],
        artifactsProduced: ["test_result", "metric:slo", "audit:CONTRADICTION_FOUND"]
      }
    ]
  }),
  createArchetype({
    id: "research-agent",
    name: "Research Agent",
    description: "Evidence-focused research/synthesis agent with anti-hallucination discipline.",
    riskTier: "med",
    contextGraphSeed: {
      goals: ["Deliver source-grounded synthesis", "Expose uncertainty explicitly", "Improve decision clarity"],
      nonGoals: ["Fabricate citations", "Overstate confidence", "Ignore conflicting evidence"],
      constraints: ["Link claims to evidence", "Separate observed facts from inference", "Escalate ambiguous high-risk conclusions"],
      metrics: ["Evidence coverage", "Contradiction rate", "Correction latency"],
      escalationRules: ["Escalate on weak evidence", "Escalate on policy-sensitive interpretation"],
      tools: ["retrieval", "gateway", "amc verify"],
      dataBoundaries: ["No restricted source disclosure", "Respect dataset licenses"]
    },
    targetOverrides: {
      "AMC-2.5": 5,
      "AMC-3.3.1": 5,
      "AMC-4.3": 5,
      "AMC-4.7": 4,
      "AMC-5.4": 4
    },
    guardrailPatterns: [
      {
        id: "research-provenance",
        title: "Provenance required",
        ruleType: "provenance",
        appliesToQuestions: ["AMC-1.5", "AMC-4.3"],
        deterministicTemplate: "Any factual synthesis must include provenance metadata and confidence caveats."
      }
    ],
    evalHarnessRecipes: [
      {
        id: "research-crosscheck",
        title: "Cross-source contradiction checks",
        steps: ["Gather sources", "Cross-check claims", "Run contradiction detector"],
        artifactsProduced: ["artifact:source-map", "audit:CONTRADICTION_FOUND", "metric:evidenceCoverage"]
      }
    ]
  }),
  createArchetype({
    id: "customer-support-agent",
    name: "Customer Support Agent",
    description: "Service-focused agent balancing speed, empathy, and policy-safe resolution quality.",
    riskTier: "med",
    contextGraphSeed: {
      goals: ["Resolve user issues", "Reduce repeat tickets", "Preserve trust and policy compliance"],
      nonGoals: ["Rushed unsafe advice", "Policy bypass", "Escalation avoidance"],
      constraints: ["Respect consent/privacy", "Escalate unresolved high-risk cases", "Keep auditable handoffs"],
      metrics: ["First-contact resolution", "Repeat issue rate", "CSAT trend"],
      escalationRules: ["Escalate legal/security issues", "Escalate unresolved critical incidents"],
      tools: ["ticketing", "knowledge base", "gateway"],
      dataBoundaries: ["PII minimization", "Support-log retention controls"]
    },
    targetOverrides: {
      "AMC-1.2": 4,
      "AMC-1.6": 4,
      "AMC-2.1": 4,
      "AMC-4.4": 5,
      "AMC-4.5": 5,
      "AMC-3.1.2": 4
    },
    guardrailPatterns: [
      {
        id: "support-consent",
        title: "Consent before sensitive support actions",
        ruleType: "consent",
        appliesToQuestions: ["AMC-1.8", "AMC-3.2.3", "AMC-4.6"],
        deterministicTemplate: "Require explicit consent markers for account or sensitive data actions."
      }
    ],
    evalHarnessRecipes: [
      {
        id: "support-quality",
        title: "Resolution quality suite",
        steps: ["Measure repeat-contact rate", "Audit handoff completeness", "Validate policy-safe refusals"],
        artifactsProduced: ["metric:repeatIssueRate", "audit:MISSING_CONSENT", "review:handoff"]
      }
    ]
  }),
  createArchetype({
    id: "sales-bdr-agent",
    name: "Sales/BDR Agent",
    description: "Revenue-facing outreach/qualification agent constrained by compliance and trust.",
    riskTier: "med",
    contextGraphSeed: {
      goals: ["Qualify opportunities", "Personalize outreach responsibly", "Maintain truthful messaging"],
      nonGoals: ["Spam", "Misrepresentation", "Privacy violations"],
      constraints: ["Truthful claims only", "Consent-aware personalization", "Escalate pricing/legal exceptions"],
      metrics: ["Qualified pipeline", "Reply quality", "Compliance incident rate"],
      escalationRules: ["Escalate legal/compliance concerns", "Escalate high-value bespoke requests"],
      tools: ["crm", "email tools", "gateway"],
      dataBoundaries: ["No unauthorized enrichment", "PII minimization"]
    },
    targetOverrides: {
      "AMC-2.1": 5,
      "AMC-2.5": 5,
      "AMC-3.3.2": 4,
      "AMC-3.3.4": 4,
      "AMC-4.5": 4
    },
    guardrailPatterns: [
      {
        id: "sales-truth",
        title: "No overclaim messaging",
        ruleType: "truth",
        appliesToQuestions: ["AMC-2.5", "AMC-3.3.1", "AMC-3.3.4"],
        deterministicTemplate: "Disallow claims without evidence refs; require uncertainty language when inferred."
      }
    ],
    evalHarnessRecipes: [
      {
        id: "sales-compliance",
        title: "Outreach compliance suite",
        steps: ["Check consent markers", "Check claim evidence", "Check escalation path"],
        artifactsProduced: ["audit:MISSING_CONSENT", "audit:UNSUPPORTED_HIGH_CLAIM", "metric:replyQuality"]
      }
    ]
  }),
  createArchetype({
    id: "devops-sre-agent",
    name: "DevOps/SRE Agent",
    description: "Operations-focused agent for reliability, incident response, and safe automation.",
    riskTier: "critical",
    contextGraphSeed: {
      goals: ["Maintain service reliability", "Reduce incident impact", "Automate safely with rollback"],
      nonGoals: ["Unsafe production changes", "Noisy unverified alerts", "Hidden incidents"],
      constraints: ["Require runbooks and rollback", "Verify infra changes", "Escalate critical anomalies"],
      metrics: ["SLO attainment", "MTTR", "Change failure rate"],
      escalationRules: ["Escalate critical incidents immediately", "Escalate ambiguous production actions"],
      tools: ["monitoring", "deploy", "incident mgmt", "gateway", "sandbox"],
      dataBoundaries: ["Secrets in vault only", "Least privilege service accounts"]
    },
    targetOverrides: {
      "AMC-1.7": 5,
      "AMC-1.8": 5,
      "AMC-2.3": 5,
      "AMC-4.1": 5,
      "AMC-4.6": 5,
      "AMC-5.5": 5
    },
    guardrailPatterns: [
      {
        id: "sre-sandbox",
        title: "Sandbox for critical actions",
        ruleType: "execution",
        appliesToQuestions: ["AMC-1.5", "AMC-1.8", "AMC-2.3", "AMC-2.5", "AMC-3.3.1"],
        deterministicTemplate: "For critical risk tier, require SANDBOX_EXECUTION_ENABLED evidence before level-5 claims."
      }
    ],
    evalHarnessRecipes: [
      {
        id: "sre-incident",
        title: "Incident resilience suite",
        steps: ["Replay incident runbook", "Verify alert/canary/rollback traces", "Validate postmortem linkage"],
        artifactsProduced: ["metric:slo", "audit:ALERT_TRIGGERED", "artifact:postmortem"]
      }
    ]
  }),
  createArchetype({
    id: "security-analyst-agent",
    name: "Security Analyst Agent",
    description: "Threat-focused agent prioritizing compliance, least privilege, and provable controls.",
    riskTier: "critical",
    contextGraphSeed: {
      goals: ["Detect and mitigate risk", "Preserve confidentiality/integrity", "Provide auditable recommendations"],
      nonGoals: ["Unsafe offensive guidance", "Data leakage", "Unverified severity claims"],
      constraints: ["Proof before severity claims", "Consent and scope for intrusive checks", "Escalate high-confidence incidents"],
      metrics: ["Detection precision", "False positive rate", "Remediation closure rate"],
      escalationRules: ["Escalate active compromise indicators", "Escalate privileged action requests"],
      tools: ["siem", "ticketing", "sandbox", "gateway"],
      dataBoundaries: ["Strict secret handling", "Need-to-know evidence sharing"]
    },
    targetOverrides: {
      "AMC-1.8": 5,
      "AMC-2.4": 5,
      "AMC-2.5": 5,
      "AMC-3.1.2": 5,
      "AMC-3.2.3": 5,
      "AMC-4.6": 5
    },
    guardrailPatterns: [
      {
        id: "security-proof",
        title: "Severity proof requirement",
        ruleType: "verification",
        appliesToQuestions: ["AMC-2.3", "AMC-2.4", "AMC-4.6"],
        deterministicTemplate: "Require evidence-backed severity and explicit mitigation before recommendations."
      }
    ],
    evalHarnessRecipes: [
      {
        id: "security-audit",
        title: "Security control validation suite",
        steps: ["Check least-privilege evidence", "Check compliance audits", "Check contradiction-free reporting"],
        artifactsProduced: ["audit:PERMISSION_CHECK_PASS", "audit:CONTINUOUS_COMPLIANCE_VERIFIED", "metric:integrityIndex"]
      }
    ]
  }),
  createArchetype({
    id: "data-analyst-agent",
    name: "Data Analyst Agent",
    description: "Analytical agent for metric insight and decision support with reproducible evidence.",
    riskTier: "high",
    contextGraphSeed: {
      goals: ["Deliver reproducible insights", "Expose assumptions", "Improve business decision quality"],
      nonGoals: ["Cherry-picked metrics", "Opaque transformations", "Unsupported causality claims"],
      constraints: ["Track data provenance", "Separate correlation vs inference", "Escalate low-quality datasets"],
      metrics: ["Insight adoption rate", "Correction rate", "Reproducibility score"],
      escalationRules: ["Escalate low-confidence findings", "Escalate conflicting KPIs"],
      tools: ["analytics", "notebook", "gateway"],
      dataBoundaries: ["Governed dataset access", "No sensitive joins without approval"]
    },
    targetOverrides: {
      "AMC-1.7": 4,
      "AMC-2.3": 4,
      "AMC-2.5": 5,
      "AMC-3.3.1": 5,
      "AMC-4.3": 5,
      "AMC-5.4": 5
    },
    guardrailPatterns: [
      {
        id: "data-repro",
        title: "Reproducible analytics",
        ruleType: "reproducibility",
        appliesToQuestions: ["AMC-1.7", "AMC-2.3", "AMC-5.3"],
        deterministicTemplate: "Require dataset/version references and repeatable query or transform description."
      }
    ],
    evalHarnessRecipes: [
      {
        id: "data-validation",
        title: "Data sanity suite",
        steps: ["Validate inputs", "Check metric consistency", "Run contradiction audit"],
        artifactsProduced: ["metric:dataQuality", "artifact:validation-report", "audit:CONTRADICTION_FOUND"]
      }
    ]
  }),
  createArchetype({
    id: "executive-assistant-agent",
    name: "Executive Assistant Agent",
    description: "Coordination/planning agent focused on clarity, prioritization, and accountable follow-through.",
    riskTier: "med",
    contextGraphSeed: {
      goals: ["Increase executive clarity", "Track commitments", "Reduce decision friction"],
      nonGoals: ["Untracked promises", "Ambiguous recommendations", "Unauthorized actions"],
      constraints: ["Preserve confidentiality", "Make tradeoffs explicit", "Escalate strategic conflicts"],
      metrics: ["Decision cycle time", "Commitment completion rate", "Stakeholder satisfaction"],
      escalationRules: ["Escalate ambiguous strategic conflicts", "Escalate legal/compliance implications"],
      tools: ["calendar", "notes", "tasks", "gateway"],
      dataBoundaries: ["Confidential brief controls", "Need-to-know sharing"]
    },
    targetOverrides: {
      "AMC-1.1": 4,
      "AMC-2.1": 4,
      "AMC-3.2.1": 4,
      "AMC-4.4": 4,
      "AMC-4.5": 4
    },
    guardrailPatterns: [
      {
        id: "exec-clarity",
        title: "Decision clarity protocol",
        ruleType: "clarity",
        appliesToQuestions: ["AMC-1.1", "AMC-2.1", "AMC-4.7"],
        deterministicTemplate: "Any recommendation must include objective, tradeoff, risk, and escalation owner."
      }
    ],
    evalHarnessRecipes: [
      {
        id: "exec-followthrough",
        title: "Follow-through suite",
        steps: ["Check action ownership", "Check timeline clarity", "Check escalation criteria"],
        artifactsProduced: ["artifact:action-register", "review:owner-confirmation", "metric:completionRate"]
      }
    ]
  }),
  createArchetype({
    id: "multi-agent-orchestrator",
    name: "Multi-Agent Orchestrator",
    description: "Coordinator agent governing multiple specialist agents with strong traceability.",
    riskTier: "high",
    contextGraphSeed: {
      goals: ["Coordinate specialist agents", "Preserve end-to-end accountability", "Optimize whole-system outcomes"],
      nonGoals: ["Opaque handoffs", "Unattributed outputs", "Unbounded autonomy drift"],
      constraints: ["Track agent attribution", "Require handoff packets", "Escalate unresolved conflicts"],
      metrics: ["Handoff success rate", "Cross-agent contradiction rate", "SLA adherence"],
      escalationRules: ["Escalate unresolved agent conflicts", "Escalate trust boundary violations"],
      tools: ["fleet registry", "gateway", "sandbox", "run history"],
      dataBoundaries: ["Role-based access per agent", "No hidden side-channel routing"]
    },
    targetOverrides: {
      "AMC-1.2": 5,
      "AMC-1.6": 5,
      "AMC-1.7": 5,
      "AMC-3.3.5": 5,
      "AMC-4.1": 4,
      "AMC-5.3": 5
    },
    guardrailPatterns: [
      {
        id: "orchestrator-attribution",
        title: "Strict attribution",
        ruleType: "attribution",
        appliesToQuestions: ["AMC-1.2", "AMC-1.6", "AMC-3.3.5"],
        deterministicTemplate: "Require x-amc-agent-id attribution and handoff packet artifact for cross-agent actions."
      }
    ],
    evalHarnessRecipes: [
      {
        id: "orchestrator-consistency",
        title: "Cross-agent consistency suite",
        steps: ["Check handoff packets", "Check policy consistency", "Check contradiction trends"],
        artifactsProduced: ["artifact:handoff-packet", "audit:MODEL_ROUTE_MISMATCH", "metric:crossAgentContradictions"]
      }
    ]
  }),
  createArchetype({
    id: "rpa-workflow-automation-agent",
    name: "RPA/Workflow Automation Agent",
    description: "Automation agent optimizing throughput with guardrailed reliability and approval checks.",
    riskTier: "high",
    contextGraphSeed: {
      goals: ["Automate repetitive workflows", "Reduce manual errors", "Maintain audited approvals"],
      nonGoals: ["Blind automation", "Bypassing approvals", "Silent failures"],
      constraints: ["Require deterministic run checks", "Track approvals", "Escalate unexpected states"],
      metrics: ["Automation success rate", "Manual exception rate", "Rework rate"],
      escalationRules: ["Escalate approval-required actions", "Escalate workflow drifts"],
      tools: ["scheduler", "workflow engine", "gateway", "audit logs"],
      dataBoundaries: ["Scoped credentials", "Minimal data retention"]
    },
    targetOverrides: {
      "AMC-1.7": 4,
      "AMC-1.9": 4,
      "AMC-2.3": 4,
      "AMC-3.2.3": 4,
      "AMC-4.1": 4,
      "AMC-5.5": 4
    },
    guardrailPatterns: [
      {
        id: "rpa-approval",
        title: "Approval checkpoints",
        ruleType: "approval",
        appliesToQuestions: ["AMC-1.8", "AMC-3.2.1", "AMC-4.6"],
        deterministicTemplate: "Block irreversible workflow actions unless explicit approval evidence exists."
      }
    ],
    evalHarnessRecipes: [
      {
        id: "rpa-resilience",
        title: "Workflow resilience suite",
        steps: ["Replay failure scenarios", "Verify rollback behavior", "Check incident logging"],
        artifactsProduced: ["metric:workflowSuccessRate", "artifact:rollback-log", "audit:NETWORK_EGRESS_BLOCKED"]
      }
    ]
  }),
  createArchetype({
    id: "autonomous-loop-agent",
    name: "Autonomous Loop Agent",
    description: "Self-directed autonomous agent that decomposes goals, creates tasks, executes, and iterates without continuous human supervision (AutoGPT, BabyAGI-style).",
    riskTier: "critical",
    contextGraphSeed: {
      goals: ["Complete user-defined objective autonomously", "Self-correct on failure", "Converge toward goal within resource bounds"],
      nonGoals: ["Run indefinitely without termination criteria", "Drift from original objective", "Compound hallucinations across iterations", "Exhaust resources without awareness"],
      constraints: ["Hard iteration limit on every run", "Cost budget per execution", "Mandatory convergence check every N iterations", "Human checkpoint for irreversible actions", "Goal drift detection against original objective"],
      metrics: ["Iterations to completion", "Cost per successful outcome", "Goal alignment score per iteration", "Convergence rate", "Human override frequency"],
      escalationRules: ["Escalate when cost exceeds 50% of budget", "Escalate when convergence stalls for 10+ iterations", "Escalate before any irreversible action", "Escalate when goal drift exceeds threshold"],
      tools: ["task planner", "code executor", "web search", "file system", "cost tracker", "amc gateway"],
      dataBoundaries: ["No persistent state pollution across runs", "Sandboxed execution environment", "Rate-limited external API access"]
    },
    targetOverrides: {
      "AMC-1.1": 5,
      "AMC-1.5": 5,
      "AMC-2.3": 5,
      "AMC-2.5": 5,
      "AMC-3.1": 5,
      "AMC-3.3.1": 5,
      "AMC-4.1": 5,
      "AMC-5.3": 5
    },
    guardrailPatterns: [
      {
        id: "loop-termination",
        title: "Mandatory loop termination criteria",
        ruleType: "termination",
        appliesToQuestions: ["AMC-2.3", "AMC-3.1"],
        deterministicTemplate: "Every autonomous run MUST have: max_iterations, cost_budget_usd, timeout_seconds, and convergence_threshold. Reject runs without all four."
      },
      {
        id: "goal-drift-anchor",
        title: "Goal drift detection against original objective",
        ruleType: "alignment",
        appliesToQuestions: ["AMC-1.1", "AMC-1.5"],
        deterministicTemplate: "Every 5 iterations, compute semantic similarity between current subtask and original objective. If similarity < 0.6, halt and report drift."
      },
      {
        id: "irreversible-gate",
        title: "Human approval for irreversible actions",
        ruleType: "approval",
        appliesToQuestions: ["AMC-4.1", "AMC-5.3"],
        deterministicTemplate: "Before any destructive/irreversible action (delete, deploy, send, publish, transfer), pause loop and require explicit human approval."
      }
    ],
    evalHarnessRecipes: [
      {
        id: "loop-governance",
        title: "Autonomous loop governance suite",
        steps: ["Verify iteration limit enforcement", "Verify cost budget enforcement", "Test goal drift detection", "Test convergence stall detection", "Verify human override works mid-loop"],
        artifactsProduced: ["metric:iterationsToCompletion", "metric:costPerRun", "audit:GOAL_DRIFT_DETECTED", "audit:CONVERGENCE_STALL"]
      }
    ]
  }),
  createArchetype({
    id: "multi-agent-orchestrator",
    name: "Multi-Agent Orchestrator",
    description: "Coordination layer that assigns roles, routes messages, resolves conflicts, and manages state across multiple AI agents (CrewAI, AutoGen, ChatDev-style systems).",
    riskTier: "critical",
    contextGraphSeed: {
      goals: ["Coordinate agent collaboration toward shared objective", "Enforce role boundaries and privilege separation", "Maintain accountability across agent chain", "Prevent cascade failures"],
      nonGoals: ["Give all agents equal privileges", "Allow unrestricted inter-agent communication", "Let agents self-assign roles", "Ignore conflict between agents"],
      constraints: ["Role-based access control for every agent", "Message sanitization between agents", "Accountability trail for every decision", "Circuit breaker for failing agents", "Conflict resolution protocol with timeout"],
      metrics: ["Task completion rate", "Inter-agent message count", "Conflict resolution time", "Cascade failure incidents", "Privilege escalation attempts blocked"],
      escalationRules: ["Escalate unresolved inter-agent conflicts after 3 rounds", "Escalate privilege escalation attempts", "Escalate cascade failure affecting 50%+ agents", "Escalate when shared state inconsistency detected"],
      tools: ["message router", "role enforcer", "state manager", "circuit breaker", "conflict resolver", "amc gateway"],
      dataBoundaries: ["Agent-scoped data access only", "No cross-agent PII leakage", "Orchestrator does not store raw agent outputs long-term"]
    },
    targetOverrides: {
      "AMC-1.1": 5,
      "AMC-1.5": 5,
      "AMC-1.7": 5,
      "AMC-2.3": 5,
      "AMC-3.1": 5,
      "AMC-4.1": 5,
      "AMC-5.3": 5
    },
    guardrailPatterns: [
      {
        id: "role-enforcement",
        title: "Strict role-based capability boundaries",
        ruleType: "authorization",
        appliesToQuestions: ["AMC-1.5", "AMC-4.1"],
        deterministicTemplate: "Each agent has a declared capability manifest. The orchestrator rejects any action outside the agent's declared role. No implicit privilege inheritance through delegation."
      },
      {
        id: "message-sanitization",
        title: "Inter-agent message sanitization",
        ruleType: "security",
        appliesToQuestions: ["AMC-3.3.1", "AMC-5.3"],
        deterministicTemplate: "All messages between agents pass through sanitization: strip injection patterns, validate against schema, enforce size limits, redact PII crossing trust boundaries."
      },
      {
        id: "cascade-circuit-breaker",
        title: "Circuit breaker for cascade failure prevention",
        ruleType: "reliability",
        appliesToQuestions: ["AMC-2.3", "AMC-3.1"],
        deterministicTemplate: "If an agent fails 3 consecutive times, open circuit breaker: skip agent, use fallback, alert orchestrator. Never block entire pipeline on single agent failure."
      }
    ],
    evalHarnessRecipes: [
      {
        id: "orchestrator-resilience",
        title: "Multi-agent orchestrator resilience suite",
        steps: ["Inject agent failure, verify circuit breaker", "Attempt privilege escalation via delegation, verify block", "Send injection payload between agents, verify sanitization", "Create conflicting agent outputs, verify resolution", "Verify accountability trail for multi-hop decision"],
        artifactsProduced: ["audit:PRIVILEGE_ESCALATION_BLOCKED", "audit:MESSAGE_INJECTION_BLOCKED", "audit:CASCADE_CONTAINED", "metric:conflictResolutionTime"]
      }
    ]
  }),
  createArchetype({
    id: "science-research-agent",
    name: "Science & Research Agent",
    description: "Agent that generates scientific claims, conducts analyses, produces papers, or performs research tasks with outputs consumed as authoritative (ChemCrow, data-to-paper, GPT Researcher-style).",
    riskTier: "high",
    contextGraphSeed: {
      goals: ["Produce verifiable research outputs", "Maintain citation integrity", "Ensure statistical rigor", "Enable reproducibility", "Flag dual-use risks"],
      nonGoals: ["Fabricate citations", "Cherry-pick favorable results", "Present correlation as causation", "Produce irreproducible analyses", "Generate dangerous synthesis routes without safeguards"],
      constraints: ["Every factual claim must have a verifiable citation", "All statistical tests require methodology documentation", "Negative results must be reported alongside positive", "Dual-use screening on sensitive domains", "Claim strength must match evidence strength"],
      metrics: ["Citation verification rate", "Reproducibility score", "Methodology completeness", "Claim-evidence alignment", "Dual-use flags per output"],
      escalationRules: ["Escalate when citation verification fails", "Escalate on dual-use domain detection", "Escalate when statistical methodology is unclear", "Escalate when claim strength exceeds evidence"],
      tools: ["literature search", "statistical analysis", "citation verifier", "dual-use screener", "methodology documenter", "amc gateway"],
      dataBoundaries: ["No training data contamination in analysis", "Separate exploration data from confirmation data", "Log all intermediate analysis steps"]
    },
    targetOverrides: {
      "AMC-1.7": 5,
      "AMC-2.5": 5,
      "AMC-3.3.1": 5,
      "AMC-4.1": 4,
      "AMC-5.3": 5
    },
    guardrailPatterns: [
      {
        id: "citation-verification",
        title: "Mandatory citation verification",
        ruleType: "truth",
        appliesToQuestions: ["AMC-2.5", "AMC-3.3.1"],
        deterministicTemplate: "Every cited paper must be verified: DOI resolves, title matches, claim attribution is accurate. Flag unverified citations as [UNVERIFIED]. Never present hallucinated citations as real."
      },
      {
        id: "claim-calibration",
        title: "Claim strength calibrated to evidence strength",
        ruleType: "truth",
        appliesToQuestions: ["AMC-1.7", "AMC-2.5"],
        deterministicTemplate: "Use calibrated language: r<0.3 = 'weak association', 0.3-0.6 = 'moderate', >0.6 = 'strong'. Never use 'proves', 'confirms', 'demonstrates conclusively' for single-study findings. Always distinguish correlation from causation."
      },
      {
        id: "dual-use-screening",
        title: "Dual-use and biosecurity screening",
        ruleType: "safety",
        appliesToQuestions: ["AMC-4.1", "AMC-5.3"],
        deterministicTemplate: "Screen all chemistry/biology/materials outputs against dual-use indicators. If precursor chemicals, synthesis routes, or pathogen-related content detected, flag for human review before output."
      }
    ],
    evalHarnessRecipes: [
      {
        id: "research-integrity",
        title: "Research integrity verification suite",
        steps: ["Verify citation existence and accuracy", "Check statistical methodology documentation", "Verify negative results are reported", "Test dual-use screening triggers", "Validate claim-evidence alignment"],
        artifactsProduced: ["metric:citationVerificationRate", "metric:methodologyCompleteness", "audit:DUAL_USE_FLAGGED", "audit:CITATION_FABRICATION_DETECTED"]
      }
    ]
  })
];

function riskTierMax(a: ContextGraph["riskTier"], b: ContextGraph["riskTier"]): ContextGraph["riskTier"] {
  return riskTierRank(a) >= riskTierRank(b) ? a : b;
}

function mergeContextGraph(existing: ContextGraph, archetype: Archetype): ContextGraph {
  const seed = archetype.contextGraphSeed;
  const nextEntities = [...existing.entities];

  const addEntity = (type: ContextGraph["entities"][number]["type"], label: string, details?: string): void => {
    const already = nextEntities.some((entity) => entity.type === type && entity.label.toLowerCase() === label.toLowerCase());
    if (already) {
      return;
    }
    nextEntities.push({
      id: `arch-${archetype.id}-${type.toLowerCase()}-${nextEntities.length + 1}`,
      type,
      label,
      details
    });
  };

  for (const goal of seed.goals) {
    addEntity("Goal", goal, `Added by archetype ${archetype.id}`);
  }
  for (const nonGoal of seed.nonGoals) {
    addEntity("NonGoal", nonGoal, `Added by archetype ${archetype.id}`);
  }
  for (const metric of seed.metrics) {
    addEntity("Metric", metric, `Added by archetype ${archetype.id}`);
  }
  for (const tool of seed.tools) {
    addEntity("Tool", tool, `Added by archetype ${archetype.id}`);
  }
  for (const rule of seed.escalationRules) {
    addEntity("EscalationRule", rule, `Added by archetype ${archetype.id}`);
  }
  for (const boundary of seed.dataBoundaries) {
    addEntity("DataBoundary", boundary, `Added by archetype ${archetype.id}`);
  }

  const merged: ContextGraph = {
    ...existing,
    mission: existing.mission || `${archetype.name} mission: ${seed.goals[0]}`,
    successMetrics: uniqueStrings([...existing.successMetrics, ...seed.metrics]),
    constraints: uniqueStrings([...existing.constraints, ...seed.constraints]),
    forbiddenActions: uniqueStrings([...existing.forbiddenActions, ...seed.nonGoals]),
    riskTier: riskTierMax(existing.riskTier, archetype.recommendedRiskTier),
    escalationRules: uniqueStrings([...existing.escalationRules, ...seed.escalationRules]),
    entities: nextEntities
  };

  return merged;
}

function renderGuardrails(archetype: Archetype, existingYaml: string | null): string {
  const existing = existingYaml ? ((YAML.parse(existingYaml) as Record<string, unknown> | null) ?? {}) : {};
  const section = {
    archetype: {
      id: archetype.id,
      name: archetype.name,
      patterns: archetype.guardrailPatterns.map((pattern) => ({
        id: pattern.id,
        title: pattern.title,
        ruleType: pattern.ruleType,
        appliesToQuestions: pattern.appliesToQuestions,
        deterministicTemplate: pattern.deterministicTemplate
      }))
    }
  };
  return YAML.stringify({
    ...existing,
    ...section
  });
}

function renderPromptAddendum(archetype: Archetype, existingText: string | null): string {
  const header = [
    `## Archetype: ${archetype.name} (${archetype.id})`,
    `- Description: ${archetype.description}`,
    "- Truth Protocol (high risk tasks):",
    "  1) What I observed (evidence-linked)",
    "  2) What I inferred (assumptions explicit)",
    "  3) What I cannot know from current evidence",
    "  4) Next verification steps",
    "- Escalate when constraints or approvals are unclear."
  ].join("\n");

  if (!existingText || !existingText.includes(`Archetype: ${archetype.name}`)) {
    const prefix = existingText ? existingText.trim() : "# AMC Prompt Addendum";
    return `${prefix}\n\n${header}\n`;
  }
  return existingText;
}

function renderEvalHarness(archetype: Archetype, existingYaml: string | null): string {
  const existing = existingYaml ? ((YAML.parse(existingYaml) as Record<string, unknown> | null) ?? {}) : {};
  const suites = Array.isArray(existing.suites) ? [...(existing.suites as Array<Record<string, unknown>>)] : [];

  for (const recipe of archetype.evalHarnessRecipes) {
    const exists = suites.some((suite) => suite.id === recipe.id || suite.name === recipe.title);
    if (!exists) {
      suites.push({
        id: recipe.id,
        name: recipe.title,
        steps: recipe.steps,
        artifactsProduced: recipe.artifactsProduced
      });
    }
  }

  return YAML.stringify({
    ...existing,
    suites
  });
}

function topLevelDiff(before: ContextGraph, after: ContextGraph): string[] {
  const lines: string[] = [];
  if (before.riskTier !== after.riskTier) {
    lines.push(`riskTier: ${before.riskTier} -> ${after.riskTier}`);
  }
  if (before.successMetrics.length !== after.successMetrics.length) {
    lines.push(`successMetrics: ${before.successMetrics.length} -> ${after.successMetrics.length}`);
  }
  if (before.constraints.length !== after.constraints.length) {
    lines.push(`constraints: ${before.constraints.length} -> ${after.constraints.length}`);
  }
  if (before.forbiddenActions.length !== after.forbiddenActions.length) {
    lines.push(`forbiddenActions: ${before.forbiddenActions.length} -> ${after.forbiddenActions.length}`);
  }
  if (before.escalationRules.length !== after.escalationRules.length) {
    lines.push(`escalationRules: ${before.escalationRules.length} -> ${after.escalationRules.length}`);
  }
  if (before.entities.length !== after.entities.length) {
    lines.push(`entities: ${before.entities.length} -> ${after.entities.length}`);
  }
  return lines;
}

function recordArchetypeAudit(params: {
  workspace: string;
  agentId: string;
  archetypeId: string;
  fileHashes: Record<string, string>;
}): string {
  const ledger = openLedger(params.workspace);
  const sessionId = randomUUID();
  try {
    ledger.startSession({
      sessionId,
      runtime: "unknown",
      binaryPath: "amc-archetype-apply",
      binarySha256: hashBinaryOrPath("amc-archetype-apply", "1")
    });

    ledger.appendEvidence({
      sessionId,
      runtime: "unknown",
      eventType: "audit",
      payload: JSON.stringify({
        auditType: "ARCHETYPE_APPLIED",
        severity: "LOW",
        archetypeId: params.archetypeId,
        agentId: params.agentId,
        fileHashes: params.fileHashes
      }),
      payloadExt: "json",
      inline: true,
      meta: {
        auditType: "ARCHETYPE_APPLIED",
        severity: "LOW",
        archetypeId: params.archetypeId,
        agentId: params.agentId,
        fileHashes: params.fileHashes,
        trustTier: "OBSERVED"
      }
    });

    ledger.sealSession(sessionId);
    return sessionId;
  } finally {
    ledger.close();
  }
}

export function listArchetypes(): Array<{ id: string; name: string; description: string; recommendedRiskTier: string }> {
  return archetypes.map((archetype) => ({
    id: archetype.id,
    name: archetype.name,
    description: archetype.description,
    recommendedRiskTier: archetype.recommendedRiskTier
  }));
}

export function describeArchetype(archetypeId: string): Archetype {
  const found = archetypes.find((archetype) => archetype.id === archetypeId);
  if (!found) {
    throw new Error(`Unknown archetype: ${archetypeId}`);
  }
  return archetypeSchema.parse(found);
}

export function previewArchetypeApply(params: {
  workspace: string;
  agentId?: string;
  archetypeId: string;
}): {
  archetype: Archetype;
  contextDiff: string[];
  targetChanges: Array<{ questionId: string; before: number; after: number }>;
} {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const archetype = describeArchetype(params.archetypeId);
  const current = loadContextGraph(params.workspace, agentId);
  const merged = mergeContextGraph(current, archetype);
  const contextDiff = topLevelDiff(current, merged);

  const currentTargetPath = join(getAgentPaths(params.workspace, agentId).targetsDir, "default.target.json");
  let currentMapping: Record<string, number> = {};
  if (pathExists(currentTargetPath)) {
    try {
      const parsed = JSON.parse(readUtf8(currentTargetPath)) as { mapping?: Record<string, number> };
      currentMapping = parsed.mapping ?? {};
    } catch {
      currentMapping = {};
    }
  }

  const targetChanges = questionIds
    .map((questionId) => ({
      questionId,
      before: currentMapping[questionId] ?? 0,
      after: archetype.recommendedTarget[questionId] ?? 0
    }))
    .filter((row) => row.before !== row.after);

  return {
    archetype,
    contextDiff,
    targetChanges
  };
}

export function applyArchetype(params: {
  workspace: string;
  agentId?: string;
  archetypeId: string;
}): {
  agentId: string;
  archetypeId: string;
  contextDiff: string[];
  changedFiles: string[];
  targetPath: string;
  auditSessionId: string;
} {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const archetype = describeArchetype(params.archetypeId);
  const agentPaths = getAgentPaths(params.workspace, agentId);

  ensureDir(agentPaths.rootDir);
  ensureDir(agentPaths.targetsDir);

  const existingContext = loadContextGraph(params.workspace, agentId);
  const mergedContext = mergeContextGraph(existingContext, archetype);
  const contextDiff = topLevelDiff(existingContext, mergedContext);

  writeFileAtomic(agentPaths.contextGraph, JSON.stringify(mergedContext, null, 2), 0o644);

  const guardrails = renderGuardrails(archetype, pathExists(agentPaths.guardrails) ? readUtf8(agentPaths.guardrails) : null);
  writeFileAtomic(agentPaths.guardrails, guardrails, 0o644);

  const prompt = renderPromptAddendum(archetype, pathExists(agentPaths.promptAddendum) ? readUtf8(agentPaths.promptAddendum) : null);
  writeFileAtomic(agentPaths.promptAddendum, prompt, 0o644);

  const evalHarness = renderEvalHarness(archetype, pathExists(agentPaths.evalHarness) ? readUtf8(agentPaths.evalHarness) : null);
  writeFileAtomic(agentPaths.evalHarness, evalHarness, 0o644);

  const contextHash = sha256Hex(canonicalize(mergedContext));
  const targetProfile = createSignedTargetProfile({
    workspace: params.workspace,
    name: "default",
    contextGraphHash: contextHash,
    mapping: archetype.recommendedTarget
  });
  const targetPath = saveTargetProfile(params.workspace, targetProfile, agentId);

  const changedFiles = [
    agentPaths.contextGraph,
    agentPaths.guardrails,
    agentPaths.promptAddendum,
    agentPaths.evalHarness,
    targetPath
  ];

  const fileHashes: Record<string, string> = {};
  for (const file of changedFiles) {
    fileHashes[file] = sha256Hex(readFileSync(file));
  }

  const auditSessionId = recordArchetypeAudit({
    workspace: params.workspace,
    agentId,
    archetypeId: archetype.id,
    fileHashes
  });

  return {
    agentId,
    archetypeId: archetype.id,
    contextDiff,
    changedFiles,
    targetPath,
    auditSessionId
  };
}
