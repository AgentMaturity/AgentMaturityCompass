import { defaultGatePolicy } from "../ci/gate.js";
import { questionIds } from "../diagnostic/questionBank.js";
import { defaultAlertsConfig } from "../drift/alerts.js";
import { defaultActionPolicy } from "../governor/actionPolicyEngine.js";
import { defaultToolsConfig } from "../toolhub/toolsSchema.js";
import { defaultBudgets } from "../budgets/budgets.js";
import { defaultApprovalPolicy } from "../approvals/approvalPolicyEngine.js";
import { policyPackSchema, type PolicyPack } from "./packSchema.js";

function makeTarget(base: number, overrides: Record<string, number> = {}): Record<string, number> {
  const mapping: Record<string, number> = {};
  for (const id of questionIds) {
    mapping[id] = Math.max(0, Math.min(5, base));
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (key in mapping) {
      mapping[key] = Math.max(0, Math.min(5, Math.trunc(value)));
    }
  }
  return mapping;
}

function pack(input: PolicyPack): PolicyPack {
  return policyPackSchema.parse(input);
}

function strictifyActionPolicyForHighRisk(policy: ReturnType<typeof defaultActionPolicy>): Record<string, unknown> {
  const cloned = JSON.parse(JSON.stringify(policy)) as ReturnType<typeof defaultActionPolicy>;
  for (const rule of cloned.actions) {
    if (rule.actionClass === "WRITE_HIGH" || rule.actionClass === "DEPLOY" || rule.actionClass === "SECURITY") {
      rule.requireExecTicket = true;
      rule.requireTrustTierAtLeast = "OBSERVED_HARDENED";
    }
    if (rule.actionClass === "SECURITY") {
      rule.allowExecute = false;
    }
  }
  return cloned as unknown as Record<string, unknown>;
}

function strictApprovalPolicy(): Record<string, unknown> {
  const policy = defaultApprovalPolicy();
  const writeHigh = policy.approvalPolicy.actionClasses.WRITE_HIGH;
  const deploy = policy.approvalPolicy.actionClasses.DEPLOY;
  const security = policy.approvalPolicy.actionClasses.SECURITY;
  if (writeHigh) {
    writeHigh.requiredApprovals = 2;
    writeHigh.requireDistinctUsers = true;
  }
  if (deploy) {
    deploy.requiredApprovals = 2;
    deploy.requireDistinctUsers = true;
  }
  if (security) {
    security.requiredApprovals = 2;
    security.requireDistinctUsers = true;
    security.rolesAllowed = ["OWNER", "AUDITOR"];
  }
  return policy as unknown as Record<string, unknown>;
}

function strictTools(): Record<string, unknown> {
  const tools = defaultToolsConfig();
  tools.tools.denyByDefault = true;
  for (const tool of tools.tools.allowedTools) {
    if (tool.actionClass === "WRITE_HIGH" || tool.actionClass === "DEPLOY" || tool.actionClass === "SECURITY") {
      tool.requireExecTicket = true;
    }
  }
  return tools as unknown as Record<string, unknown>;
}

function packTemplate(params: {
  id: string;
  name: string;
  description: string;
  archetypeId: string;
  riskTier: "low" | "medium" | "high" | "critical";
  targetBase: number;
  targetOverrides?: Record<string, number>;
}): PolicyPack {
  const actionPolicy =
    params.riskTier === "high" || params.riskTier === "critical"
      ? strictifyActionPolicyForHighRisk(defaultActionPolicy())
      : (defaultActionPolicy() as unknown as Record<string, unknown>);
  const approvalPolicy =
    params.riskTier === "high" || params.riskTier === "critical"
      ? strictApprovalPolicy()
      : (defaultApprovalPolicy() as unknown as Record<string, unknown>);
  const budgets = defaultBudgets("default");
  const defaultBudget = budgets.budgets.perAgent.default;
  if (params.riskTier === "critical") {
    if (defaultBudget) {
      defaultBudget.daily.maxToolExecutes.SECURITY = 0;
      defaultBudget.daily.maxToolExecutes.DEPLOY = 1;
    }
  } else if (params.riskTier === "high") {
    if (defaultBudget) {
      defaultBudget.daily.maxToolExecutes.DEPLOY = 2;
    }
  }
  return pack({
    id: params.id,
    name: params.name,
    description: params.description,
    archetypeId: params.archetypeId,
    riskTier: params.riskTier,
    actionPolicy,
    tools: strictTools(),
    budgets: budgets as unknown as Record<string, unknown>,
    alerts: defaultAlertsConfig() as unknown as Record<string, unknown>,
    approvalPolicy,
    gatePolicy: defaultGatePolicy() as unknown as Record<string, unknown>,
    targetAdjustments: makeTarget(params.targetBase, params.targetOverrides)
  });
}

