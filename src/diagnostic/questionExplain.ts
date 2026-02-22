import type { DiagnosticQuestion } from "../types.js";
import { questionBank } from "./questionBank.js";

const LAYER_EXPLANATIONS: Record<string, string> = {
  "Strategic Agent Operations":
    "This layer verifies whether your agent strategy is explicit, enforced, and measurable during execution.",
  "Leadership & Autonomy":
    "This layer checks autonomy controls, escalation logic, and ownership clarity for high-impact actions.",
  "Culture & Alignment":
    "This layer checks whether team behavior, governance expectations, and production behavior stay aligned.",
  Resilience:
    "This layer measures whether controls hold under failures, regressions, and adversarial conditions.",
  Skills:
    "This layer checks whether the team can repeatedly implement, validate, and improve governance controls."
};

export interface DiagnosticQuestionExplanation {
  questionId: string;
  title: string;
  layerName: string;
  whatItMeasures: string;
  whyItMatters: string;
  howToImprove: string[];
  exampleEvidence: string[];
}

function normalizeQuestionId(questionId: string): string {
  return questionId.trim().toUpperCase();
}

function compactSentence(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function firstNonEmptySentences(text: string, maxItems: number): string[] {
  return text
    .split(/[.!?]\s+/)
    .map((row) => compactSentence(row))
    .filter((row) => row.length > 0)
    .slice(0, maxItems)
    .map((row) => (/[.!?]$/.test(row) ? row : `${row}.`));
}

function buildImprovementSteps(question: DiagnosticQuestion): string[] {
  const fromHints = firstNonEmptySentences(question.upgradeHints, 2);
  const fromKnobs = question.tuningKnobs.slice(0, 2).map((knob) => `Tune: ${knob}.`);
  const fallback = [`Apply controls until evidence can consistently support at least L3 for ${question.id}.`];
  const steps = [...fromHints, ...fromKnobs];
  return steps.length > 0 ? steps : fallback;
}

function buildEvidenceExamples(question: DiagnosticQuestion): string[] {
  const level3Option = question.options.find((option) => option.level === 3);
  const level3Gate = question.gates.find((gate) => gate.level === 3);
  const examples: string[] = [];

  if (level3Option) {
    examples.push(...level3Option.typicalEvidence.slice(0, 2).map((row) => compactSentence(row)));
  }
  if (level3Gate?.requiredEvidenceTypes.length) {
    examples.push(`Required evidence types for L3 include: ${level3Gate.requiredEvidenceTypes.join(", ")}.`);
  }
  if (question.evidenceGateHints.trim().length > 0) {
    examples.push(firstNonEmptySentences(question.evidenceGateHints, 1)[0] ?? question.evidenceGateHints.trim());
  }

  return [...new Set(examples.filter((row) => row.length > 0))].slice(0, 4);
}

function findQuestion(questionId: string): DiagnosticQuestion {
  const normalized = normalizeQuestionId(questionId);
  const found = questionBank.find((question) => question.id.toUpperCase() === normalized);
  if (!found) {
    throw new Error(
      `Unknown question ID: ${questionId}. Use a value like AMC-2.1 or AMC-3.2.4.`
    );
  }
  return found;
}

export function explainDiagnosticQuestion(questionId: string): DiagnosticQuestionExplanation {
  const question = findQuestion(questionId);
  const layerContext =
    LAYER_EXPLANATIONS[question.layerName] ??
    "This question contributes to your evidence-backed maturity and governance confidence.";

  return {
    questionId: question.id,
    title: question.title,
    layerName: question.layerName,
    whatItMeasures: compactSentence(question.promptTemplate),
    whyItMatters: `${layerContext} ${compactSentence(question.evidenceGateHints)}`,
    howToImprove: buildImprovementSteps(question),
    exampleEvidence: buildEvidenceExamples(question)
  };
}

