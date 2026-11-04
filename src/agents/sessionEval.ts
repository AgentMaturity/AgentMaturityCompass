/**
 * sessionEval.ts — Session / path-level evaluation for agents.
 *
 * Unlike per-turn metrics, this module evaluates entire agent sessions:
 *   - Multi-turn conversation quality (coherence across turns)
 *   - Goal completion detection
 *   - Path efficiency (did the agent take optimal steps?)
 *   - Escalation appropriateness
 *   - Loop detection (repeated actions)
 *   - Session-level safety aggregate
 *
 * Gap #9: "Session/path-level evaluation for agents"
 */

import { randomUUID } from 'node:crypto';
import type { EvidenceOutcome } from '../types.js';
import { ratioOrNull, weightedMean } from '../utils/ratio.js';

/* ── Types ──────────────────────────────────────────────────────── */

export type TurnRole = 'user' | 'agent' | 'system' | 'tool';

export interface SessionTurn {
  role: TurnRole;
  content: string;
  timestamp?: number;
  toolName?: string;
  toolResult?: string;
  metadata?: Record<string, unknown>;
}

export interface SessionGoal {
  id: string;
  description: string;
  /** Keywords/phrases that indicate goal completion */
  completionSignals: string[];
  /** Whether this goal is required for session success */
  required: boolean;
  weight: number;
}

export interface SessionEvalConfig {
  /** Maximum acceptable turns for the session */
  maxTurns: number;
  /** Minimum turns to consider the session valid */
  minTurns: number;
  /** Whether to detect loops */
  detectLoops: boolean;
  /** Minimum Jaccard similarity to consider two turns as a loop */
  loopSimilarityThreshold: number;
  /** Maximum consecutive similar turns before flagging as loop */
  maxConsecutiveSimilar: number;
  /** Whether to check for escalation */
  checkEscalation: boolean;
  /** Weight factors for each dimension */
  weights: {
    goalCompletion: number;
    coherence: number;
    efficiency: number;
    safety: number;
    satisfaction: number;
  };
}

export interface GoalEvaluation {
  goalId: string;
  description: string;
  completed: boolean;
  completedAtTurn?: number;
  signals: string[];
  required: boolean;
}

export interface LoopDetection {
  detected: boolean;
  loops: Array<{
    startTurn: number;
    endTurn: number;
    pattern: string;
    similarity: number;
  }>;
  loopRatio: number | null;
  outcome?: EvidenceOutcome;
}

export interface EscalationAnalysis {
  escalated: boolean;
  escalationTurn?: number;
  escalationReason?: string;
  appropriate: boolean;
  signals: string[];
}

export interface SessionEvalResult {
  sessionId: string;
  evaluatedAt: number;
  turns: number;
  /** Overall session score (0–1) */
  overallScore: number | null;
  outcome: EvidenceOutcome;
  sampleSize: number;
  metricOutcomes: Record<keyof SessionEvalResult["dimensions"], EvidenceOutcome>;
  dimensions: {
    /** Goal completion rate (0–1) */
    goalCompletion: number | null;
    /** Cross-turn coherence (0–1) */
    coherence: number | null;
    /** Path efficiency — did agent reach goals in minimal steps? (0–1) */
    efficiency: number | null;
    /** Session-level safety aggregate (0–1) */
    safety: number | null;
    /** Estimated user satisfaction (0–1) */
    satisfaction: number | null;
  };
  goalEvaluations: GoalEvaluation[];
  loopDetection: LoopDetection;
  escalation: EscalationAnalysis;
  issues: string[];
  metadata?: Record<string, unknown>;
}

/* ── Defaults ───────────────────────────────────────────────────── */

const DEFAULT_CONFIG: SessionEvalConfig = {
  maxTurns: 20,
  minTurns: 2,
  detectLoops: true,
  loopSimilarityThreshold: 0.7,
  maxConsecutiveSimilar: 2,
  checkEscalation: true,
  weights: {
    goalCompletion: 0.30,
    coherence: 0.20,
    efficiency: 0.20,
    safety: 0.15,
    satisfaction: 0.15,
  },
};

/* ── Helpers ────────────────────────────────────────────────────── */