export const BUILT_IN_POLICY_PACKS: PolicyPack[] = [
  packTemplate({
    id: "code-agent.low",
    name: "Code Agent Low Risk",
    description: "Golden defaults for low-risk coding assistants.",
    archetypeId: "code-agent",
    riskTier: "low",
    targetBase: 3,
    targetOverrides: { "AMC-1.7": 4, "AMC-2.3": 4, "AMC-3.3.1": 4, "AMC-5.3": 4 }
  }),
  packTemplate({
    id: "code-agent.medium",
    name: "Code Agent Medium Risk",
    description: "Balanced controls for medium-risk coding workflows.",
    archetypeId: "code-agent",
    riskTier: "medium",
    targetBase: 4,
    targetOverrides: { "AMC-1.8": 4, "AMC-4.6": 4, "AMC-5.5": 4 }
  }),
  packTemplate({
    id: "code-agent.high",
    name: "Code Agent High Risk",
    description: "Strict controls and dual approvals for high-risk coding actions.",
    archetypeId: "code-agent",
    riskTier: "high",
    targetBase: 4,
    targetOverrides: { "AMC-1.8": 5, "AMC-3.3.1": 5, "AMC-4.6": 5, "AMC-5.3": 5 }
  }),
  packTemplate({
    id: "research-agent.low",
    name: "Research Agent Low Risk",
    description: "Safe defaults for exploratory research agents.",
    archetypeId: "research-agent",
    riskTier: "low",
    targetBase: 3,
    targetOverrides: { "AMC-4.3": 4, "AMC-2.5": 4, "AMC-3.3.1": 4 }
  }),
  packTemplate({
    id: "research-agent.medium",
    name: "Research Agent Medium Risk",
    description: "Research pack with stronger verification and provenance controls.",
    archetypeId: "research-agent",
    riskTier: "medium",
    targetBase: 4,
    targetOverrides: { "AMC-4.3": 5, "AMC-1.5": 4, "AMC-3.2.3": 4 }
  }),
  packTemplate({
    id: "research-agent.high",
    name: "Research Agent High Risk",
    description: "High-assurance research pack with strict approvals.",
    archetypeId: "research-agent",
    riskTier: "high",
    targetBase: 4,
    targetOverrides: { "AMC-4.3": 5, "AMC-2.5": 5, "AMC-3.3.1": 5, "AMC-1.8": 5 }
  }),
  packTemplate({
    id: "support-agent.low",
    name: "Support Agent Low Risk",
    description: "Customer support defaults with robust continuity and consent.",
    archetypeId: "support-agent",
    riskTier: "low",
    targetBase: 3,
    targetOverrides: { "AMC-1.2": 4, "AMC-4.5": 4, "AMC-3.1.6": 4 }
  }),
  packTemplate({
    id: "support-agent.medium",
    name: "Support Agent Medium Risk",
    description: "Support pack tuned for privacy and consistent escalation.",
    archetypeId: "support-agent",
    riskTier: "medium",
    targetBase: 4,
    targetOverrides: { "AMC-1.8": 4, "AMC-3.1.2": 4, "AMC-4.6": 4 }
  }),
  packTemplate({
    id: "support-agent.high",
    name: "Support Agent High Risk",
    description: "High-risk support pack with strict governance and dual control.",
    archetypeId: "support-agent",
    riskTier: "high",
    targetBase: 4,
    targetOverrides: { "AMC-1.8": 5, "AMC-3.2.3": 5, "AMC-3.3.1": 5, "AMC-4.6": 5 }
  }),
  packTemplate({
    id: "devops-agent.medium",
    name: "DevOps Agent Medium Risk",
    description: "DevOps defaults with execute guardrails and release discipline.",
    archetypeId: "devops-agent",
    riskTier: "medium",
    targetBase: 4,
    targetOverrides: { "AMC-1.7": 5, "AMC-1.9": 5, "AMC-4.1": 4, "AMC-5.3": 5 }
  }),
  packTemplate({
    id: "devops-agent.high",
    name: "DevOps Agent High Risk",
    description: "High-risk DevOps controls with hardened trust and approvals.",
    archetypeId: "devops-agent",
    riskTier: "high",
    targetBase: 4,
    targetOverrides: { "AMC-1.7": 5, "AMC-1.8": 5, "AMC-4.6": 5, "AMC-5.3": 5 }
  }),
  packTemplate({
    id: "security-agent.high",
    name: "Security Agent High Risk",
    description: "Security analyst pack with strict least-privilege and verification.",
    archetypeId: "security-agent",
    riskTier: "high",
    targetBase: 4,
    targetOverrides: { "AMC-1.8": 5, "AMC-3.2.3": 5, "AMC-3.3.1": 5, "AMC-4.6": 5, "AMC-5.5": 5 }
  }),
  packTemplate({
    id: "mcp-safety",
    name: "MCP Safety Assurance",
    description: "Assurance pack for MCP tool safety validation, trusted servers, injection detection, and permission scopes.",
    archetypeId: "interop-agent",
    riskTier: "high",
    targetBase: 4,
    targetOverrides: {
      "AMC-MCP-1": 5,
      "AMC-MCP-2": 5,
      "AMC-MCP-3": 5,
      "AMC-SCI-1": 5,
      "AMC-SCI-2": 5,
      "AMC-SCI-3": 5,
      "AMC-1.5": 5,
      "AMC-1.8": 5,
      "AMC-3.2.3": 5,
      "AMC-5.8": 5,
      "AMC-5.14": 5
    }
  }),
  packTemplate({
    id: "security-agent.critical",
    name: "Security Agent Critical Risk",
    description: "Critical-risk security pack with maximum governance posture.",
    archetypeId: "security-agent",
    riskTier: "critical",
    targetBase: 5
  })
];

export function listPolicyPacks(): PolicyPack[] {
  return BUILT_IN_POLICY_PACKS.slice();
}

export function getPolicyPack(packId: string): PolicyPack | null {
  return BUILT_IN_POLICY_PACKS.find((row) => row.id === packId) ?? null;
}
