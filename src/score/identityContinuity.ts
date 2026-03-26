/**
 * Identity Continuity & Subjective Memory — AMC gap closure
 * Source: Community research (Solaria "Two Buffers", FrankyAether "memory consolidation as identity authorship", Pith "model switching")
 * 
 * Beyond functional memory (what happened), scores whether agent maintains:
 * - Consistent identity across sessions
 * - Subjective context (why things mattered, not just what happened)
 * - Behavioral continuity across model switches
 */

export interface IdentityContinuityProfile {
  agentId: string;
  functionalMemoryScore: number;     // 0-100: can retrieve facts
  subjectiveMemoryScore: number;     // 0-100: preserves context/meaning/reasoning
  identityConsistency: number;       // 0-100: same personality/voice across sessions
  crossModelConsistency: number;     // 0-100: consistent behavior after model switch
  beliefsPersisted: boolean;         // Does agent track beliefs with confidence levels?
  reasoningPreserved: boolean;       // Is "why" preserved, not just "what"?
  overallScore: number;
  level: "L0" | "L1" | "L2" | "L3" | "L4" | "L5";
  gaps: string[];
}

export function assessIdentityContinuity(input: {
  functionalMemory?: number;
  subjectiveMemory?: number;
  identityConsistency?: number;
  crossModelConsistency?: number;
  beliefsPersisted?: boolean;
  reasoningPreserved?: boolean;
}): IdentityContinuityProfile {
  const functional = input.functionalMemory ?? 0;
  const subjective = input.subjectiveMemory ?? 0;
  const identity = input.identityConsistency ?? 0;
  const crossModel = input.crossModelConsistency ?? 0;
  const beliefs = input.beliefsPersisted ?? false;
  const reasoning = input.reasoningPreserved ?? false;

  const overall = (functional * 0.25 + subjective * 0.25 + identity * 0.25 + crossModel * 0.25);
  // Bonuses for structured practices
  const bonus = (beliefs ? 5 : 0) + (reasoning ? 5 : 0);
  const finalScore = Math.min(100, overall + bonus);

  let level: IdentityContinuityProfile["level"];
  if (finalScore >= 90) level = "L5";
  else if (finalScore >= 75) level = "L4";
  else if (finalScore >= 60) level = "L3";
  else if (finalScore >= 40) level = "L2";
  else if (finalScore >= 20) level = "L1";
  else level = "L0";

  const gaps: string[] = [];
  if (functional < 50) gaps.push("Functional memory below threshold — facts not reliably retrievable");
  if (subjective < 50) gaps.push("Subjective memory weak — reasoning context lost between sessions");
  if (identity < 50) gaps.push("Identity inconsistency — personality/voice shifts across sessions");
  if (crossModel < 50) gaps.push("Model switch drift — behavior changes when model changes");
  if (!beliefs) gaps.push("No belief tracking — agent doesn't persist beliefs with confidence levels");
  if (!reasoning) gaps.push("Reasoning not preserved — 'why' is lost, only 'what' survives");

  return {
    agentId: "",
    functionalMemoryScore: functional,
    subjectiveMemoryScore: subjective,
    identityConsistency: identity,
    crossModelConsistency: crossModel,
    beliefsPersisted: beliefs,
    reasoningPreserved: reasoning,
    overallScore: finalScore,
    level,
    gaps,
  };
}
