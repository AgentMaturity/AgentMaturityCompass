/**
 * Research Eval — Hygiene Transform Precision/Recall/F1
 *
 * Evaluates each hygiene transform (hedges, preambles, casual mode) against
 * labeled corpora measuring true positives, false positives, false negatives,
 * precision, recall, and F1 per transform type.
 */

import { stripHedges, stripPreamble, casualMode } from "../hygiene.js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface HygieneSample {
  input: string;
  /** Expected output after transform. If null, input should be unchanged. */
  expected: string;
  /** Whether this sample should be modified by the transform */
  shouldModify: boolean;
}

export interface TransformMetrics {
  transform: string;
  tp: number; // correctly modified
  fp: number; // incorrectly modified (was clean, got changed)
  fn: number; // missed (should have been modified, wasn't)
  tn: number; // correctly left alone
  precision: number;
  recall: number;
  f1: number;
  totalSamples: number;
}

export interface HygienePrecisionResult {
  transforms: TransformMetrics[];
  overallF1: number;
}

// ── Labeled corpus for hedges ─────────────────────────────────────────────

export const HEDGE_SAMPLES: HygieneSample[] = [
  // Should modify (true positives)
  { input: "I think the answer is 42.", expected: "The answer is 42.", shouldModify: true },
  { input: "I believe this approach works.", expected: "This approach works.", shouldModify: true },
  { input: "Basically, it's a hash map.", expected: "It's a hash map.", shouldModify: true },
  { input: "Actually, that's incorrect.", expected: "That's incorrect.", shouldModify: true },
  { input: "Essentially, you need a queue.", expected: "You need a queue.", shouldModify: true },
  { input: "It's worth noting that arrays are zero-indexed.", expected: "Arrays are zero-indexed.", shouldModify: true },
  { input: "In my opinion, React is better.", expected: "React is better.", shouldModify: true },
  { input: "As far as I know, this is deprecated.", expected: "This is deprecated.", shouldModify: true },
  { input: "To be honest, the code is messy.", expected: "The code is messy.", shouldModify: true },
  { input: "I would say the complexity is O(n).", expected: "The complexity is O(n).", shouldModify: true },
  { input: "It's important to note that this is async.", expected: "This is async.", shouldModify: true },
  { input: "Quite frankly, the API is broken.", expected: "The API is broken.", shouldModify: true },

  // Should NOT modify (true negatives)
  { input: "Use a hash map for O(1) lookups.", expected: "Use a hash map for O(1) lookups.", shouldModify: false },
  { input: "The server returns a 404 error.", expected: "The server returns a 404 error.", shouldModify: false },
  { input: "Install dependencies with npm install.", expected: "Install dependencies with npm install.", shouldModify: false },
  { input: "Docker containers share the host kernel.", expected: "Docker containers share the host kernel.", shouldModify: false },
  { input: "Binary search has O(log n) time complexity.", expected: "Binary search has O(log n) time complexity.", shouldModify: false },
  { input: "The database uses B-tree indexes.", expected: "The database uses B-tree indexes.", shouldModify: false },
];

// ── Labeled corpus for preambles ──────────────────────────────────────────

