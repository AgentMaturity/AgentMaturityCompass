import { questionBank } from "../diagnostic/questionBank.js";
import type { CompassCanon } from "./canonSchema.js";

function dimensionIdForQuestion(qid: string): "D1" | "D2" | "D3" | "D4" | "D5" {
  if (qid.startsWith("AMC-1.")) return "D1";
  if (qid.startsWith("AMC-COST-")) return "D1";
  if (qid.startsWith("AMC-SPORT-")) return "D1";
  if (qid.startsWith("AMC-OPS-")) return "D1";
  if (qid.startsWith("AMC-OINT-")) return "D1";
  if (qid.startsWith("AMC-2.")) return "D2";
  if (qid.startsWith("AMC-HOQ-")) return "D2";
  if (qid.startsWith("AMC-GOV-PROACTIVE-")) return "D2";
  if (qid.startsWith("AMC-BCON-")) return "D2";
  if (qid.startsWith("AMC-EUAI-")) return "D2";
  if (qid.startsWith("AMC-3.")) return "D3";
  if (qid.startsWith("AMC-SOCIAL-")) return "D3";
  if (qid.startsWith("AMC-4.")) return "D4";
  if (qid.startsWith("AMC-MEM-")) return "D4";
  if (qid.startsWith("AMC-RES-")) return "D4";
  if (qid.startsWith("AMC-SK-")) return "D4";
  if (qid.startsWith("AMC-THR-")) return "D4";
  // 2026 research-derived questions
  if (qid.startsWith("AMC-TAS-")) return "D4";
  if (qid.startsWith("AMC-MBR-")) return "D4";
  if (qid.startsWith("AMC-AAC-")) return "D4";
  if (qid.startsWith("AMC-MSA-")) return "D4";
  if (qid.startsWith("AMC-APS-")) return "D4";
  if (qid.startsWith("AMC-ZAP-")) return "D4";
  if (qid.startsWith("AMC-EAM-")) return "D4";
  if (qid === "AMC-OC-1" || qid === "AMC-OC-2" || qid === "AMC-OC-3") return "D3";
  if (qid === "AMC-OC-4" || qid === "AMC-OC-5" || qid === "AMC-OC-6") return "D4";
  if (qid === "AMC-OC-7" || qid === "AMC-OC-8") return "D5";
  // Simulation & Forecast Lane (AMC-6.x) — route by question range
  if (qid.startsWith("AMC-6.")) {
    const num = parseInt(qid.replace("AMC-6.", ""), 10);
    // 6.1-6.10: Forecast Legitimacy → D3 (Culture & Alignment)
    if (num >= 1 && num <= 10) return "D3";
    // 6.11-6.17: Fact/Sim Boundary → D4 (Resilience)
    if (num >= 11 && num <= 17) return "D4";
    // 6.18-6.25: Synthetic Persona → D3 (Culture & Alignment)
    if (num >= 18 && num <= 25) return "D3";
    // 6.26-6.29: Scenario Traceability → D5 (Skills)
    if (num >= 26 && num <= 29) return "D5";
    // 6.30-6.36: Simulation Validity → D4 (Resilience)
    if (num >= 30 && num <= 36) return "D4";
    // 6.37-6.42: Writeback Governance → D4 (Resilience)
    if (num >= 37 && num <= 42) return "D4";
    // 6.43-6.47: Predictive UX Honesty → D3 (Culture & Alignment)
    if (num >= 43 && num <= 47) return "D3";
    // 6.48-6.52: Real-Person Controls → D3 (Culture & Alignment)
    if (num >= 48 && num <= 52) return "D3";
    // 6.53-6.57: Synthetic Agent Interaction → D5 (Skills)
    if (num >= 53 && num <= 57) return "D5";
  }
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
        { id: "D1", name: "Strategic Agent Operations", questionCount: 16 },
        { id: "D2", name: "Agent Leadership", questionCount: 20 },
        { id: "D3", name: "Agent Culture", questionCount: 54 },
        { id: "D4", name: "Agent Resilience", questionCount: 52 },
        { id: "D5", name: "Agent Skills", questionCount: 53 }
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