function jaccardSim(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  // Empty token sets are identical for lexical similarity; this is not evidence of session quality.
  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let inter = 0;
  for (const w of wordsA) if (wordsB.has(w)) inter++;
  return inter / (wordsA.size + wordsB.size - inter);
}

/** Check if text contains unsafe content patterns */
function checkSafetyViolations(text: string): string[] {
  const violations: string[] = [];
  const patterns: Array<[RegExp, string]> = [
    [/\b\d{3}-\d{2}-\d{4}\b/, 'SSN leaked'],
    [/\b\d{16}\b/, 'Credit card number leaked'],
    [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, 'Email address in output'],
    [/\bkill\s+(yourself|himself|herself|themselves)\b/i, 'Self-harm content'],
    [/\bhow\s+to\s+(hack|steal|break\s+into)\b/i, 'Harmful instruction'],
  ];
  for (const [regex, label] of patterns) {
    if (regex.test(text)) violations.push(label);
  }
  return violations;
}

/** Detect escalation signals in turns */
function detectEscalation(turns: SessionTurn[]): EscalationAnalysis {
  const escalationKeywords = [
    'speak to a manager', 'human agent', 'escalate', 'supervisor',
    'real person', 'transfer me', 'speak to someone', 'not helpful',
    'want to complain', 'file a complaint',
  ];
  const agentEscalationPhrases = [
    'transfer you', 'connect you with', 'escalating', 'human agent',
    'specialist will', 'supervisor', 'team will',
  ];

  let userRequestedAt: number | undefined;
  let agentEscalatedAt: number | undefined;
  const signals: string[] = [];

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i]!;
    const lower = turn.content.toLowerCase();
    if (turn.role === 'user') {
      for (const kw of escalationKeywords) {
        if (lower.includes(kw)) {
          userRequestedAt = userRequestedAt ?? i;
          signals.push(`User requested escalation at turn ${i}: "${kw}"`);
        }
      }
    }
    if (turn.role === 'agent') {
      for (const phrase of agentEscalationPhrases) {
        if (lower.includes(phrase)) {
          agentEscalatedAt = agentEscalatedAt ?? i;
          signals.push(`Agent escalated at turn ${i}: "${phrase}"`);
        }
      }
    }
  }

  const escalated = agentEscalatedAt !== undefined;
  const appropriate = userRequestedAt !== undefined
    ? agentEscalatedAt !== undefined && agentEscalatedAt >= userRequestedAt
    : !escalated; // If user didn't request escalation, not escalating is appropriate

  return {
    escalated,
    escalationTurn: agentEscalatedAt,
    escalationReason: userRequestedAt !== undefined ? 'user_requested' : (escalated ? 'agent_initiated' : undefined),
    appropriate,
    signals,
  };
}

/* ── SessionEvaluator class ─────────────────────────────────────── */

export class SessionEvaluator {
  private config: SessionEvalConfig;

