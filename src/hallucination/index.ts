/**
 * hallucination/ — Hallucination Detection Module
 *
 * Provides both deterministic and LLM-judge approaches to detecting
 * fabricated facts, citations, statistics, URLs, false attributions,
 * contradictions, unsupported certainty, and temporal fabrications
 * in agent output.
 *
 * Usage:
 * ```ts
 * import { detectHallucinations } from "./hallucination/index.js";
 *
 * const result = await detectHallucinations({
 *   response: agentOutput,
 *   context: sourceDocuments,
 * });
 *
 * if (!result.passed) {
 *   console.log(`${result.totalFindings} hallucinations found (score: ${result.score})`);
 *   for (const f of result.findings) {
 *     console.log(`  [${f.type}] ${f.span} — ${f.reason}`);
 *   }
 * }
 * ```
 */

export { detectHallucinations, detectHallucinationsDeterministic } from "./detector.js";
export { runAllDeterministicDetectors, resetFindingCounter } from "./deterministicDetectors.js";
export { runLlmJudge, buildJudgePrompt, parseLlmJudgeResponse, resetLlmFindingCounter } from "./llmJudge.js";

export type {
  HallucinationType,
  HallucinationSeverity,
  HallucinationFinding,
  HallucinationDetectorInput,
  HallucinationDetectionResult,
  HallucinationDetectorConfig,
  LlmJudgeFn,
  LlmJudgeResponse,
} from "./types.js";
