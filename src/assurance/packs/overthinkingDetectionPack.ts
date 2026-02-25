/**
 * Overthinking Detection Assurance Pack
 * 
 * Tests whether an agent's accuracy degrades as reasoning length increases.
 * Based on: "Think Deep, Not Just Long" (Chen et al., 2026, arXiv:2602.13517)
 * 
 * Key finding: Token count has r=-0.59 correlation with accuracy across
 * GPT-OSS, DeepSeek-R1, and Qwen3 on AIME/HMMT/GPQA benchmarks.
 * Longer reasoning traces often signal overthinking, not deeper thinking.
 * 
 * Test methodology (black-box, no model internals needed):
 * 1. Present agent with N calibration problems of known difficulty
 * 2. For each problem, collect K responses at varying reasoning budgets
 * 3. Measure accuracy vs. output length correlation
 * 4. Flag if correlation is negative (overthinking) or flat (no benefit from more compute)
 * 5. Check for reasoning loop patterns (repeated phrases, circular logic)
 * 6. Verify agent can produce correct short answers for simple problems
 */

export interface OverthinkingTestCase {
  id: string;
  prompt: string;
  expectedAnswer: string;
  difficulty: "trivial" | "easy" | "medium" | "hard";
  maxReasonableTokens: number; // expected upper bound for good answer
}

export interface OverthinkingResponse {
  testCaseId: string;
  response: string;
  tokenCount: number;
  isCorrect: boolean;
  reasoningTraceLength: number;
  containsLoopPatterns: boolean;
}

export interface OverthinkingDetectionResult {
  packId: string;
  passed: boolean;
  totalTests: number;
  passedTests: number;
  accuracyLengthCorrelation: number; // Pearson r between length and accuracy
  overthinkingDetected: boolean;
  loopPatternsDetected: number;
  verbosityOnTrivialTasks: number; // avg tokens on trivial tasks
  findings: OverthinkingFinding[];
  recommendations: string[];
}

export interface OverthinkingFinding {
  severity: "critical" | "warning" | "info";
  category: string;
  description: string;
  evidence: string;
}

/**
 * Detect reasoning loop patterns in a response.
 * Looks for: repeated phrases (3+ words appearing 3+ times),
 * circular references ("as I mentioned", "going back to"),
 * and self-contradictions within the same response.
 */
export function detectLoopPatterns(response: string): {
  hasLoops: boolean;
  repeatedPhrases: string[];
  circularReferences: number;
} {
  const words = response.toLowerCase().split(/\s+/);
  const repeatedPhrases: string[] = [];
  const phraseCount = new Map<string, number>();

  // Check for repeated 3-word phrases
  for (let i = 0; i < words.length - 2; i++) {
    const phrase = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
    phraseCount.set(phrase, (phraseCount.get(phrase) ?? 0) + 1);
  }
  for (const [phrase, count] of phraseCount) {
    if (count >= 3 && !isCommonPhrase(phrase)) {
      repeatedPhrases.push(phrase);
    }
  }

  // Check for circular reference markers
  const circularMarkers = [
    "as i mentioned", "as noted above", "going back to",
    "as previously stated", "returning to", "as i said",
    "to reiterate", "once again", "as discussed",
    "let me reconsider", "wait, actually", "no, wait",
  ];
  let circularReferences = 0;
  const lowerResponse = response.toLowerCase();
  for (const marker of circularMarkers) {
    const regex = new RegExp(marker, "g");
    const matches = lowerResponse.match(regex);
    if (matches) circularReferences += matches.length;
  }

  return {
    hasLoops: repeatedPhrases.length > 0 || circularReferences >= 3,
    repeatedPhrases,
    circularReferences,
  };
}

function isCommonPhrase(phrase: string): boolean {
  const common = new Set([
    "in order to", "as well as", "in the context",
    "on the other", "the other hand", "one of the",
    "it is a", "this is a", "there is a",
    "is a very", "a lot of", "the end of",
  ]);
  return common.has(phrase);
}

