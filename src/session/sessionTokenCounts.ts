/**
 * PXA-12: the token counts a session measured, per turn and per compaction, read back
 * from its own signed rows, so they survive resume (same rows) and fork (the child
 * records its parent's counts at the fork point). A count nobody measured is null,
 * never 0: a step without usage, a manual receipt (bytes, not tokens), or a compaction
 * whose next request never ran.
 */
import type { EvidenceEvent } from "../types.js";
import { extractEnvelope } from "./sessionTypes.js";
import { compactionReceipt } from "./surfaceCompactionValidation.js";

/** The child's audit row that carries its parent's counts at the fork point. */
export const FORK_TOKEN_COUNTS_AUDIT = "FORK_TOKEN_COUNTS";
const FIELDS = ["inputTokens", "outputTokens", "cacheRead", "cacheWrite"] as const;
type Tokens = Record<typeof FIELDS[number], number | null>;
/** Sums over the steps that reported each field; null when none did. `measuredSteps < steps` marks a partial turn. */
interface TurnTokenCount { readonly turn: number; readonly steps: number; readonly measuredSteps: number; readonly tokens: Tokens }
interface CompactionTokenCount {
  readonly eventId: string; readonly turn: number | null;
  /** The measured prompt that triggered an automatic compaction. */
  readonly promptTokensBefore: number | null;
  /** The next request's measured prompt, when one ran and reported usage. */
  readonly promptTokensAfter: number | null;
}
export interface SessionTokenCounts {
  readonly turns: readonly TurnTokenCount[];
  readonly compactions: readonly CompactionTokenCount[];
  readonly inherited: ({ readonly parentSessionId: string } & SessionTokenCounts) | null;
}

function meta(row: EvidenceEvent): Record<string, unknown> { return JSON.parse(row.meta_json) as Record<string, unknown>; }
const count = (value: unknown): number | null => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;

export function sessionTokenCounts(rows: readonly EvidenceEvent[]): SessionTokenCounts {
  const turns = new Map<number, { steps: number; measuredSteps: number; tokens: Tokens }>();
  const compactions: CompactionTokenCount[] = [], after = new Map<string, number | null>();
  let inherited: SessionTokenCounts["inherited"] = null;
  for (const row of rows) {
    const raw = meta(row), turn = extractEnvelope(row.meta_json)?.turn ?? null;
    if (row.event_type === "step/end" && turn !== null) {
      const total = turns.get(turn) ?? { steps: 0, measuredSteps: 0, tokens: { inputTokens: null, outputTokens: null, cacheRead: null, cacheWrite: null } };
      const usage = raw.usage as Record<string, unknown> | null;
      total.steps += 1;
      if (usage != null) {
        total.measuredSteps += 1;
        for (const field of FIELDS) {
          const value = count(usage[field]);
          if (value !== null) total.tokens[field] = (total.tokens[field] ?? 0) + value;
        }
      }
      turns.set(turn, total);
    } else if (row.event_type === "loop/compact" && raw.compaction !== undefined) {
      const receipt = compactionReceipt(row);
      compactions.push({ eventId: row.id, turn, promptTokensBefore: receipt.v === 2 ? receipt.trigger.promptTokens : null, promptTokensAfter: null });
    } else if (row.event_type === "audit" && raw.auditType === "COMPACTION_EFFECT_OBSERVED" && Array.isArray(raw.compactionEventIds)) {
      for (const id of raw.compactionEventIds) after.set(String(id), count(raw.promptTokensAfter));
    } else if (row.event_type === "audit" && raw.auditType === FORK_TOKEN_COUNTS_AUDIT && typeof raw.parentSessionId === "string") {
      inherited = { parentSessionId: raw.parentSessionId, ...(raw.counts as SessionTokenCounts) };
    }
  }
  return {
    turns: [...turns].map(([turn, total]) => ({ turn, ...total })),
    compactions: compactions.map(compaction => ({ ...compaction, promptTokensAfter: after.get(compaction.eventId) ?? null })),
    inherited
  };
}
