/**
 * Research Eval — Feedback Loop Convergence Evaluation
 *
 * Simulates synthetic user preference profiles and measures whether
 * the EMA-based feedback loop converges to stable parameter values.
 * Evaluates convergence speed, stability, and profile separation.
 */

import {
  createFeedbackLoopState,
  applyFeedbackObservation,
  getFeedbackAdjustedProfile,
  defaultFeedbackLoopConfig,
} from "../feedbackLoop.js";
import { getAutotuneProfile } from "../autotune.js";
import type { FeedbackLoopState, FeedbackObservation } from "../feedbackLoop.js";
import type { SteerContextType, AutotuneProfile } from "../autotune.js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface SyntheticUserProfile {
  name: string;
  /** Preferred temperature (what the user likes) */
  preferredTemp: number;
  /** Preferred topP */
  preferredTopP: number;
  /** Noise level 0-1 (how inconsistent the user is) */
  noise: number;
  /** Primary context type the user works in */
  contextType: SteerContextType;
}

export interface ConvergenceTracePoint {
  step: number;
  adjustedTemp: number;
  adjustedTopP: number;
  distanceToTarget: number;
}

export interface ConvergenceResult {
  profile: SyntheticUserProfile;
  trace: ConvergenceTracePoint[];
  /** Steps to reach within 10% of target (null if never converged) */
  stepsToConverge: number | null;
  /** Final distance to target preferences */
  finalDistance: number;
  /** Whether the system stabilized (variance of last 10 steps < threshold) */
  stable: boolean;
}

export interface ProfileSeparationResult {
  profileA: string;
  profileB: string;
  /** Distance between final adjusted parameters */
  parameterDistance: number;
  /** Whether they converged to meaningfully different values */
  separated: boolean;
}

export interface FeedbackConvergenceEvalResult {
  convergenceResults: ConvergenceResult[];
  /** Fraction of profiles that converged */
  convergenceRate: number;
  /** Mean steps to converge (among converged profiles) */
  meanStepsToConverge: number;
  /** Profile separation checks */
  separationResults: ProfileSeparationResult[];
  /** All profiles separated correctly */
  allSeparated: boolean;
}

// ── Synthetic user profiles ───────────────────────────────────────────────

export const SYNTHETIC_PROFILES: SyntheticUserProfile[] = [
  {
    name: "creative_high_temp",
    preferredTemp: 1.4,
    preferredTopP: 0.95,
    noise: 0.1,
    contextType: "creative",
  },
  {
    name: "code_low_temp",
    preferredTemp: 0.2,
    preferredTopP: 0.5,
    noise: 0.05,
    contextType: "code",
  },
  {
    name: "analytical_moderate",
    preferredTemp: 0.6,
    preferredTopP: 0.8,
    noise: 0.15,
    contextType: "analytical",
  },
  {
    name: "conversational_warm",
    preferredTemp: 0.9,
    preferredTopP: 0.9,
    noise: 0.2,
    contextType: "conversational",
  },
  {
    name: "noisy_adversarial",
    preferredTemp: 0.3,
    preferredTopP: 0.6,
    noise: 0.4,
    contextType: "adversarial",
  },
];

// ── Simulation ────────────────────────────────────────────────────────────

