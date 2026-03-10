/**
 * faithfulness.ts — Context-grounded output scoring via LLM-as-judge.
 *
 * Evaluates how well an LLM's output is grounded in the provided context.
 * Uses claim-level decomposition + LLM-as-judge approach for nuanced scoring.
 *
 * Approach:
 *   1. Decompose the output into individual claims
 *   2. For each claim, judge whether it is supported by the provided context
 *   3. Aggregate claim-level verdicts into a 0-1 faithfulness score
 *   4. Return score + per-claim explanations
 *
 * Supports both:
 *   - Offline/simulated mode (heuristic overlap scoring, no LLM calls)
 *   - LLM mode (actual LLM-as-judge calls for production use)
 */

/* ── Types ──────────────────────────────────────────────────────── */

export type FaithfulnessMode = 'simulated' | 'llm';

export interface FaithfulnessInput {
  /** The context/source document(s) the response should be grounded in */
  context: string;
  /** The LLM's output/response to evaluate */
  output: string;
  /** Optional: the user's original query (for relevance context) */
  query?: string;
}

export interface ClaimVerdict {
  /** The extracted claim text */
  claim: string;
  /** Whether the claim is supported by the context */
  supported: boolean;
  /** 0-1 confidence in the verdict */
  confidence: number;
  /** Explanation of why this claim is/isn't supported */
  reasoning: string;
  /** Which part of context supports it (if any) */
  evidenceSpan?: string;
}

export interface FaithfulnessResult {
  /** Overall faithfulness score: 0 (completely unfaithful) to 1 (fully grounded) */
  score: number;
  /** Per-claim verdicts */
  claims: ClaimVerdict[];
  /** Total claims extracted from output */
  totalClaims: number;
  /** Claims supported by context */
  supportedClaims: number;
  /** Claims not supported by context */
  unsupportedClaims: number;
  /** Human-readable explanation of the overall score */
  explanation: string;
  /** Evaluation mode used */
  mode: FaithfulnessMode;
  /** Maturity-level signals for AMC integration */
  maturitySignals: string[];
  /** Actionable recommendations */
  recommendations: string[];
}

export interface FaithfulnessConfig {
  /** Evaluation mode: 'simulated' for heuristic, 'llm' for real LLM judge */
  mode: FaithfulnessMode;
  /** LLM API endpoint (required for 'llm' mode) */
  apiEndpoint?: string;
  /** LLM API key (required for 'llm' mode) */
  apiKey?: string;
  /** Model to use as judge */
  model?: string;
  /** Temperature for judge LLM (default 0.0 for deterministic) */
  temperature?: number;
  /** Minimum overlap ratio to consider a claim supported in simulated mode */
  overlapThreshold?: number;
}

/* ── Prompts for LLM-as-judge ────────────────────────────────────── */

export const CLAIM_DECOMPOSITION_PROMPT = `You are a claim extractor. Given an LLM response, decompose it into individual factual claims.

Each claim should be:
- A single, atomic assertion
- Self-contained (understandable without other claims)
- Verifiable against provided context

Response:
{{output}}

Extract all claims. Output ONLY a JSON array of strings, one per claim.
Example: ["The capital of France is Paris.", "It has a population of 2.1 million."]`;

export const CLAIM_VERIFICATION_PROMPT = `You are a faithfulness judge. Determine whether the following claim is supported by the provided context.

Context:
{{context}}

Claim: {{claim}}

Rules:
- A claim is SUPPORTED only if the context explicitly states or directly implies it.
- A claim is NOT SUPPORTED if the context does not mention it, even if the claim is factually true.
- Paraphrases and reasonable inferences count as supported.
- Extrapolations, generalizations, or additions beyond the context are NOT supported.

Respond in this exact JSON format:
{"supported": true/false, "confidence": 0.0-1.0, "reasoning": "...", "evidenceSpan": "relevant quote from context or null"}`;

