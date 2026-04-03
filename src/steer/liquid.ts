/**
 * Liquid Response Streaming (AMC-429)
 *
 * SSE-compatible streaming transform that applies steer-stage transforms
 * to chunked LLM responses in real-time. Supports OpenAI-style SSE
 * (data: {...}\n\n) and Anthropic-style event streams.
 *
 * Key features:
 * - Token-level buffering with configurable flush thresholds
 * - Per-chunk micro-scoring accumulation
 * - Hygiene transforms applied at sentence boundaries (not mid-word)
 */

import type { SteerStage, SteerResponseContext } from "./types.js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface LiquidChunk {
  index: number;
  delta: string;
  accumulatedText: string;
  flushed: boolean;
  timestamp: number;
}

export interface LiquidStreamState {
  chunks: LiquidChunk[];
  buffer: string;
  totalTokens: number;
  startTime: number;
  lastFlushTime: number;
}

export interface LiquidOptions {
  /** Minimum characters before flushing buffer (default 50) */
  flushThreshold?: number;
  /** Flush on sentence boundary even if below threshold */
  flushOnSentenceBoundary?: boolean;
  /** Apply hygiene transforms to flushed content */
  applyHygiene?: boolean;
  /** Transform function for flushed text */
  transform?: (text: string) => string;
}

// ── Sentence boundary detection ────────────────────────────────────────────

const SENTENCE_BOUNDARY = /[.!?]\s+/;

function findLastSentenceBoundary(text: string): number {
  let lastIndex = -1;
  let match: RegExpExecArray | null;
  const regex = new RegExp(SENTENCE_BOUNDARY.source, "g");
  while ((match = regex.exec(text)) !== null) {
    lastIndex = match.index + match[0].length;
  }
  return lastIndex;
}

// ── Core streaming logic ───────────────────────────────────────────────────

export function createLiquidStreamState(): LiquidStreamState {
  return {
    chunks: [],
    buffer: "",
    totalTokens: 0,
    startTime: Date.now(),
    lastFlushTime: Date.now(),
  };
}

/**
 * Ingest a delta (new token/chunk) into the stream state.
 * Returns the text to flush (may be empty if still buffering).
 */
export function ingestDelta(
  state: LiquidStreamState,
  delta: string,
  options: LiquidOptions = {},
): string {
  const threshold = options.flushThreshold ?? 50;
  const flushOnSentence = options.flushOnSentenceBoundary ?? true;

  state.buffer += delta;
  state.totalTokens++;

  const chunk: LiquidChunk = {
    index: state.chunks.length,
    delta,
    accumulatedText: state.buffer,
    flushed: false,
    timestamp: Date.now(),
  };
  state.chunks.push(chunk);

  // Check flush conditions
  let flushText = "";

  if (state.buffer.length >= threshold) {
    // Flush at sentence boundary if possible
    if (flushOnSentence) {
      const boundary = findLastSentenceBoundary(state.buffer);
      if (boundary > 0) {
        flushText = state.buffer.slice(0, boundary);
        state.buffer = state.buffer.slice(boundary);
      } else {
        flushText = state.buffer;
        state.buffer = "";
      }
    } else {
      flushText = state.buffer;
      state.buffer = "";
    }
  } else if (flushOnSentence && SENTENCE_BOUNDARY.test(state.buffer)) {
    const boundary = findLastSentenceBoundary(state.buffer);
    if (boundary > 0) {
      flushText = state.buffer.slice(0, boundary);
      state.buffer = state.buffer.slice(boundary);
    }
  }

  if (flushText) {
    if (options.transform) {
      flushText = options.transform(flushText);
    }
    chunk.flushed = true;
    state.lastFlushTime = Date.now();
  }

  return flushText;
}

/**
 * Flush any remaining buffer content (call at end of stream).
 */
export function flushRemaining(
  state: LiquidStreamState,
  options: LiquidOptions = {},
): string {
  if (!state.buffer) return "";
  let text = state.buffer;
  state.buffer = "";
  if (options.transform) {
    text = options.transform(text);
  }
  state.lastFlushTime = Date.now();
  return text;
}

/**
 * Parse an OpenAI SSE line into a delta string.
 * Returns null for non-content lines (e.g., [DONE]).
 */
export function parseSSEDelta(line: string): string | null {
  if (!line.startsWith("data: ")) return null;
  const data = line.slice(6).trim();
  if (data === "[DONE]") return null;
  try {
    const parsed = JSON.parse(data) as Record<string, unknown>;
    if (Array.isArray(parsed.choices)) {
      const first = (parsed.choices as Array<Record<string, unknown>>)[0];
      const delta = first?.delta as Record<string, unknown> | undefined;
      if (delta && typeof delta.content === "string") {
        return delta.content;
      }
    }
    // Anthropic content_block_delta
    if (parsed.type === "content_block_delta") {
      const d = parsed.delta as Record<string, unknown> | undefined;
      if (d && typeof d.text === "string") {
        return d.text;
      }
    }
  } catch {
    // Not valid JSON
  }
  return null;
}

// ── Steer stage ────────────────────────────────────────────────────────────

/**
 * Creates a SteerStage that tags streaming responses for liquid processing.
 * The actual streaming transform happens in the runtime layer;
 * this stage annotates metadata so the runtime knows to apply liquid logic.
 */
export function createLiquidStage(options: LiquidOptions = {}): SteerStage {
  return {
    id: "liquid-stream",
    enabled: true,
    onRequest: async (context) => {
      return {
        ...context,
        metadata: {
          ...context.metadata,
          liquidOptions: options,
          liquidEnabled: true,
        },
      };
    },
  };
}
