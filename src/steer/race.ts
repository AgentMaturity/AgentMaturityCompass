/**
 * Race — Multi-model fan-out and best-of-N selection (AMC-428)
 *
 * Fans a single request out to N model endpoints in parallel,
 * scores all responses via micro-score, and returns the best one.
 * Integrates as a SteerStage that replaces the single-model path.
 */

import type { SteerStage, SteerRequestContext, SteerResponseContext } from "./types.js";
import { microScore, type MicroScoreResult, type MicroScoreOptions } from "./microScore.js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface RaceCandidate {
  id: string;
  url: string;
  /** Override headers for this candidate (e.g., different API key) */
  headers?: Record<string, string>;
  /** Override body fields (e.g., model name) */
  bodyOverrides?: Record<string, unknown>;
}

export interface RaceResult {
  winnerId: string;
  winnerScore: MicroScoreResult;
  candidates: Array<{
    id: string;
    score: MicroScoreResult;
    latencyMs: number;
    error?: string;
  }>;
  totalLatencyMs: number;
}

export interface RaceOptions {
  candidates: RaceCandidate[];
  /** Scoring options forwarded to microScore */
  scoring?: MicroScoreOptions;
  /** Timeout per candidate in ms (default 30_000) */
  timeoutMs?: number;
  /** If true, return fastest response above threshold instead of best score */
  fastestAboveThreshold?: number;
}

// ── Core race logic ────────────────────────────────────────────────────────

function extractResponseText(body: Record<string, unknown>): string {
  // OpenAI
  if (Array.isArray(body.choices)) {
    const first = (body.choices as Array<Record<string, unknown>>)[0];
    const msg = first?.message as Record<string, unknown> | undefined;
    if (msg && typeof msg.content === "string") return msg.content;
  }
  // Anthropic
  if (Array.isArray(body.content)) {
    const first = (body.content as Array<Record<string, unknown>>)[0];
    if (first && typeof first.text === "string") return first.text;
  }
  return "";
}

async function fetchCandidate(
  candidate: RaceCandidate,
  baseInit: RequestInit,
  baseBody: Record<string, unknown> | null,
  timeoutMs: number,
): Promise<{ body: Record<string, unknown>; latencyMs: number }> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = new Headers(baseInit.headers);
    if (candidate.headers) {
      for (const [k, v] of Object.entries(candidate.headers)) {
        headers.set(k, v);
      }
    }

    let bodyStr = baseInit.body as string | undefined;
    if (baseBody && candidate.bodyOverrides) {
      const merged = { ...baseBody, ...candidate.bodyOverrides };
      bodyStr = JSON.stringify(merged);
    }

    const response = await fetch(candidate.url, {
      ...baseInit,
      headers,
      body: bodyStr,
      signal: controller.signal,
    });

    const body = (await response.json()) as Record<string, unknown>;
    return { body, latencyMs: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Race multiple candidates and return the best response.
 */
export async function raceModels(
  init: RequestInit,
  options: RaceOptions,
): Promise<RaceResult> {
  const startTime = Date.now();
  const timeoutMs = options.timeoutMs ?? 30_000;

  let baseBody: Record<string, unknown> | null = null;
  if (typeof init.body === "string") {
    try {
      baseBody = JSON.parse(init.body) as Record<string, unknown>;
    } catch {
      // non-JSON body
    }
  }

  const results = await Promise.allSettled(
    options.candidates.map((candidate) =>
      fetchCandidate(candidate, init, baseBody, timeoutMs).then(
        ({ body, latencyMs }) => {
          const text = extractResponseText(body);
          const score = microScore(text, options.scoring);
          return { id: candidate.id, score, latencyMs, body };
        },
      ),
    ),
  );

  const candidates: RaceResult["candidates"] = results.map((r, i) => {
    if (r.status === "fulfilled") {
      return {
        id: r.value.id,
        score: r.value.score,
        latencyMs: r.value.latencyMs,
      };
    }
    return {
      id: options.candidates[i]!.id,
      score: microScore("", options.scoring),
      latencyMs: 0,
      error: r.reason instanceof Error ? r.reason.message : String(r.reason),
    };
  });

  // Select winner
  let winner = candidates[0]!;
  if (options.fastestAboveThreshold !== undefined) {
    const threshold = options.fastestAboveThreshold;
    const qualifying = candidates
      .filter((c) => !c.error && c.score.composite >= threshold)
      .sort((a, b) => a.latencyMs - b.latencyMs);
    if (qualifying.length > 0) {
      winner = qualifying[0]!;
    } else {
      // Fallback to best score
      winner = [...candidates].sort(
        (a, b) => b.score.composite - a.score.composite,
      )[0]!;
    }
  } else {
    winner = [...candidates].sort(
      (a, b) => b.score.composite - a.score.composite,
    )[0]!;
  }

  return {
    winnerId: winner.id,
    winnerScore: winner.score,
    candidates,
    totalLatencyMs: Date.now() - startTime,
  };
}

/**
 * Create a SteerStage that races multiple model endpoints.
 * NOTE: This stage is request-level — it replaces the normal fetch.
 * Attach race metadata for downstream stages to consume.
 */
export function createRaceStage(options: RaceOptions): SteerStage {
  return {
    id: "race",
    enabled: true,
    onRequest: async (
      context: SteerRequestContext,
    ): Promise<SteerRequestContext> => {
      // Tag the context so the runtime knows to use race logic
      return {
        ...context,
        metadata: {
          ...context.metadata,
          raceOptions: options,
        },
      };
    },
  };
}