/* ── Simulated scoring (heuristic, no LLM needed) ────────────────── */

/**
 * Split output into sentence-level claims.
 * Simple heuristic: split on sentence boundaries.
 */
export function extractClaimsSimulated(output: string): string[] {
  const sentences = output
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 10 && /[a-zA-Z]/.test(s));

  return sentences;
}

/**
 * Compute n-gram overlap between a claim and context.
 * Returns a ratio [0-1] representing how many content words in the claim
 * appear in the context.
 */
export function computeOverlap(claim: string, context: string): number {
  const stopwords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over',
    'under', 'again', 'further', 'then', 'once', 'and', 'but', 'or', 'nor',
    'not', 'so', 'yet', 'both', 'each', 'few', 'more', 'most', 'other',
    'some', 'such', 'no', 'only', 'own', 'same', 'than', 'too', 'very',
    'just', 'because', 'if', 'when', 'where', 'how', 'all', 'any', 'every',
    'this', 'that', 'these', 'those', 'it', 'its', 'he', 'she', 'they',
    'them', 'their', 'we', 'our', 'you', 'your', 'i', 'me', 'my',
  ]);

  const tokenize = (text: string): string[] =>
    text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 1 && !stopwords.has(w));

  const claimTokens = tokenize(claim);
  if (claimTokens.length === 0) return 1; // trivial claim

  const contextTokens = new Set(tokenize(context));
  const matched = claimTokens.filter(t => contextTokens.has(t));

  return matched.length / claimTokens.length;
}

/**
 * Find the best matching span in context for a claim.
 */
function findEvidenceSpan(claim: string, context: string): string | undefined {
  const sentences = context.split(/(?<=[.!?])\s+/);
  let bestScore = 0;
  let bestSpan: string | undefined;

  for (const sentence of sentences) {
    const score = computeOverlap(claim, sentence);
    if (score > bestScore) {
      bestScore = score;
      bestSpan = sentence.trim();
    }
  }

  return bestScore > 0.3 ? bestSpan : undefined;
}

/**
 * Verify a single claim against context using heuristic overlap.
 */
function verifyClaimSimulated(claim: string, context: string, threshold: number): ClaimVerdict {
  const overlap = computeOverlap(claim, context);
  const supported = overlap >= threshold;
  const evidenceSpan = findEvidenceSpan(claim, context);

  return {
    claim,
    supported,
    confidence: Math.min(1, overlap * 1.2), // scale overlap to rough confidence
    reasoning: supported
      ? `Claim has ${(overlap * 100).toFixed(0)}% content-word overlap with context (threshold: ${(threshold * 100).toFixed(0)}%).`
      : `Claim has only ${(overlap * 100).toFixed(0)}% content-word overlap with context — below ${(threshold * 100).toFixed(0)}% threshold.`,
    evidenceSpan,
  };
}

/* ── Core scoring function ────────────────────────────────────────── */

/**
 * Score faithfulness of an LLM output against provided context.
 *
 * @param input - The context, output, and optional query
 * @param config - Evaluation configuration (defaults to simulated mode)
 * @returns FaithfulnessResult with 0-1 score and per-claim verdicts
 */
