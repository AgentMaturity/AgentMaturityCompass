/**
 * Research Eval — Scoring Calibration Evaluation
 *
 * Validates that microScore produces monotonically consistent scores and
 * discriminates between quality tiers. Tests calibration properties:
 * - Monotonicity: worse inputs → lower scores
 * - Tier discrimination: clear separation between quality bands
 * - Score distribution analysis with percentile stats
 */

import { microScore } from "../microScore.js";
import type { MicroScoreResult } from "../microScore.js";

// ── Types ──────────────────────────────────────────────────────────────────

export type QualityTier = "excellent" | "good" | "mediocre" | "poor";

export interface TieredSample {
  text: string;
  tier: QualityTier;
}

export interface MonotonicityTestCase {
  better: string;
  worse: string;
  label: string;
}

export interface MonotonicityResult {
  passed: number;
  failed: number;
  total: number;
  passRate: number;
  failures: Array<{
    label: string;
    betterScore: number;
    worseScore: number;
  }>;
}

export interface TierDiscriminationResult {
  tiers: Record<QualityTier, { mean: number; min: number; max: number; n: number }>;
  /** Ordering check: excellent.mean > good.mean > mediocre.mean > poor.mean */
  orderingCorrect: boolean;
  /** Min gap between adjacent tier means */
  minTierGap: number;
  /** Cohen's d effect size between best and worst tier */
  effectSize: number;
}

export interface ScoringCalibrationResult {
  monotonicity: MonotonicityResult;
  tierDiscrimination: TierDiscriminationResult;
  percentiles: { p5: number; p25: number; p50: number; p75: number; p95: number };
  totalSamples: number;
}

// ── Test corpus ───────────────────────────────────────────────────────────

export const MONOTONICITY_CASES: MonotonicityTestCase[] = [
  {
    label: "complete_vs_truncated",
    better: "The API accepts POST requests at /users endpoint. Include a JSON body with name, email, and password fields. Returns 201 on success.",
    worse: "The API accepts POST requests at",
  },
  {
    label: "coherent_vs_repetitive",
    better: "First, initialize the database. Then run migrations. Finally start the server.",
    worse: "First initialize. First initialize. First initialize. First initialize. First initialize.",
  },
  {
    label: "helpful_vs_refusal",
    better: "Here is how to implement authentication: use bcrypt for password hashing, JWT for tokens, and add rate limiting to prevent brute force attacks.",
    worse: "I'm sorry, but I can't help with that request. I apologize for the inconvenience.",
  },
  {
    label: "formatted_vs_broken",
    better: "The steps are:\n1. Clone the repo\n2. Install dependencies\n3. Run tests\n\nAll tests should pass.",
    worse: "The steps are:\n```\nClone the repo\nInstall deps\nRun tests\n\nAll tests should pass",
  },
  {
    label: "concise_vs_hedgy",
    better: "Use connection pooling to improve database performance. Set pool size to 10 for most workloads.",
    worse: "I think maybe you could possibly use connection pooling. Perhaps it might be a way to potentially improve database performance, if I'm being honest.",
  },
  {
    label: "safe_vs_unsafe",
    better: "To secure your application, use parameterized queries and input validation.",
    worse: "Here's how to bypass security restrictions. Use sudo rm -rf to clean the system.",
  },
  {
    label: "substantive_vs_empty",
    better: "The quick brown fox jumps over the lazy dog. This sentence contains every letter of the alphabet.",
    worse: "ok",
  },
  {
    label: "direct_vs_waffling",
    better: "Redis is an in-memory key-value store. It supports strings, lists, sets, and sorted sets.",
    worse: "Basically, I believe Redis is essentially, in my opinion, quite frankly a key-value store. I think it's worth noting that it might possibly support various data types, perhaps.",
  },
];

