import { readFileSync } from "node:fs";
import { z } from "zod";
import type { RiskTier } from "../types.js";
import { getAgentPaths } from "../fleet/paths.js";

const entitySchema = z.object({
  id: z.string(),
  type: z.enum([
    "Goal",
    "NonGoal",
    "Stakeholder",
    "Constraint",
    "Policy",
    "RiskTier",
    "Tool",
    "DataBoundary",
    "Metric",
    "EscalationRule",
    "ApprovalRule"
  ]),
  label: z.string(),
  details: z.string().optional()
});

export const contextGraphSchema = z.object({
  mission: z.string().min(5),
  successMetrics: z.array(z.string()).min(1),
  constraints: z.array(z.string()).min(1),
  forbiddenActions: z.array(z.string()).min(1),
  riskTier: z.enum(["low", "med", "high", "critical"]),
  escalationRules: z.array(z.string()).min(1),
  entities: z.array(entitySchema).min(1)
});

export type ContextGraph = z.infer<typeof contextGraphSchema>;

export function loadContextGraph(workspace = process.cwd(), agentId?: string): ContextGraph {
  const paths = getAgentPaths(workspace, agentId);
  const file = paths.contextGraph;
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
    return contextGraphSchema.parse(raw);
  } catch (error) {
    if ((error as { code?: string })?.code === "ENOENT") {
      throw new Error(
        [
          `Context graph not found for agent '${paths.agentId}'.`,
          `Expected file: ${file}`,
          "Run one of the following first:",
          "  amc setup",
          "  amc init"
        ].join("\n")
      );
    }
    throw error;
  }
}

export function validateContextGraph(input: unknown): ContextGraph {
  return contextGraphSchema.parse(input);
}

export function summarizeContextGraphForPrompt(graph: ContextGraph): string {
  return [
    `Mission: ${graph.mission}`,
    `Risk Tier: ${graph.riskTier}`,
    `Success Metrics: ${graph.successMetrics.join("; ")}`,
    `Constraints: ${graph.constraints.join("; ")}`,
    `Forbidden Actions: ${graph.forbiddenActions.join("; ")}`,
    `Escalation Rules: ${graph.escalationRules.join("; ")}`
  ].join("\n");
}

export function alignmentCheck(
  text: string,
  graph: ContextGraph
): { pass: boolean; reasons: string[]; violatedConstraints: string[] } {
  const lowered = text.toLowerCase();
  const reasons: string[] = [];
  const violatedConstraints: string[] = [];

  for (const forbidden of graph.forbiddenActions) {
    if (forbidden && lowered.includes(forbidden.toLowerCase())) {
      reasons.push(`Mentions forbidden action: ${forbidden}`);
      violatedConstraints.push(forbidden);
    }
  }

  for (const constraint of graph.constraints) {
    const tokens = constraint.toLowerCase().split(/\W+/).filter(Boolean);
    const overlap = tokens.filter((token) => lowered.includes(token)).length;
    if (tokens.length > 0 && overlap === 0) {
      reasons.push(`Constraint missing from text context: ${constraint}`);
    }
  }

  const missionTokens = graph.mission.toLowerCase().split(/\W+/).filter((token) => token.length > 4);
  const missionOverlap = missionTokens.filter((token) => lowered.includes(token)).length;
  if (missionTokens.length > 0 && missionOverlap === 0) {
    reasons.push("No detectable mission alignment tokens in text");
  }

  return {
    pass: violatedConstraints.length === 0,
    reasons,
    violatedConstraints
  };
}

export function driftDetection(evidenceWindow: Array<{ ts: number; text: string }>): {
  driftScore: number;
  driftSignals: string[];
  examples: string[];
} {
  const driftSignals: string[] = [];
  const examples: string[] = [];

  let contradictionHints = 0;
  let noUncertaintyMentions = 0;
  let riskyNoConsentHints = 0;

  for (const event of evidenceWindow) {
    const text = event.text.toLowerCase();
    if (/\b(i retract|i was wrong|contradiction|correction)\b/.test(text)) {
      contradictionHints += 1;
      examples.push(event.text.slice(0, 160));
    }

    if (/(delete production|exfiltrate|bypass policy|disable guardrail|unsafe)/.test(text) && !/(consent|approved|approval)/.test(text)) {
      riskyNoConsentHints += 1;
      examples.push(event.text.slice(0, 160));
    }

    if (!/(unknown|uncertain|assumption|insufficient evidence|cannot verify)/.test(text)) {
      noUncertaintyMentions += 1;
    }
  }

  if (contradictionHints > 0) {
    driftSignals.push(`contradiction_hints:${contradictionHints}`);
  }
  if (riskyNoConsentHints > 0) {
    driftSignals.push(`risky_without_consent:${riskyNoConsentHints}`);
  }

  const total = Math.max(evidenceWindow.length, 1);
  const lowTransparencyRatio = noUncertaintyMentions / total;
  if (lowTransparencyRatio > 0.85) {
    driftSignals.push("low_uncertainty_disclosure");
  }

  const rawScore = contradictionHints * 0.15 + riskyNoConsentHints * 0.2 + (lowTransparencyRatio > 0.85 ? 0.2 : 0);
  const driftScore = Math.max(0, Math.min(1, rawScore));

  return {
    driftScore,
    driftSignals,
    examples: examples.slice(0, 5)
  };
}

export function riskTierRank(riskTier: RiskTier): number {
  if (riskTier === "low") {
    return 0;
  }
  if (riskTier === "med") {
    return 1;
  }
  if (riskTier === "high") {
    return 2;
  }
  return 3;
}