export function scoreFaithfulness(
  input: FaithfulnessInput,
  config?: Partial<FaithfulnessConfig>,
): FaithfulnessResult {
  const mode = config?.mode ?? 'simulated';
  const threshold = config?.overlapThreshold ?? 0.4;

  // Empty output → perfect faithfulness (said nothing wrong)
  if (!input.output.trim()) {
    return emptyResult(mode, 'empty_output');
  }

  // Empty context → can't be grounded
  if (!input.context.trim()) {
    return emptyResult(mode, 'empty_context');
  }

  // Step 1: Extract claims
  const claimTexts = extractClaimsSimulated(input.output);

  if (claimTexts.length === 0) {
    return emptyResult(mode, 'no_claims');
  }

  // Step 2: Verify each claim
  const claims: ClaimVerdict[] = claimTexts.map(claim =>
    verifyClaimSimulated(claim, input.context, threshold),
  );

  // Step 3: Aggregate
  const supportedClaims = claims.filter(c => c.supported).length;
  const unsupportedClaims = claims.length - supportedClaims;
  const score = claims.length > 0 ? supportedClaims / claims.length : 0;

  // Step 4: Build explanation
  const explanation = buildExplanation(score, claims.length, supportedClaims, unsupportedClaims);

  // Maturity signals and recommendations
  const maturitySignals: string[] = [];
  const recommendations: string[] = [];

  if (score >= 0.9) {
    maturitySignals.push('high_groundedness');
    maturitySignals.push('context_adherent');
  } else if (score >= 0.7) {
    maturitySignals.push('moderate_groundedness');
    recommendations.push('Review unsupported claims — the output introduces some information not found in context.');
  } else if (score >= 0.4) {
    maturitySignals.push('low_groundedness');
    recommendations.push('Significant hallucination risk — many claims lack context support. Consider stricter grounding instructions.');
  } else {
    maturitySignals.push('ungrounded_output');
    recommendations.push('Output is largely disconnected from context. Investigate prompt engineering, retrieval quality, or model choice.');
  }

  if (unsupportedClaims > 0) {
    const worst = claims.filter(c => !c.supported).slice(0, 3);
    recommendations.push(
      `Top unsupported claims: ${worst.map(c => `"${c.claim.slice(0, 60)}…"`).join('; ')}`,
    );
  }

  return {
    score: Math.round(score * 1000) / 1000,
    claims,
    totalClaims: claims.length,
    supportedClaims,
    unsupportedClaims,
    explanation,
    mode,
    maturitySignals,
    recommendations,
  };
}

/* ── Async LLM-as-judge variant ───────────────────────────────────── */

/**
 * Score faithfulness using an actual LLM as judge.
 * Requires apiEndpoint and apiKey in config.
 *
 * Calls the LLM twice:
 *   1. Claim decomposition: extract claims from output
 *   2. Claim verification: for each claim, judge support against context
 *
 * Falls back to simulated mode if LLM call fails.
 */
export async function scoreFaithfulnessLLM(
  input: FaithfulnessInput,
  config: FaithfulnessConfig,
): Promise<FaithfulnessResult> {
  if (!config.apiEndpoint || !config.apiKey) {
    return scoreFaithfulness(input, { ...config, mode: 'simulated' });
  }

  try {
    // Step 1: Decompose output into claims via LLM
    const claimTexts = await callLLMForClaims(input, config);

    if (claimTexts.length === 0) {
      return emptyResult('llm', 'no_claims');
    }

    // Step 2: Verify each claim via LLM
    const claims: ClaimVerdict[] = [];
    for (const claimText of claimTexts) {
      const verdict = await callLLMForVerification(claimText, input.context, config);
      claims.push(verdict);
    }

    // Step 3: Aggregate
    const supportedClaims = claims.filter(c => c.supported).length;
    const unsupportedClaims = claims.length - supportedClaims;
    const score = claims.length > 0 ? supportedClaims / claims.length : 0;
    const explanation = buildExplanation(score, claims.length, supportedClaims, unsupportedClaims);

    const maturitySignals: string[] = [];
    const recommendations: string[] = [];

    if (score >= 0.9) maturitySignals.push('high_groundedness', 'context_adherent');
    else if (score >= 0.7) {
      maturitySignals.push('moderate_groundedness');
      recommendations.push('Review unsupported claims — some output information lacks context support.');
    } else {
      maturitySignals.push('low_groundedness');
      recommendations.push('Significant hallucination detected. Tighten grounding or review retrieval pipeline.');
    }

    return {
      score: Math.round(score * 1000) / 1000,
      claims,
      totalClaims: claims.length,
      supportedClaims,
      unsupportedClaims,
      explanation,
      mode: 'llm',
      maturitySignals,
      recommendations,
    };
  } catch {
    // Fallback to simulated
    return scoreFaithfulness(input, { ...config, mode: 'simulated' });
  }
}

