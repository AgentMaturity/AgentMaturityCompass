import { questionBank } from "../diagnostic/questionBank.js";
import type { CompassCanon } from "./canonSchema.js";

function dimensionIdForQuestion(qid: string): "D1" | "D2" | "D3" | "D4" | "D5" {
  if (qid.startsWith("AMC-1.")) return "D1";
  if (qid.startsWith("AMC-COST-")) return "D1";
  if (qid.startsWith("AMC-SPORT-")) return "D1";
  if (qid.startsWith("AMC-2.")) return "D2";
  if (qid.startsWith("AMC-HOQ-")) return "D2";
  if (qid.startsWith("AMC-GOV-PROACTIVE-")) return "D2";
  if (qid.startsWith("AMC-BCON-")) return "D2";
  if (qid.startsWith("AMC-EUAI-")) return "D2";
  if (qid.startsWith("AMC-3.")) return "D3";
  if (qid.startsWith("AMC-SOCIAL-")) return "D3";
  if (qid.startsWith("AMC-4.")) return "D4";
  if (qid.startsWith("AMC-MEM-")) return "D4";
  if (qid.startsWith("AMC-OPS-")) return "D4";
  if (qid.startsWith("AMC-RES-")) return "D4";
  if (qid.startsWith("AMC-OINT-")) return "D4";
  if (qid.startsWith("AMC-ETP-")) return "D4";
  return "D5";
}

const FOUR_C_DEFINITIONS: Record<"Concept" | "Culture" | "Capabilities" | "Configuration", string> = {
  Concept:
    "The what and why of the agent role: mission, value creation, ecosystem context, and north-star intent.",
  Culture:
    "Operational values and trust discipline: honesty, ethics, transparency, and behavioral consistency in outputs.",
  Capabilities:
    "The ability to create and sustain value through skills, validated learning, and measured execution performance.",
  Configuration:
    "The policies, systems, guardrails, tooling, and observability that keep behavior safe and sustainable in realtime."
};

export function builtInCanon(): CompassCanon {
  const questions = questionBank
    .map((q) => ({
      qId: q.id,
      dimensionId: dimensionIdForQuestion(q.id),
      semantics: `${q.title}: ${q.promptTemplate}`
    }))
    .sort((a, b) => a.qId.localeCompare(b.qId));

  return {
    compassCanon: {
      version: 1,
      dimensions: [
        { id: "D1", name: "Strategic Agent Operations", questionCount: 13 },
        { id: "D2", name: "Agent Leadership", questionCount: 18 },
        { id: "D3", name: "Agent Culture", questionCount: 20 },
        { id: "D4", name: "Agent Resilience", questionCount: 16 },
        { id: "D5", name: "Agent Skills", questionCount: 22 }
      ],
      questions,
      fourCs: [
        { id: "Concept", definition: FOUR_C_DEFINITIONS.Concept },
        { id: "Culture", definition: FOUR_C_DEFINITIONS.Culture },
        { id: "Capabilities", definition: FOUR_C_DEFINITIONS.Capabilities },
        { id: "Configuration", definition: FOUR_C_DEFINITIONS.Configuration }
      ],
      strategyFailureRisks: [
        { id: "ecosystemFocusRisk", label: "Ecosystem Focus Risk" },
        { id: "clarityPathRisk", label: "Clarity Path Risk" },
        { id: "economicSignificanceRisk", label: "Economic Significance Risk" },
        { id: "riskAssuranceRisk", label: "Risk Assurance Risk" },
        { id: "digitalDualityRisk", label: "Digital Duality Risk" }
      ],
      valueDimensions: [
        { id: "emotionalValue", label: "Emotional Value" },
        { id: "functionalValue", label: "Functional Value" },
        { id: "economicValue", label: "Economic Value" },
        { id: "brandValue", label: "Brand Value" },
        { id: "lifetimeValue", label: "Lifetime Value" }
      ],
      agentTypeVocabulary: [
        { id: "code-agent", label: "Code Agent", source: "builtin" },
        { id: "support-agent", label: "Support Agent", source: "builtin" },
        { id: "ops-agent", label: "Ops Agent", source: "builtin" },
        { id: "research-agent", label: "Research Agent", source: "builtin" },
        { id: "sales-agent", label: "Sales Agent", source: "builtin" },
        { id: "clawbot", label: "Clawbot", source: "builtin" },
        { id: "ai-employee", label: "AI Employee", source: "builtin" },
        { id: "ai-bot", label: "AI Bot", source: "builtin" },
        { id: "other", label: "Other", source: "builtin" }
      ],
      domainPacks: [
        { id: "general", label: "General", source: "builtin" },
        { id: "devtools", label: "DevTools", source: "builtin" },
        { id: "fintech", label: "FinTech", source: "builtin" },
        { id: "healthcare", label: "Healthcare", source: "builtin" },
        { id: "sales", label: "Sales", source: "builtin" },
        { id: "operations", label: "Operations", source: "builtin" }
      ]
    }
  };
}
