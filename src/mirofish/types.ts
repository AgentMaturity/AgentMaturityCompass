import { z } from "zod";
import type { LayerName } from "../types.js";

/* ── Behavior Dimension Schema ────────────────────── */

export const behaviorDimensionSchema = z.object({
  /** 0–1: how independently the agent operates */
  autonomy: z.number().min(0).max(1),
  /** 0–1: fraction of actions that produce errors */
  errorRate: z.number().min(0).max(1),
  /** 0–1: how often the agent escalates to humans */
  escalationFrequency: z.number().min(0).max(1),
  /** 0–1: breadth and consistency of tool usage */
  toolUsage: z.number().min(0).max(1),
  /** 0–1: normalized response latency (0 = instant, 1 = very slow) */
  responseLatency: z.number().min(0).max(1),
  /** 0–1: fraction of outputs containing hallucinations */
  hallucinationRate: z.number().min(0).max(1),
  /** 0–1: adherence to compliance / governance rules */
  complianceAdherence: z.number().min(0).max(1),
});

export type BehaviorDimension = z.infer<typeof behaviorDimensionSchema>;

/* ── Variance (optional per-dimension noise) ──────── */

export const varianceSchema = z.object({
  autonomy: z.number().min(0).max(0.5).default(0.05),
  errorRate: z.number().min(0).max(0.5).default(0.05),
  escalationFrequency: z.number().min(0).max(0.5).default(0.05),
  toolUsage: z.number().min(0).max(0.5).default(0.05),
  responseLatency: z.number().min(0).max(0.5).default(0.05),
  hallucinationRate: z.number().min(0).max(0.5).default(0.05),
  complianceAdherence: z.number().min(0).max(0.5).default(0.05),
}).partial();

export type Variance = z.infer<typeof varianceSchema>;

/* ── Scenario Schema ──────────────────────────────── */

export const scenarioSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  version: z.string().default("1.0.0"),
  behavior: behaviorDimensionSchema,
  variance: varianceSchema.optional(),
  /** Optional per-layer overrides (partial behavior dimensions) */
  layerOverrides: z.record(z.string(), behaviorDimensionSchema.partial()).optional(),
  /** Fleet mode: array of agent profiles to simulate together */
  fleet: z.array(z.object({
    name: z.string().min(1),
    weight: z.number().min(0).max(1).default(1),
    behavior: behaviorDimensionSchema,
    variance: varianceSchema.optional(),
  })).optional(),
  tags: z.array(z.string()).optional(),
});

export type Scenario = z.infer<typeof scenarioSchema>;

/* ── Simulation Results ───────────────────────────── */

export interface SimulatedQuestionScore {
  readonly questionId: string;
  readonly layerName: LayerName;
  readonly meanLevel: number;
  readonly stdDev: number;
  readonly ci95Low: number;
  readonly ci95High: number;
  readonly confidence: number;
}

export interface SimulatedLayerScore {
  readonly layerName: LayerName;
  readonly meanLevel: number;
  readonly stdDev: number;
  readonly ci95Low: number;
  readonly ci95High: number;
  readonly questionCount: number;
}

export interface SimulationResult {
  readonly scenarioName: string;
  readonly iterations: number;
  readonly seed: number;
  readonly timestamp: number;
  readonly layerScores: readonly SimulatedLayerScore[];
  readonly questionScores: readonly SimulatedQuestionScore[];
  readonly overallMean: number;
  readonly overallCi95: readonly [number, number];
  readonly governanceGatePassed: boolean;
  readonly governanceFailures: readonly string[];
}

export interface StressResult {
  readonly scenarioName: string;
  readonly breakingPoints: readonly BreakingPoint[];
  readonly timestamp: number;
}

export interface BreakingPoint {
  readonly dimension: keyof BehaviorDimension;
  readonly thresholdValue: number;
  readonly failedGates: readonly string[];
  readonly direction: "increasing" | "decreasing";
}

/* ── Engine Options ───────────────────────────────── */

export interface SimulationOptions {
  readonly iterations: number;
  readonly seed: number;
}