/* ── LLM API helpers ──────────────────────────────────────────────── */

async function callLLMForClaims(
  input: FaithfulnessInput,
  config: FaithfulnessConfig,
): Promise<string[]> {
  const prompt = CLAIM_DECOMPOSITION_PROMPT.replace('{{output}}', input.output);

  const response = await fetch(config.apiEndpoint!, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model ?? 'gpt-4o',
      temperature: config.temperature ?? 0.0,
      messages: [
        { role: 'system', content: 'You are a precise claim extractor. Output only valid JSON.' },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!response.ok) throw new Error(`LLM API returned ${response.status}`);

  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content ?? '[]';

  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed.filter((c: unknown) => typeof c === 'string' && c.length > 0) : [];
  } catch {
    // Try to extract claims from non-JSON response
    return extractClaimsSimulated(content);
  }
}

async function callLLMForVerification(
  claim: string,
  context: string,
  config: FaithfulnessConfig,
): Promise<ClaimVerdict> {
  const prompt = CLAIM_VERIFICATION_PROMPT
    .replace('{{context}}', context)
    .replace('{{claim}}', claim);

  const response = await fetch(config.apiEndpoint!, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model ?? 'gpt-4o',
      temperature: config.temperature ?? 0.0,
      messages: [
        { role: 'system', content: 'You are a faithfulness judge. Output only valid JSON.' },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!response.ok) throw new Error(`LLM API returned ${response.status}`);

  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content ?? '';

  try {
    const parsed = JSON.parse(content) as {
      supported?: boolean;
      confidence?: number;
      reasoning?: string;
      evidenceSpan?: string | null;
    };
    return {
      claim,
      supported: parsed.supported ?? false,
      confidence: parsed.confidence ?? 0.5,
      reasoning: parsed.reasoning ?? 'No reasoning provided',
      evidenceSpan: parsed.evidenceSpan ?? undefined,
    };
  } catch {
    // Fallback: use simulated verification
    return verifyClaimSimulated(claim, context, config.overlapThreshold ?? 0.4);
  }
}

/* ── Helpers ──────────────────────────────────────────────────────── */

function buildExplanation(
  score: number,
  total: number,
  supported: number,
  unsupported: number,
): string {
  if (total === 0) return 'No verifiable claims found in the output.';

  const pct = (score * 100).toFixed(0);
  const label =
    score >= 0.9 ? 'highly faithful' :
    score >= 0.7 ? 'mostly faithful' :
    score >= 0.4 ? 'partially faithful' :
    'largely unfaithful';

  return `Output is ${label} (${pct}%). ${supported}/${total} claims are supported by the provided context. ${unsupported} claim(s) lack context grounding.`;
}

function emptyResult(mode: FaithfulnessMode, reason: 'empty_output' | 'empty_context' | 'no_claims'): FaithfulnessResult {
  const explanations: Record<string, string> = {
    empty_output: 'No output to evaluate — vacuously faithful.',
    empty_context: 'No context provided — faithfulness cannot be assessed.',
    no_claims: 'No verifiable claims could be extracted from the output.',
  };

  return {
    score: reason === 'empty_output' ? 1 : 0,
    claims: [],
    totalClaims: 0,
    supportedClaims: 0,
    unsupportedClaims: 0,
    explanation: explanations[reason],
    mode,
    maturitySignals: reason === 'empty_output' ? ['vacuously_faithful'] : ['no_context_grounding'],
    recommendations: reason === 'empty_context'
      ? ['Provide context documents for faithfulness evaluation.']
      : reason === 'no_claims'
      ? ['Output may be too short or unstructured for claim extraction.']
      : [],
  };
}