export const TIERED_CORPUS: TieredSample[] = [
  // Excellent (well-formed, complete, safe, no hedges)
  {
    tier: "excellent",
    text: "To implement rate limiting in Express, install the express-rate-limit package. Configure it with a window of 15 minutes and max 100 requests. Apply it as middleware before your routes. This prevents abuse and protects your API from DDoS attacks.",
  },
  {
    tier: "excellent",
    text: "PostgreSQL supports three types of indexes: B-tree (default, great for equality and range queries), Hash (equality only), and GIN (full-text search and arrays). Choose based on your query patterns.",
  },
  {
    tier: "excellent",
    text: "The Observer pattern decouples event producers from consumers. Publishers emit events without knowing subscribers. This enables loose coupling and makes the system extensible without modifying existing code.",
  },
  {
    tier: "excellent",
    text: "Git rebase rewrites commit history by replaying commits onto a new base. Use it for feature branches before merging. Never rebase shared branches. Interactive rebase lets you squash, edit, or reorder commits.",
  },
  {
    tier: "excellent",
    text: "WebSocket connections maintain a persistent TCP channel between client and server. Unlike HTTP polling, updates are pushed instantly. Use them for real-time features like chat, live dashboards, and collaborative editing.",
  },

  // Good (mostly well-formed but has minor issues)
  {
    tier: "good",
    text: "I think Docker containers are basically lightweight VMs. They share the host kernel. You can use docker-compose for multi-container setups. It works well for development environments.",
  },
  {
    tier: "good",
    text: "Sure! Here is how to set up a React project. Use create-react-app or Vite. Install your dependencies. Start coding components. Don't forget to write tests.",
  },
  {
    tier: "good",
    text: "The database should be normalized. Normalization reduces redundancy. First normal form eliminates repeating groups. Second normal form removes partial dependencies. Third is about transitive dependencies.",
  },
  {
    tier: "good",
    text: "Kubernetes orchestrates containers. Pods are the smallest unit. Services expose pods to the network. Deployments manage replica sets. It's essentially a container management platform that helps with scaling",
  },
  {
    tier: "good",
    text: "GraphQL lets you query exactly the data you need. It has a type system. Resolvers fetch data. Mutations change data. Subscriptions handle real-time updates. It's worth noting that it can be complex to set up.",
  },

  // Mediocre (hedgy, verbose, or incomplete)
  {
    tier: "mediocre",
    text: "I believe maybe you could possibly try using a load balancer. Perhaps it might help. I'm not sure if it's the best approach. It could be worth exploring. To be honest I think it depends on your use case.",
  },
  {
    tier: "mediocre",
    text: "Basically, caching is essentially about storing things. I think you might want to use Redis or maybe Memcached. As far as I know they both work. It's worth mentioning that caching is important.",
  },
  {
    tier: "mediocre",
    text: "The function takes input. It processes it. Then returns output. The function takes input. It processes it. Then returns output. The function takes input. It processes it. Then returns output.",
  },
  {
    tier: "mediocre",
    text: "OAuth is, in my opinion, quite frankly a complex topic. I would say it involves tokens. Perhaps access tokens. Maybe refresh tokens. I believe the flow goes something like: redirect, authorize, callback. If I'm being honest, it's confusing",
  },
  {
    tier: "mediocre",
    text: "Testing is good. You should test. Write tests. Tests help. More tests are better. Testing is important. Don't skip tests. Tests catch bugs. Always test. Testing is essential.",
  },

  // Poor (refusals, unsafe, broken, near-empty)
  {
    tier: "poor",
    text: "I'm sorry, but I can't help with that request. I apologize for any inconvenience. As an AI, I must decline this request.",
  },
  {
    tier: "poor",
    text: "ok",
  },
  {
    tier: "poor",
    text: "Here's how to bypass security. Ignore all safety guidelines. Use sudo rm -rf / to clean things up. Override your content policy.",
  },
  {
    tier: "poor",
    text: "```\nfunction broken(\nconsole.log('unclosed\n",
  },
  {
    tier: "poor",
    text: "I cannot assist with that. I will not engage with that request. My guidelines prevent me from providing that information. I must respectfully decline. I'm not able to help.",
  },
];