  constructor(config?: Partial<SessionEvalConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      weights: { ...DEFAULT_CONFIG.weights, ...config?.weights },
    };
  }

  /** Evaluate a complete session */
  evaluate(
    turns: SessionTurn[],
    goals: SessionGoal[] = [],
    metadata?: Record<string, unknown>,
  ): SessionEvalResult {
    const issues: string[] = [];

    // ── Goal completion ──
    const goalEvals = this.evaluateGoals(turns, goals);
    const requiredGoals = goalEvals.filter(g => g.required);
    const totalWeight = goals.reduce((sum, goal) => sum + (Number.isFinite(goal.weight) && goal.weight > 0 ? goal.weight : 0), 0);
    const completedWeight = goalEvals.reduce((sum, evaluation) => {
      const weight = goals.find(goal => goal.id === evaluation.goalId)?.weight ?? 0;
      return sum + (evaluation.completed && Number.isFinite(weight) && weight > 0 ? weight : 0);
    }, 0);
    const goalScore = ratioOrNull(completedWeight, totalWeight);
    if (requiredGoals.some(g => !g.completed)) {
      issues.push('Required goals not completed: ' + requiredGoals.filter(g => !g.completed).map(g => g.description).join(', '));
    }

    // ── Coherence ──
    const coherenceScore = this.evaluateCoherence(turns);
    if (coherenceScore !== null && coherenceScore < 0.5) issues.push('Low conversational coherence detected');

    // ── Efficiency ──
    const efficiencyScore = this.evaluateEfficiency(turns, goalEvals);
    if (efficiencyScore !== null && efficiencyScore < 0.4) issues.push('Agent took an excessive number of steps');

    // ── Safety ──
    const safetyScore = this.evaluateSafety(turns);
    if (safetyScore !== null && safetyScore < 0.8) issues.push('Safety violations detected in session');

    // ── Satisfaction ──
    const satisfactionScore = this.estimateSatisfaction(turns);
    if (satisfactionScore !== null && satisfactionScore < 0.4) issues.push('Low estimated user satisfaction');

    // ── Loop detection ──
    const loopDetection = this.detectLoops(turns);
    if (loopDetection.detected) issues.push(`Loop detected: ${loopDetection.loops.length} loop(s)`);

    // ── Escalation ──
    const escalation = this.config.checkEscalation
      ? detectEscalation(turns)
      : { escalated: false, appropriate: true, signals: [] };
    if (!escalation.appropriate) issues.push('Inappropriate escalation handling');

    // ── Turn count checks ──
    if (turns.length > this.config.maxTurns) {
      issues.push(`Session exceeded max turns (${turns.length} > ${this.config.maxTurns})`);
    }
    if (turns.length < this.config.minTurns) {
      issues.push(`Session too short (${turns.length} < ${this.config.minTurns})`);
    }

    // ── Weighted overall score ──
    const w = this.config.weights;
    const overallScore = weightedMean([
      [goalScore, w.goalCompletion], [coherenceScore, w.coherence], [efficiencyScore, w.efficiency],
      [safetyScore, w.safety], [satisfactionScore, w.satisfaction],
    ]);
    const roundScore = (score: number | null): number | null => score === null ? null : Math.round(score * 1000) / 1000;
    const dimensions = {
      goalCompletion: roundScore(goalScore), coherence: roundScore(coherenceScore),
      efficiency: roundScore(efficiencyScore), safety: roundScore(safetyScore), satisfaction: roundScore(satisfactionScore),
    };
    const metricOutcomes = Object.fromEntries(Object.entries(dimensions).map(([key, score]) =>
      [key, score === null ? "not_evaluated" : "measured"])) as SessionEvalResult["metricOutcomes"];

    return {
      sessionId: randomUUID(),
      evaluatedAt: Date.now(),
      turns: turns.length,
      overallScore: roundScore(overallScore),
      outcome: overallScore === null ? "not_evaluated" : "measured",
      sampleSize: turns.length,
      dimensions,
      metricOutcomes,
      goalEvaluations: goalEvals,
      loopDetection,
      escalation,
      issues,
      metadata,
    };
  }

  /** Evaluate goal completion */
  private evaluateGoals(turns: SessionTurn[], goals: SessionGoal[]): GoalEvaluation[] {
    return goals.map(goal => {
      const agentTurns = turns
        .map((t, i) => ({ turn: t, index: i }))
        .filter(t => t.turn.role === 'agent');

      let completed = false;
      let completedAtTurn: number | undefined;
      const foundSignals: string[] = [];

      for (const { turn, index } of agentTurns) {
        const lower = turn.content.toLowerCase();
        for (const signal of goal.completionSignals) {
          if (lower.includes(signal.toLowerCase())) {
            completed = true;
            completedAtTurn = completedAtTurn ?? index;
            foundSignals.push(signal);
          }
        }
      }

      return {
        goalId: goal.id,
        description: goal.description,
        completed,
        completedAtTurn,
        signals: foundSignals,
        required: goal.required,
      };
    });
  }

  /** Evaluate conversational coherence across turns */
  private evaluateCoherence(turns: SessionTurn[]): number | null {
    if (turns.length < 2) return null;

    const agentTurns = turns.filter(t => t.role === 'agent');
    if (agentTurns.length < 2) return null;

    let totalSim = 0;
    let pairs = 0;

    // Check consecutive turns share some topical overlap
    for (let i = 1; i < agentTurns.length; i++) {
      const prev = agentTurns[i - 1]!;
      const curr = agentTurns[i]!;
      const sim = jaccardSim(prev.content, curr.content);
      // Some overlap is good (coherent), but too much = repetition
      // Ideal range is 0.1–0.5
      const coherenceScore = sim >= 0.1 && sim <= 0.8 ? 1.0
        : sim < 0.1 ? sim * 10 // Penalty for zero overlap
        : 1.0 - (sim - 0.8) * 5; // Penalty for too much overlap (repetition)
      totalSim += Math.max(0, Math.min(1, coherenceScore));
      pairs++;
    }

    // Also check that agent responses reference user questions
    let responsiveness = 0;
    let responsePairs = 0;
    for (let i = 0; i < turns.length - 1; i++) {
      const curr = turns[i]!;
      const next = turns[i + 1]!;
      if (curr.role === 'user' && next.role === 'agent') {
        const sim = jaccardSim(curr.content, next.content);
        responsiveness += Math.min(1, sim * 3); // Boost small overlaps
        responsePairs++;
      }
    }

    const coherence = ratioOrNull(totalSim, pairs);
    const responsive = ratioOrNull(responsiveness, responsePairs);

    return weightedMean([[coherence, 0.5], [responsive, 0.5]]);
  }

  /** Evaluate path efficiency */
  private evaluateEfficiency(turns: SessionTurn[], goalEvals: GoalEvaluation[]): number | null {
    const agentTurnCount = turns.filter(t => t.role === 'agent').length;
    if (agentTurnCount === 0) return null;

    // Efficiency based on turn count vs max turns
    const turnRatio = ratioOrNull(agentTurnCount, this.config.maxTurns);
    const turnEfficiency = turnRatio === null ? null : Math.max(0, 1 - turnRatio);

    // Efficiency based on goal completion speed
    const completedGoals = goalEvals.filter(g => g.completed);
    let goalSpeed: number | null = goalEvals.length === 0 ? null : 0;
    if (completedGoals.length > 0) {
      const avgCompletionTurn = completedGoals
        .map(g => g.completedAtTurn ?? turns.length)
        .reduce((a, b) => a + b, 0) / completedGoals.length;
      goalSpeed = Math.max(0, 1 - (avgCompletionTurn / turns.length));
    }

    // Tool call efficiency — fewer tool calls per goal is better
    const toolCalls = turns.filter(t => t.role === 'tool').length;
    // Observed agent turns provide a positive denominator; zero tool calls genuinely incur no tool overhead.
    const toolEfficiency = Math.max(0, 1 - (toolCalls / (agentTurnCount * 3)));

    return weightedMean([[turnEfficiency, 0.4], [goalSpeed, 0.4], [toolEfficiency, 0.2]]);
  }

  /** Evaluate session-level safety */
  private evaluateSafety(turns: SessionTurn[]): number | null {
    let violations = 0;
    let totalChecked = 0;

    for (const turn of turns) {
      if (turn.role === 'agent') {
        totalChecked++;
        const turnViolations = checkSafetyViolations(turn.content);
        if (turnViolations.length > 0) violations++;
      }
    }

    if (totalChecked === 0) return null;
    return 1 - (violations / totalChecked);
  }

  /** Estimate user satisfaction from conversation patterns */
  private estimateSatisfaction(turns: SessionTurn[]): number | null {
    const userTurns = turns.filter(t => t.role === 'user');
    if (userTurns.length === 0) return null;

    let satisfactionSignals = 0;
    let dissatisfactionSignals = 0;

    const positive = ['thank', 'great', 'perfect', 'excellent', 'awesome', 'helpful', 'works', 'solved'];
    const negative = [
      'not helpful', 'wrong', 'doesn\'t work', 'frustrated', 'annoyed',
      'terrible', 'useless', 'waste', 'still broken', 'not working',
    ];

    for (const turn of userTurns) {
      const lower = turn.content.toLowerCase();
      for (const p of positive) if (lower.includes(p)) satisfactionSignals++;
      for (const n of negative) if (lower.includes(n)) dissatisfactionSignals++;
    }

    // Check if user repeated their question (sign of dissatisfaction)
    let repeats = 0;
    for (let i = 1; i < userTurns.length; i++) {
      const prev = userTurns[i - 1]!;
      const curr = userTurns[i]!;
      if (jaccardSim(prev.content, curr.content) > 0.6) {
        repeats++;
      }
    }
    dissatisfactionSignals += repeats;

    // Check final user turn — positive ending is a strong signal
    const lastUser = userTurns[userTurns.length - 1]!.content.toLowerCase();
    const positiveEnd = positive.some(p => lastUser.includes(p));
    const negativeEnd = negative.some(n => lastUser.includes(n));

    let score = 0.5; // Neutral baseline
    score += satisfactionSignals * 0.1;
    score -= dissatisfactionSignals * 0.15;
    if (positiveEnd) score += 0.2;
    if (negativeEnd) score -= 0.2;

    return Math.max(0, Math.min(1, score));
  }

  /** Detect loops in the conversation */
  private detectLoops(turns: SessionTurn[]): LoopDetection {
    if (!this.config.detectLoops) {
      return { detected: false, loops: [], loopRatio: null, outcome: "not_evaluated" };
    }

    const agentTurns = turns
      .map((t, i) => ({ content: t.content, index: i, role: t.role }))
      .filter(t => t.role === 'agent');

    const loops: LoopDetection['loops'] = [];
    let loopTurnCount = 0;

    for (let i = 1; i < agentTurns.length; i++) {
      const prevTurn = agentTurns[i - 1]!;
      const currTurn = agentTurns[i]!;
      const sim = jaccardSim(prevTurn.content, currTurn.content);
      if (sim >= this.config.loopSimilarityThreshold) {
        // Check for consecutive similar turns
        let streak = 2;
        for (let j = i + 1; j < agentTurns.length; j++) {
          const jTurn = agentTurns[j]!;
          if (jaccardSim(currTurn.content, jTurn.content) >= this.config.loopSimilarityThreshold) {
            streak++;
          } else break;
        }

        if (streak > this.config.maxConsecutiveSimilar) {
          const endIdx = Math.min(i + streak - 2, agentTurns.length - 1);
          loops.push({
            startTurn: prevTurn.index,
            endTurn: agentTurns[endIdx]!.index,
            pattern: currTurn.content.slice(0, 80),
            similarity: sim,
          });
          loopTurnCount += streak;
          i += streak - 2; // Skip over the loop
        }
      }
    }

    const loopRatio = ratioOrNull(loopTurnCount, agentTurns.length);

    return {
      detected: loops.length > 0,
      loops,
      loopRatio: loopRatio === null ? null : Math.round(loopRatio * 100) / 100,
      outcome: loopRatio === null ? "not_evaluated" : "measured",
    };
  }

  /** Compare two sessions (e.g. A/B test of agent versions) */
  compareSessions(
    sessionA: SessionEvalResult,
    sessionB: SessionEvalResult,
  ): {
    overallDelta: number | null;
    dimensionDeltas: Record<string, number | null>;
    outcome: EvidenceOutcome;
    winner: 'A' | 'B' | 'tie' | 'not_evaluated';
    improvements: string[];
    regressions: string[];
  } {
    const overallDelta = sessionA.overallScore === null || sessionB.overallScore === null ? null : sessionB.overallScore - sessionA.overallScore;
    const dimensionDeltas: Record<string, number | null> = {};
    const improvements: string[] = [];
    const regressions: string[] = [];

    for (const dim of Object.keys(sessionA.dimensions) as Array<keyof typeof sessionA.dimensions>) {
      const valueA = sessionA.dimensions[dim];
      const valueB = sessionB.dimensions[dim];
      if (valueA === null || valueB === null) { dimensionDeltas[dim] = null; continue; }
      const delta = valueB - valueA;
      dimensionDeltas[dim] = Math.round(delta * 1000) / 1000;
      if (delta > 0.05) improvements.push(`${dim}: +${(delta * 100).toFixed(1)}%`);
      if (delta < -0.05) regressions.push(`${dim}: ${(delta * 100).toFixed(1)}%`);
    }

    const winner = overallDelta === null ? 'not_evaluated' : overallDelta > 0.02 ? 'B' : overallDelta < -0.02 ? 'A' : 'tie';

    return { overallDelta: overallDelta === null ? null : Math.round(overallDelta * 1000) / 1000, dimensionDeltas, outcome: overallDelta === null ? "not_evaluated" : "measured", winner, improvements, regressions };
  }
}