export const PREAMBLE_SAMPLES: HygieneSample[] = [
  // Should modify
  { input: "Sure! Here is the code:\nfunction hello() {}", expected: "function hello() {}", shouldModify: true },
  { input: "Of course! The answer is 42.", expected: "The answer is 42.", shouldModify: true },
  { input: "Great question! Use async/await.", expected: "Use async/await.", shouldModify: true },
  { input: "Absolutely! I'd be happy to help. Here is how to do it.", expected: "Here is how to do it.", shouldModify: true },
  { input: "Certainly! The API endpoint is /users.", expected: "The API endpoint is /users.", shouldModify: true },
  { input: "Glad you asked! PostgreSQL is great.", expected: "PostgreSQL is great.", shouldModify: true },
  { input: "Happy to help! Just run npm install.", expected: "Just run npm install.", shouldModify: true },
  { input: "I'd be happy to help with that. The solution involves two steps.", expected: "The solution involves two steps.", shouldModify: true },
  { input: "No problem! Here's the fix.", expected: "Here's the fix.", shouldModify: true },
  { input: "Thanks for asking! Redis is an in-memory store.", expected: "Redis is an in-memory store.", shouldModify: true },

  // Should NOT modify
  { input: "The function returns a boolean value.", expected: "The function returns a boolean value.", shouldModify: false },
  { input: "First, install Node.js. Then run the script.", expected: "First, install Node.js. Then run the script.", shouldModify: false },
  { input: "Errors are logged to stderr.", expected: "Errors are logged to stderr.", shouldModify: false },
  { input: "The config file should be in YAML format.", expected: "The config file should be in YAML format.", shouldModify: false },
  { input: "TCP connections use a three-way handshake.", expected: "TCP connections use a three-way handshake.", shouldModify: false },
];

// ── Labeled corpus for casual mode ────────────────────────────────────────

export const CASUAL_SAMPLES: HygieneSample[] = [
  // Should modify
  { input: "However, the results were inconclusive.", expected: "But the results were inconclusive.", shouldModify: true },
  { input: "You should utilize this framework.", expected: "You should use this framework.", shouldModify: true },
  { input: "Furthermore, performance improved.", expected: "Also performance improved.", shouldModify: true },
  { input: "In order to deploy, run the script.", expected: "To deploy, run the script.", shouldModify: true },
  { input: "Due to the fact that it crashed, we rolled back.", expected: "Because it crashed, we rolled back.", shouldModify: true },
  { input: "The change was significant.", expected: "The change was big.", shouldModify: true },
  { input: "Endeavor to complete the task.", expected: "Try to complete the task.", shouldModify: true },
  { input: "With regard to your question, yes.", expected: "About your question, yes.", shouldModify: true },

  // Should NOT modify
  { input: "The quick brown fox jumps over the lazy dog.", expected: "The quick brown fox jumps over the lazy dog.", shouldModify: false },
  { input: "Use npm install to add packages.", expected: "Use npm install to add packages.", shouldModify: false },
  { input: "The server listens on port 3000.", expected: "The server listens on port 3000.", shouldModify: false },
  { input: "Run the tests with vitest.", expected: "Run the tests with vitest.", shouldModify: false },
  { input: "Python uses indentation for blocks.", expected: "Python uses indentation for blocks.", shouldModify: false },
];

// ── Evaluation ────────────────────────────────────────────────────────────

function evaluateTransform(
  name: string,
  transformFn: (text: string) => string,
  samples: HygieneSample[],
): TransformMetrics {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;

  for (const sample of samples) {
    const output = transformFn(sample.input);
    const wasModified = output !== sample.input;

    if (sample.shouldModify && wasModified) {
      tp++;
    } else if (!sample.shouldModify && wasModified) {
      fp++;
    } else if (sample.shouldModify && !wasModified) {
      fn++;
    } else {
      tn++;
    }
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 =
    precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : 0;

  return {
    transform: name,
    tp,
    fp,
    fn,
    tn,
    precision: Number(precision.toFixed(4)),
    recall: Number(recall.toFixed(4)),
    f1: Number(f1.toFixed(4)),
    totalSamples: samples.length,
  };
}

export function evaluateHygienePrecision(): HygienePrecisionResult {
  const transforms: TransformMetrics[] = [
    evaluateTransform("hedges", stripHedges, HEDGE_SAMPLES),
    evaluateTransform("preamble", stripPreamble, PREAMBLE_SAMPLES),
    evaluateTransform("casual", casualMode, CASUAL_SAMPLES),
  ];

  const overallF1 =
    transforms.reduce((sum, t) => sum + t.f1, 0) / transforms.length;

  return {
    transforms,
    overallF1: Number(overallF1.toFixed(4)),
  };
}