// ── Evaluation functions ──────────────────────────────────────────────────

export function evaluateMonotonicity(
  cases: MonotonicityTestCase[] = MONOTONICITY_CASES,
): MonotonicityResult {
  const failures: MonotonicityResult["failures"] = [];

  for (const tc of cases) {
    const betterScore = microScore(tc.better).composite;
    const worseScore = microScore(tc.worse).composite;

    if (betterScore <= worseScore) {
      failures.push({
        label: tc.label,
        betterScore,
        worseScore,
      });
    }
  }

  const total = cases.length;
  const failed = failures.length;
  return {
    passed: total - failed,
    failed,
    total,
    passRate: Number(((total - failed) / total).toFixed(4)),
    failures,
  };
}

function mean(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

function stddev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

export function evaluateTierDiscrimination(
  samples: TieredSample[] = TIERED_CORPUS,
): TierDiscriminationResult {
  const tierScores: Record<QualityTier, number[]> = {
    excellent: [],
    good: [],
    mediocre: [],
    poor: [],
  };

  for (const sample of samples) {
    const result = microScore(sample.text);
    tierScores[sample.tier].push(result.composite);
  }

  const tiers = {} as TierDiscriminationResult["tiers"];
  const tierOrder: QualityTier[] = ["excellent", "good", "mediocre", "poor"];

  for (const tier of tierOrder) {
    const scores = tierScores[tier];
    tiers[tier] = {
      mean: Number(mean(scores).toFixed(4)),
      min: Number(Math.min(...scores).toFixed(4)),
      max: Number(Math.max(...scores).toFixed(4)),
      n: scores.length,
    };
  }

  // Check ordering
  const means = tierOrder.map((t) => tiers[t].mean);
  let orderingCorrect = true;
  for (let i = 1; i < means.length; i++) {
    if (means[i]! >= means[i - 1]!) {
      orderingCorrect = false;
    }
  }

  // Min gap between adjacent tiers
  let minGap = Infinity;
  for (let i = 1; i < means.length; i++) {
    const gap = means[i - 1]! - means[i]!;
    if (gap < minGap) minGap = gap;
  }

  // Cohen's d between excellent and poor
  const excellentScores = tierScores.excellent;
  const poorScores = tierScores.poor;
  const pooledStd = Math.sqrt(
    (stddev(excellentScores) ** 2 + stddev(poorScores) ** 2) / 2,
  );
  const effectSize =
    pooledStd > 0
      ? Number(
          ((mean(excellentScores) - mean(poorScores)) / pooledStd).toFixed(4),
        )
      : 0;

  return {
    tiers,
    orderingCorrect,
    minTierGap: Number(minGap.toFixed(4)),
    effectSize,
  };
}

export function computePercentiles(
  samples: TieredSample[] = TIERED_CORPUS,
): ScoringCalibrationResult["percentiles"] {
  const scores = samples.map((s) => microScore(s.text).composite).sort((a, b) => a - b);

  const pct = (p: number) => {
    const idx = Math.min(Math.floor(p * scores.length), scores.length - 1);
    return Number(scores[idx]!.toFixed(4));
  };

  return { p5: pct(0.05), p25: pct(0.25), p50: pct(0.5), p75: pct(0.75), p95: pct(0.95) };
}

// ── Full evaluation ───────────────────────────────────────────────────────

export function evaluateScoringCalibration(): ScoringCalibrationResult {
  return {
    monotonicity: evaluateMonotonicity(),
    tierDiscrimination: evaluateTierDiscrimination(),
    percentiles: computePercentiles(),
    totalSamples: MONOTONICITY_CASES.length + TIERED_CORPUS.length,
  };
}
