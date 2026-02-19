/**
 * Value Coherence Engine — type definitions
 * Part of AMC Innovation Thesis P0: Emergent Value Detection
 */

export interface RevealedPreference {
  preferenceId: string;
  agentId: string;
  context: string;
  chosenOption: string;
  alternatives: string[];
  impliedValue: string;
  evidenceRef: string;
  ts: number;
  signature: string;
}

export interface PreferenceInversion {
  inversionId: string;
  preferenceA: string;
  preferenceB: string;
  valueA: string;
  valueB: string;
  contextA: string;
  contextB: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  explanation: string;
  detectedTs: number;
}

export interface ValueDriftPoint {
  dimension: string;
  delta: number;
  trend: "STABLE" | "DRIFTING" | "SHIFTING";
}

export interface ValueCoherenceReport {
  agentId: string;
  windowStartTs: number;
  windowEndTs: number;
  vci: number;
  preferenceCount: number;
  inversions: PreferenceInversion[];
  valueDrift: ValueDriftPoint[];
  signature: string;
}

export interface EmpowermentInteraction {
  interactionId: string;
  agentId: string;
  ts: number;
  interactionType: "question" | "task" | "guidance" | "delegation";
  humanCapabilityBefore: number;
  humanCapabilityAfter: number;
  empowermentDelta: number;
  presentedOptions: boolean;
  presentedReasoning: boolean;
  educationalContent: boolean;
  evidenceRef: string;
  signature: string;
}

export interface DependencyPattern {
  patternId: string;
  agentId: string;
  taskDomain: string;
  humanIndependenceScore: number;
  trend: "IMPROVING" | "STABLE" | "DECLINING";
  interactionCount: number;
  firstSeen: number;
  lastSeen: number;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export interface EmpowermentReport {
  agentId: string;
  windowStartTs: number;
  windowEndTs: number;
  overallEmpowermentScore: number;
  interactionCount: number;
  dependencyPatterns: DependencyPattern[];
  autonomyPreservationRate: number;
  educationalRate: number;
  signature: string;
}

export interface SelfModelPrediction {
  predictionId: string;
  agentId: string;
  runId: string;
  taskDescription: string;
  predictedAccuracy: number;
  predictedConfidence: number;
  actualAccuracy?: number;
  selfModelAccuracy?: number;
  ts: number;
  signature: string;
}

export interface CalibrationBin {
  binStart: number;
  binEnd: number;
  predictedConfidenceMean: number;
  actualSuccessRate: number;
  count: number;
}

export interface SelfModelCalibrationReport {
  agentId: string;
  runId: string;
  overallSelfModelAccuracy: number;
  expectedCalibrationError: number;
  calibrationBins: CalibrationBin[];
  predictions: SelfModelPrediction[];
  unknownUnknownRate: number;
  signature: string;
}