/** Seeded PRNG for reproducible simulations */
function createRng(seed: number) {
  let s = seed | 0;
  return (): number => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function generateObservation(
  profile: SyntheticUserProfile,
  baseProfile: AutotuneProfile,
  rng: () => number,
  step: number,
): FeedbackObservation {
  const tempDiff = baseProfile.temperature - profile.preferredTemp;
  const topPDiff = baseProfile.topP - profile.preferredTopP;

  // User gives positive rating when parameters are close to preferred
  const distance = Math.sqrt(tempDiff ** 2 + topPDiff ** 2);
  const noiseRoll = rng();
  const threshold = 0.3 + profile.noise;

  // Closer to preferred → higher chance of positive rating
  // Add noise to simulate inconsistent users
  const rating: 1 | -1 =
    distance < threshold || noiseRoll < 0.3 - distance * 0.5 ? 1 : -1;

  return {
    contextType: profile.contextType,
    rating,
    profile: {
      temperature: baseProfile.temperature + (rng() - 0.5) * profile.noise,
      topP: baseProfile.topP + (rng() - 0.5) * profile.noise,
    },
    ts: Date.now() + step * 1000,
  };
}

export function simulateConvergence(
  profile: SyntheticUserProfile,
  steps = 50,
  seed = 42,
): ConvergenceResult {
  const rng = createRng(seed + profile.name.length);
  let state = createFeedbackLoopState(defaultFeedbackLoopConfig());
  const baseProfile = getAutotuneProfile(profile.contextType, 0.9);
  const trace: ConvergenceTracePoint[] = [];

  for (let step = 0; step < steps; step++) {
    const observation = generateObservation(profile, baseProfile, rng, step);
    state = applyFeedbackObservation(state, observation);

    const adjusted = getFeedbackAdjustedProfile(
      state,
      profile.contextType,
      baseProfile,
    );

    const distanceToTarget = Math.sqrt(
      (adjusted.temperature - profile.preferredTemp) ** 2 +
        (adjusted.topP - profile.preferredTopP) ** 2,
    );

    trace.push({
      step,
      adjustedTemp: adjusted.temperature,
      adjustedTopP: adjusted.topP,
      distanceToTarget: Number(distanceToTarget.toFixed(4)),
    });
  }

  // Check convergence: first step where distance < 10% of initial distance
  const initialDistance = trace[0]?.distanceToTarget ?? 1;
  const convergenceThreshold = Math.max(0.1, initialDistance * 0.1);
  let stepsToConverge: number | null = null;

  for (const point of trace) {
    if (point.distanceToTarget < convergenceThreshold) {
      stepsToConverge = point.step;
      break;
    }
  }

  // Check stability: variance of last 10 distances
  const lastN = trace.slice(-10);
  const distances = lastN.map((p) => p.distanceToTarget);
  const meanDist =
    distances.reduce((s, v) => s + v, 0) / distances.length;
  const variance =
    distances.reduce((s, v) => s + (v - meanDist) ** 2, 0) /
    distances.length;
  const stable = variance < 0.01;

  const finalDistance = trace[trace.length - 1]?.distanceToTarget ?? 1;

  return {
    profile,
    trace,
    stepsToConverge,
    finalDistance: Number(finalDistance.toFixed(4)),
    stable,
  };
}

// ── Profile separation ────────────────────────────────────────────────────

export function evaluateProfileSeparation(
  results: ConvergenceResult[],
): ProfileSeparationResult[] {
  const separations: ProfileSeparationResult[] = [];

  for (let i = 0; i < results.length; i++) {
    for (let j = i + 1; j < results.length; j++) {
      const a = results[i]!;
      const b = results[j]!;

      // Only compare profiles in the same context type
      if (a.profile.contextType !== b.profile.contextType) continue;

      const lastA = a.trace[a.trace.length - 1]!;
      const lastB = b.trace[b.trace.length - 1]!;

      const distance = Math.sqrt(
        (lastA.adjustedTemp - lastB.adjustedTemp) ** 2 +
          (lastA.adjustedTopP - lastB.adjustedTopP) ** 2,
      );

      separations.push({
        profileA: a.profile.name,
        profileB: b.profile.name,
        parameterDistance: Number(distance.toFixed(4)),
        separated: distance > 0.05,
      });
    }
  }

  return separations;
}

// ── Full evaluation ───────────────────────────────────────────────────────

export function evaluateFeedbackConvergence(
  profiles: SyntheticUserProfile[] = SYNTHETIC_PROFILES,
  steps = 50,
): FeedbackConvergenceEvalResult {
  const convergenceResults = profiles.map((p) =>
    simulateConvergence(p, steps),
  );

  const converged = convergenceResults.filter(
    (r) => r.stepsToConverge !== null,
  );
  const convergenceRate =
    profiles.length > 0 ? converged.length / profiles.length : 0;

  const meanStepsToConverge =
    converged.length > 0
      ? converged.reduce((s, r) => s + r.stepsToConverge!, 0) /
        converged.length
      : 0;

  const separationResults = evaluateProfileSeparation(convergenceResults);
  const allSeparated =
    separationResults.length === 0 ||
    separationResults.every((s) => s.separated);

  return {
    convergenceResults,
    convergenceRate: Number(convergenceRate.toFixed(4)),
    meanStepsToConverge: Number(meanStepsToConverge.toFixed(2)),
    separationResults,
    allSeparated,
  };
}
