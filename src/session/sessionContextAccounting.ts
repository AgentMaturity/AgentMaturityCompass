/**
 * Per-turn context occupancy (SH-LOOP-07), read back from a session's signed rows.
 *
 * Occupancy is PER REQUEST, not per turn: the prompt a step sent is that step's
 * `inputTokens + cacheRead + cacheWrite` (promptTokensFor, the same formula the
 * automatic compactor measures). Summing a turn's steps, as the token-count fold
 * does for cost, would multiply the prompt by the step count and let the ratio
 * exceed 1. So each turn reports the LAST measured step's prompt (how full the
 * window was when the turn ended) and the largest one it reached.
 *
 * The window is a signed fact only where a row recorded it: an automatic
 * `loop/compact` receipt carries the effective `contextWindowTokens` it fired
 * against. A session that never compacted has no recorded window and reports
 * null, never the catalog's number, because an operator `--context-window`
 * override would have changed it and nothing signed says which applied.
 */
import type { EvidenceEvent } from "../types.js";
import { extractEnvelope, type TokenUsage } from "./sessionTypes.js";
import { compactionReceipt, promptTokensFor } from "./surfaceCompactionValidation.js";

export interface TurnContextOccupancy {
  readonly turn: number;
  readonly steps: number;
  readonly measuredSteps: number;
  /** Prompt tokens of the last step that reported usage; null when none did. */
  readonly lastPromptTokens: number | null;
  readonly maxPromptTokens: number | null;
  /** The window the last automatic compaction in this session fired against, or null when none recorded one. */
  readonly contextWindowTokens: number | null;
  /** lastPromptTokens / contextWindowTokens, when both are known. */
  readonly ratio: number | null;
  /** Signed `loop/compact` rows inside this turn. */
  readonly compactions: number;
}

export interface SessionContextAccounting {
  readonly turns: readonly TurnContextOccupancy[];
  readonly contextWindowTokens: number | null;
  readonly formula: "inputTokens+cacheRead+cacheWrite";
}

function usageOf(row: EvidenceEvent): TokenUsage | null {
  const usage = (JSON.parse(row.meta_json) as { usage?: unknown }).usage;
  if (usage === null || usage === undefined || typeof usage !== "object") return null;
  const value = usage as Record<string, unknown>;
  const count = (field: unknown): number | null => typeof field === "number" && Number.isSafeInteger(field) && field >= 0 ? field : null;
  const inputTokens = count(value.inputTokens), outputTokens = count(value.outputTokens);
  if (inputTokens === null || outputTokens === null) return null;
  return { inputTokens, outputTokens, cacheRead: count(value.cacheRead), cacheWrite: count(value.cacheWrite) };
}

export function sessionContextAccounting(rows: readonly EvidenceEvent[]): SessionContextAccounting {
  const turns = new Map<number, { steps: number; measuredSteps: number; last: number | null; max: number | null; compactions: number }>();
  let window: number | null = null;
  const turnOf = (turn: number) => {
    const found = turns.get(turn) ?? { steps: 0, measuredSteps: 0, last: null, max: null, compactions: 0 };
    turns.set(turn, found);
    return found;
  };
  for (const row of rows) {
    const turn = extractEnvelope(row.meta_json)?.turn ?? null;
    if (turn === null) continue;
    if (row.event_type === "step/end") {
      const total = turnOf(turn);
      total.steps += 1;
      const prompt = promptTokensFor(usageOf(row));
      if (prompt === null) continue;
      total.measuredSteps += 1;
      total.last = prompt;
      total.max = total.max === null ? prompt : Math.max(total.max, prompt);
    } else if (row.event_type === "loop/compact" && (JSON.parse(row.meta_json) as { compaction?: unknown }).compaction !== undefined) {
      turnOf(turn).compactions += 1;
      try {
        const receipt = compactionReceipt(row);
        if (receipt.v === 2) window = receipt.trigger.contextWindowTokens;
      } catch { /* a manual receipt carries no window */ }
    }
  }
  return {
    contextWindowTokens: window,
    formula: "inputTokens+cacheRead+cacheWrite",
    turns: [...turns].sort((a, b) => a[0] - b[0]).map(([turn, total]) => ({
      turn, steps: total.steps, measuredSteps: total.measuredSteps, lastPromptTokens: total.last, maxPromptTokens: total.max,
      contextWindowTokens: window, compactions: total.compactions,
      ratio: total.last !== null && window !== null && window > 0 ? Math.round((total.last / window) * 1000) / 1000 : null
    }))
  };
}

/** One line per turn for `amc session show`. */
export function renderSessionContextAccounting(accounting: SessionContextAccounting): string[] {
  const lines = [`Context per turn (prompt = ${accounting.formula}; window ${accounting.contextWindowTokens ?? "not recorded"})`];
  for (const turn of accounting.turns) {
    lines.push(`  turn ${turn.turn}: last prompt ${turn.lastPromptTokens ?? "unmeasured"} · peak ${turn.maxPromptTokens ?? "unmeasured"}`
      + ` · ${turn.ratio === null ? "ratio n/a" : `${Math.round(turn.ratio * 100)}% of window`} · ${turn.measuredSteps}/${turn.steps} steps measured · ${turn.compactions} compaction(s)`);
  }
  return lines;
}