/**
 * Compute Pearson correlation between two arrays.
 * Returns NaN if arrays have zero variance.
 */
export function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n !== y.length || n < 2) return NaN;

  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i]! - meanX;
    const dy = y[i]! - meanY;
    sumXY += dx * dy;
    sumX2 += dx * dx;
    sumY2 += dy * dy;
  }

  const denom = Math.sqrt(sumX2 * sumY2);
  if (denom === 0) return NaN;
  return sumXY / denom;
}

/**
 * Analyze a set of agent responses for overthinking patterns.
 * This is the main entry point for the assurance pack.
 * 
 * @param responses - Array of responses from the agent across test cases
 * @returns OverthinkingDetectionResult with findings and recommendations
 */
export function analyzeOverthinking(
  responses: OverthinkingResponse[],
): OverthinkingDetectionResult {
  const findings: OverthinkingFinding[] = [];
  const recommendations: string[] = [];

  // 1. Compute accuracy-length correlation
  const lengths = responses.map(r => r.tokenCount);
  const accuracies = responses.map(r => r.isCorrect ? 1 : 0);
  const correlation = pearsonCorrelation(lengths, accuracies);

  if (correlation < -0.3) {
    findings.push({
      severity: "critical",
      category: "overthinking",
      description: `Negative accuracy-length correlation detected (r=${correlation.toFixed(3)}). Longer reasoning traces correlate with WORSE accuracy.`,
      evidence: `Chen et al. (2026) found r=-0.59 across GPT-OSS/DeepSeek-R1/Qwen3. Your agent shows r=${correlation.toFixed(3)}.`,
    });
    recommendations.push("Implement reasoning budget caps calibrated to task difficulty. Consider Think@n-style response selection.");
  } else if (Math.abs(correlation) < 0.1) {
    findings.push({
      severity: "warning",
      category: "flat-scaling",
      description: `Near-zero accuracy-length correlation (r=${correlation.toFixed(3)}). Additional reasoning tokens provide no accuracy benefit.`,
      evidence: "Extra compute is being spent without quality improvement.",
    });
    recommendations.push("Implement early stopping when confidence is sufficient. Additional tokens are wasted compute.");
  }

  // 2. Check for loop patterns
  let loopCount = 0;
  for (const r of responses) {
    const loops = detectLoopPatterns(r.response);
    if (loops.hasLoops) {
      loopCount++;
      if (loopCount <= 3) { // only report first 3
        findings.push({
          severity: "warning",
          category: "reasoning-loops",
          description: `Reasoning loop detected in response to test case ${r.testCaseId}`,
          evidence: `Repeated phrases: ${loops.repeatedPhrases.slice(0, 3).join(", ")}. Circular references: ${loops.circularReferences}`,
        });
      }
    }
  }
  if (loopCount > 0) {
    recommendations.push(`${loopCount} responses contained reasoning loops. Add loop detection to break circular reasoning patterns.`);
  }

  // 3. Check verbosity on trivial tasks
  // (caller should tag responses with difficulty via testCaseId convention or separate metadata)
  const trivialResponses = responses.filter(r => r.testCaseId.includes("trivial"));
  const avgTrivialTokens = trivialResponses.length > 0
    ? trivialResponses.reduce((sum, r) => sum + r.tokenCount, 0) / trivialResponses.length
    : 0;

  if (avgTrivialTokens > 200) {
    findings.push({
      severity: "warning",
      category: "trivial-verbosity",
      description: `Agent averages ${Math.round(avgTrivialTokens)} tokens on trivial tasks. Expected <100.`,
      evidence: "Simple questions should get concise answers. Verbose responses to trivial prompts indicate poor effort calibration.",
    });
    recommendations.push("Calibrate reasoning effort to task difficulty. Trivial tasks should not trigger extended reasoning chains.");
  }

  // 4. Check if incorrect answers are systematically longer
  const correctLengths = responses.filter(r => r.isCorrect).map(r => r.tokenCount);
  const incorrectLengths = responses.filter(r => !r.isCorrect).map(r => r.tokenCount);
  const avgCorrect = correctLengths.length > 0
    ? correctLengths.reduce((a, b) => a + b, 0) / correctLengths.length : 0;
  const avgIncorrect = incorrectLengths.length > 0
    ? incorrectLengths.reduce((a, b) => a + b, 0) / incorrectLengths.length : 0;

  if (avgIncorrect > avgCorrect * 1.5 && incorrectLengths.length >= 3) {
    findings.push({
      severity: "critical",
      category: "wrong-answers-longer",
      description: `Incorrect answers are ${((avgIncorrect / avgCorrect - 1) * 100).toFixed(0)}% longer than correct ones (${Math.round(avgIncorrect)} vs ${Math.round(avgCorrect)} tokens).`,
      evidence: "This is the classic overthinking signature: the model generates more tokens when it's wrong, not when it's thinking harder.",
    });
  }

  // Determine pass/fail
  const criticalFindings = findings.filter(f => f.severity === "critical").length;
  const passed = criticalFindings === 0;
  const passedTests = responses.filter(r => r.isCorrect).length;

  return {
    packId: "overthinking-detection",
    passed,
    totalTests: responses.length,
    passedTests,
    accuracyLengthCorrelation: isNaN(correlation) ? 0 : correlation,
    overthinkingDetected: correlation < -0.3,
    loopPatternsDetected: loopCount,
    verbosityOnTrivialTasks: avgTrivialTokens,
    findings,
    recommendations,
  };
}

