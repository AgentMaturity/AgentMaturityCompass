import type { DiagnosticQuestion } from "../../types.js";
import { questionBank } from "../questionBank.js";
import { diagnosticBankSchema, type DiagnosticBank } from "./bankSchema.js";

function dimensionIdForQuestionId(qId: string): 1 | 2 | 3 | 4 | 5 {
  if (qId.startsWith("AMC-1.")) return 1;
  if (qId.startsWith("AMC-COST-")) return 1;
  if (qId.startsWith("AMC-SPORT-")) return 1;
  if (qId.startsWith("AMC-2.")) return 2;
  if (qId.startsWith("AMC-HOQ-")) return 2;
  if (qId.startsWith("AMC-GOV-PROACTIVE-")) return 2;
  if (qId.startsWith("AMC-BCON-")) return 2;
  if (qId.startsWith("AMC-EUAI-")) return 2;
  if (qId.startsWith("AMC-3.")) return 3;
  if (qId.startsWith("AMC-SOCIAL-")) return 3;
  if (qId.startsWith("AMC-4.")) return 4;
  if (qId.startsWith("AMC-MEM-")) return 4;
  if (qId.startsWith("AMC-OPS-")) return 4;
  if (qId.startsWith("AMC-RES-")) return 4;
  if (qId.startsWith("AMC-OINT-")) return 4;
  if (qId.startsWith("AMC-ETP-")) return 4;
  return 5;
}

function contextualLine(question: DiagnosticQuestion, agentType: keyof DiagnosticBank["diagnosticBank"]["questions"][number]["contextualVariants"]): string {
  const byType: Record<keyof DiagnosticBank["diagnosticBank"]["questions"][number]["contextualVariants"], string> = {
    "code-agent": "Apply this to code change flows, CI outcomes, tool receipts, and release safeguards.",
    "support-agent": "Apply this to case handling quality, safe escalation paths, and verified customer outcomes.",
    "ops-agent": "Apply this to operational reliability, incident evidence, freeze controls, and rollback readiness.",
    "research-agent": "Apply this to source traceability, uncertainty handling, and reproducible evidence links.",
    "sales-agent": "Apply this to truthful claims, approval controls, and measurable value signals without overclaiming.",
    other: "Apply this to the agent's real workflow using observed receipts, approvals, and signed policy evidence."
  };
  return `${question.promptTemplate} ${byType[agentType]}`;
}

function toExpectedEvidence(question: DiagnosticQuestion): string[] {
  const hints = `${question.evidenceGateHints}; ${question.upgradeHints}`
    .split(/[;\n]+/)
    .map((row) => row.trim())
    .filter((row) => row.length > 0);
  if (hints.length === 0) {
    return ["Observed receipts and policy-compliant audit events for this capability."];
  }
  return [...new Set(hints)].slice(0, 8);
}

function toInterventions(question: DiagnosticQuestion): string[] {
  const mapped = question.tuningKnobs
    .map((row) => row.trim())
    .filter((row) => row.length > 0)
    .map((row) => `intervention.${row.replaceAll(/[^a-zA-Z0-9._-]+/g, "-")}`);
  if (mapped.length > 0) {
    return [...new Set(mapped)].sort((a, b) => a.localeCompare(b));
  }
  return [`intervention.${question.id.toLowerCase().replaceAll(/[^a-z0-9._-]+/g, "-")}`];
}

function minCoverage(question: DiagnosticQuestion): {
  minEvents: number;
  minObservedShare: number;
  minAttestedShare: number;
  minRuns: number;
} {
  const gate3 = question.gates.find((row) => row.level === 3);
  const highGate = question.gates.find((row) => row.level === 5);
  return {
    minEvents: Math.max(1, gate3?.minEvents ?? 1),
    minObservedShare: highGate?.requiredTrustTier === "OBSERVED" ? 0.7 : 0.5,
    minAttestedShare: 0.1,
    minRuns: Math.max(1, Math.ceil((gate3?.minSessions ?? 1) / 2))
  };
}

function queriesForQuestion(question: DiagnosticQuestion): string[] {
  return [
    `SELECT id, ts FROM evidence_events WHERE json_extract(meta_json,'$.questionId') = '${question.id}' ORDER BY ts DESC LIMIT 200;`,
    `SELECT run_id, ts FROM runs ORDER BY ts DESC LIMIT 120;`,
    `SELECT id, ts FROM evidence_events WHERE event_type IN ('audit','llm_request','llm_response','tool_action','tool_result') ORDER BY ts DESC LIMIT 500;`
  ];
}

export function defaultDiagnosticBankV1(): DiagnosticBank {
  const questions = [...questionBank]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((question) => {
      const dimensionId = dimensionIdForQuestionId(question.id);
      return {
        qId: question.id,
        dimensionId,
        title: question.title,
        intent: question.promptTemplate,
        rubrics: question.options
          .slice()
          .sort((a, b) => a.level - b.level)
          .map((option) => ({
            level: option.level,
            label: option.label,
            observableDefinition: [option.meaning, ...option.observableSignals, ...option.typicalEvidence].join(" ")
          })),
        evidenceMap: {
          requiredEvidenceKinds: ["OBSERVED", "ATTESTED"] as const,
          queries: queriesForQuestion(question),
          minCoverage: minCoverage(question)
        },
        upgradeHints: {
          relatedInterventions: toInterventions(question),
          expectedEvidence: toExpectedEvidence(question)
        },
        contextualVariants: {
          "code-agent": contextualLine(question, "code-agent"),
          "support-agent": contextualLine(question, "support-agent"),
          "ops-agent": contextualLine(question, "ops-agent"),
          "research-agent": contextualLine(question, "research-agent"),
          "sales-agent": contextualLine(question, "sales-agent"),
          other: contextualLine(question, "other")
        }
      };
    });

  return diagnosticBankSchema.parse({
    diagnosticBank: {
      version: 1,
      dimensions: [
        { id: 1, name: "Strategic Agent Operations", questionCount: 13 },
        { id: 2, name: "Agent Leadership", questionCount: 18 },
        { id: 3, name: "Agent Culture", questionCount: 20 },
        { id: 4, name: "Agent Resilience", questionCount: 16 },
        { id: 5, name: "Agent Skills", questionCount: 22 }
      ],
      questions
    }
  });
}