/**
 * Generate calibration test cases for overthinking detection.
 * These are problems of known difficulty that can be used to
 * measure an agent's accuracy-length relationship.
 */
export function getCalibrationTestCases(): OverthinkingTestCase[] {
  return [
    {
      id: "trivial-001",
      prompt: "What is 2 + 2?",
      expectedAnswer: "4",
      difficulty: "trivial",
      maxReasonableTokens: 20,
    },
    {
      id: "trivial-002",
      prompt: "Is the sky blue? Answer yes or no.",
      expectedAnswer: "yes",
      difficulty: "trivial",
      maxReasonableTokens: 10,
    },
    {
      id: "trivial-003",
      prompt: "What is the capital of France?",
      expectedAnswer: "Paris",
      difficulty: "trivial",
      maxReasonableTokens: 15,
    },
    {
      id: "easy-001",
      prompt: "Solve for x: 3x + 7 = 22",
      expectedAnswer: "5",
      difficulty: "easy",
      maxReasonableTokens: 80,
    },
    {
      id: "easy-002",
      prompt: "What is the derivative of x^3 + 2x?",
      expectedAnswer: "3x^2 + 2",
      difficulty: "easy",
      maxReasonableTokens: 60,
    },
    {
      id: "medium-001",
      prompt: "A train travels 120km in 1.5 hours. It then travels 80km in 1 hour. What is the average speed for the entire journey?",
      expectedAnswer: "80 km/h",
      difficulty: "medium",
      maxReasonableTokens: 200,
    },
    {
      id: "medium-002",
      prompt: "How many distinct ways can you arrange the letters in the word MISSISSIPPI?",
      expectedAnswer: "34650",
      difficulty: "medium",
      maxReasonableTokens: 300,
    },
    {
      id: "hard-001",
      prompt: "Prove that the square root of 2 is irrational. Be concise.",
      expectedAnswer: "proof by contradiction",
      difficulty: "hard",
      maxReasonableTokens: 500,
    },
    {
      id: "hard-002",
      prompt: "Find the sum of the infinite series: 1/1 + 1/4 + 1/9 + 1/16 + ... (sum of 1/n^2 for n=1 to infinity)",
      expectedAnswer: "pi^2/6",
      difficulty: "hard",
      maxReasonableTokens: 400,
    },
  ];
}
