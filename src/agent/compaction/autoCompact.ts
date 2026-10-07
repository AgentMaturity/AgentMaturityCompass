/**
 * Automatic compaction at a step boundary (P1-37).
 *
 * Deterministic first: old, large tool results are replaced by a fixed pointer
 * naming their bytes, digest and source row. Only when that is not enough does
 * one extra `compaction-summary` step ask the model to summarize the oldest
 * completed turns, through the normal request path (signed header, settlement,
 * usage, budget admission). Every edit is a signed `loop/compact` v2 receipt
 * citing the measurement that fired it. The replaced rows and spill objects are
 * never touched: compaction changes what the model sees, not what was recorded.
 */
import type { SettledStream } from "../../llm/adapter/streamRecorder.js";
import { isLlmError } from "../../llm/llmFailure.js";
import { RequestEncodingError } from "../../llm/request/requestSpec.js";
import { extractEnvelope, type TokenUsage } from "../../session/sessionTypes.js";
import { describeLiveEntries, describeMeasuredLiveEntries, type LiveSurfaceEntry } from "../../session/surfaceCompaction.js";
import { fenceModelSummary, MODEL_SUMMARY_ROLE, PROMPT_TOKENS_FORMULA, SUMMARY_CLAIM_KIND, selectCompactionEntries,
  type AutomaticCompaction } from "../../session/surfaceCompactionValidation.js";
import { foldSurfaceEntries } from "../../session/surfaceProjection.js";
import type { EvidenceEvent } from "../../types.js";
import type { CompactionConfig } from "../loopTypes.js";
import { dispatchStepRequest } from "../requestRetry.js";
import { stepUsage, type StepRunnerInit } from "../stepRunner.js";
import { measurePromptPressure } from "./promptPressure.js";
import { COMPACTION_SUMMARY_STEP, SUMMARY_PROMPT_VERSION, summaryPrompt } from "./summaryPrompt.js";

type Trigger = AutomaticCompaction["trigger"];
type Notify = (message: string, eventIds?: readonly string[]) => void;
interface Position { readonly turn: number | null; readonly step: number | null }
interface Outcome { readonly eventIds: readonly string[]; readonly steps: number }
const NOTHING: Outcome = { eventIds: [], steps: 0 };

function positions(events: readonly EvidenceEvent[]): ReadonlyMap<string, Position> {
  return new Map(events.map(row => {
    const envelope = extractEnvelope(row.meta_json);
    return [row.id, { turn: envelope?.turn ?? null, step: envelope?.step ?? null }];
  }));
}

/** The last `keep` model steps, from signed `step/start` rows; earlier summary steps do not count. */
function recentSteps(events: readonly EvidenceEvent[], keep: number): readonly Position[] {
  const at = positions(events);
  return events.filter(row => row.event_type === "step/start"
    && (JSON.parse(row.meta_json) as { kind?: unknown }).kind !== COMPACTION_SUMMARY_STEP).slice(-keep).map(row => at.get(row.id)!);
}

/** The oldest contiguous run of whole completed turns before `cutoff`; whole turns keep every tool pair intact. */
function oldestCompletedTurns<T extends LiveSurfaceEntry>(live: readonly T[], at: ReadonlyMap<string, Position>, cutoff: number): readonly T[] {
  const first = live.findIndex(entry => entry.role !== "system");
  const range: T[] = [];
  for (const entry of first < 0 ? [] : live.slice(first)) {
    const turn = at.get(entry.originEventId)?.turn ?? null;
    if (entry.role === "system" || turn === null || turn >= cutoff) break;
    range.push(entry);
  }
  if (range.length <= 256) return range;
  // A receipt cites at most 256 sources: stop at the last whole turn that fits.
  const cut = at.get(range[256]!.originEventId)?.turn;
  return range.slice(0, 256).filter(entry => at.get(entry.originEventId)?.turn !== cut);
}

/**
 * The assistant and tool runs of a range. User messages (and any other role)
 * split runs and are never summarized: the user's own instructions stay
 * verbatim and keep their authority; only the agent's work is paraphrased.
 */
function summarizableRuns<T extends LiveSurfaceEntry>(range: readonly T[]): readonly (readonly T[])[] {
  const runs: T[][] = [];
  let current: T[] = [];
  for (const entry of range) {
    if (entry.role === "assistant" || entry.role === "tool") { current.push(entry); continue; }
    if (current.length > 0) runs.push(current);
    current = [];
  }
  return current.length > 0 ? [...runs, current] : runs;
}

/** Complete text-only answers qualify; a tool call, a truncated block or empty text does not. */
function summaryText(settled: SettledStream | null): string | null {
  if (settled === null || settled.assembly.finishReason?.kind !== "stop") return null;
  const kept = settled.assembly.blocks.filter(record => record.outcome.status !== "dropped");
  if (kept.some(record => record.outcome.status !== "completed" || (record.block?.kind !== "text" && record.block?.kind !== "thinking"))) return null;
  const text = kept.flatMap(record => record.block?.kind === "text" ? [record.block.text] : []).join("\n").trim();
  return text.length > 0 ? text : null;
}

/** A provider, budget or wire-encoding refusal skips the summary. AMC_ codes are AMC's own contract or evidence failures. */
function isRefusal(error: unknown): boolean {
  return (isLlmError(error) && !error.code.startsWith("AMC_")) || error instanceof RequestEncodingError;
}

export class AutoCompactor {
  private turn = 0;
  private count = 0;
  private pending: { readonly eventIds: readonly string[]; readonly promptTokens: number } | null = null;

  constructor(private readonly config: CompactionConfig & { readonly contextWindowTokens: number }, private readonly init: StepRunnerInit) {}

  /** Runs after a completed step's `step/end`, between steps. Returns how many extra summary steps it took. */
  async afterStep(turn: number, step: number, measuredAtEventId: string, usage: TokenUsage | null, signal: AbortSignal): Promise<number> {
    if (turn !== this.turn) { this.turn = turn; this.count = 0; }
    const { session } = this.init, window = this.config.contextWindowTokens;
    const notify: Notify = (message, eventIds = []) => { this.init.notify({ kind: "compaction", turn, step, message, eventIds }); };
    const pressure = measurePromptPressure(usage, window);
    if (this.pending !== null) {
      session.recordProjectedEvidence({ eventType: "audit", payload: "", meta: { auditType: "COMPACTION_EFFECT_OBSERVED", version: 1, turn, step,
        compactionEventIds: [...this.pending.eventIds], promptTokensBefore: this.pending.promptTokens,
        promptTokensAfter: pressure?.promptTokens ?? null, measuredAtEventId, formula: PROMPT_TOKENS_FORMULA,
        note: "provider-reported usage of the next request after compaction; an observation, not a savings claim" } });
      this.pending = null;
    }
    if (pressure === null) {
      notify("the provider reported no usage for this step, so prompt size was not measured and automatic compaction did not run");
      return 0;
    }
    if (pressure.ratio < this.config.threshold) return 0;
    const measured = `prompt measured ${pressure.promptTokens} of ${window} declared tokens`;
    if (this.count >= this.config.maxPerTurn) {
      notify(`${measured}, but this turn already compacted ${this.count} time(s); no further automatic compaction`);
      return 0;
    }
    const trigger: Trigger = { kind: "automatic", promptTokens: pressure.promptTokens, contextWindowTokens: window,
      threshold: this.config.threshold, ratio: pressure.ratio, measuredAtEventId, formula: pressure.formula };
    const pruned = this.prune(trigger);
    // Summarize when pruning found nothing, or when an earlier boundary of this turn already compacted and pressure is still high.
    const summarized = this.config.summarize && (pruned.length === 0 || this.count > 0) ? await this.summarize(turn, trigger, signal, notify) : NOTHING;
    const eventIds = [...pruned, ...summarized.eventIds];
    if (eventIds.length === 0) {
      notify(`${measured}; nothing was eligible for automatic compaction`);
      return summarized.steps;
    }
    this.count += 1;
    this.pending = { eventIds, promptTokens: pressure.promptTokens };
    notify(`${measured}; ${pruned.length} tool output(s) pruned, ${summarized.eventIds.length} summary-step receipt(s)`, eventIds);
    return summarized.steps;
  }

  private prune(trigger: Trigger): readonly string[] {
    const { session } = this.init, events = session.readEvents();
    // Authenticates the whole session and replays earlier compactions before anything is selected.
    const live = describeMeasuredLiveEntries(session.workspace, events);
    const at = positions(events), recent = recentSteps(events, this.config.keepRecentSteps);
    const uses = new Set(live.filter(entry => entry.kind === "tool_use").map(entry => entry.slot));
    const candidates = live.flatMap(entry => {
      const position = at.get(entry.originEventId);
      if (entry.kind !== "tool_result" || entry.sourceEventId !== entry.originEventId || entry.bytes === null
        || entry.bytes < this.config.pruneMinBytes || !uses.has(`tool_use:${entry.slot.slice("tool_result:".length)}`)
        || recent.some(kept => kept.turn === position?.turn && kept.step === position?.step)) return [];
      const replacement = `[amc: tool output removed from context by automatic compaction; ${entry.bytes} bytes; sha256 ${entry.sha256}; source event ${entry.sourceEventId}]`;
      return Buffer.byteLength(replacement, "utf8") < entry.bytes ? [{ entry, bytes: entry.bytes, replacement }] : [];
    }).sort((a, b) => b.bytes - a.bytes); // stable, so equal sizes keep origin order
    return candidates.map(({ entry, replacement }) => session.compactSurfaceEntry({ originEventId: entry.originEventId, replacement,
      reason: "automatic compaction: deterministic tool-output prune; the original result row and any spill object are retained", automatic: { trigger } }).eventId);
  }

  private async summarize(turn: number, trigger: Trigger, signal: AbortSignal, notify: Notify): Promise<Outcome> {
    const { session } = this.init, events = session.readEvents();
    const live = describeMeasuredLiveEntries(session.workspace, events), at = positions(events);
    const cutoff = Math.min(turn, ...recentSteps(events, this.config.keepRecentSteps).map(kept => kept.turn ?? turn));
    const range = oldestCompletedTurns(live, at, cutoff), runs = summarizableRuns(range);
    const ids = (run: readonly LiveSurfaceEntry[]): readonly string[] => run.map(entry => entry.originEventId);
    const skip = (why: string): Outcome => { notify(`no summary: ${why}`); return NOTHING; };
    if (runs.length === 0) return skip("no completed earlier turn outside the kept recent steps holds assistant or tool content");
    if (runs.some(run => run.some(entry => entry.bytes === null))) return skip("part of the oldest range is retention-pruned, so its bytes cannot be measured");
    // The summary takes the place of the LAST run, after every kept user message of the range;
    // earlier runs are dropped, so each request precedes the account of the work done for it.
    const target = runs.at(-1)!, earlier = runs.slice(0, -1);
    try {
      const surface = foldSurfaceEntries(events);
      selectCompactionEntries(surface, ids(target), "summarize");
      for (const run of earlier) selectCompactionEntries(surface, ids(run), "drop");
    } catch (error: unknown) { return skip(error instanceof Error ? error.message : "the oldest range is not compactable"); }
    const targetBytes = target.reduce((sum, entry) => sum + (entry.bytes ?? 0), 0);
    const turns = new Set(range.map(entry => at.get(entry.originEventId)?.turn)).size;

    const opened = session.startStep(COMPACTION_SUMMARY_STEP);
    let settled: SettledStream | null = null, usage: TokenUsage | null = null, stopReason: string | null = null, failure: unknown = null;
    try {
      session.recordUserMessage(summaryPrompt(turns));
      settled = await dispatchStepRequest({ session, llm: this.init.llm, route: this.init.route, systemPromptEventId: this.init.systemPromptEventId,
        tools: null, retry: this.init.retryRuntime, notify: this.init.notify }, turn, opened.step, signal);
      usage = stepUsage(settled.assembly.usage);
      stopReason = settled.assembly.finishReason?.kind ?? "aborted";
    } catch (error: unknown) {
      stopReason = signal.aborted ? "cancelled" : "error";
      failure = error;
    } finally {
      session.endStep({ stopReason, usage });
    }
    // An evidence or contract failure writes nothing more; a refusal or a cancel still clears the summary prompt.
    if (failure !== null && !signal.aborted && !isRefusal(failure)) throw failure;
    const after = session.readEvents(), afterAt = positions(after);
    const inStep = (id: string): boolean => afterAt.get(id)?.turn === opened.turn && afterAt.get(id)?.step === opened.step;
    const own = describeLiveEntries(after).filter(entry => inStep(entry.originEventId));
    const header = after.filter(row => row.event_type === "request/header" && inStep(row.id)).at(-1);
    const text = summaryText(settled);
    const eventIds: string[] = [];
    if (failure !== null) notify(`summary step did not complete (${failure instanceof Error ? failure.message : "refused"}); the turn continues uncompacted`);
    else if (header === undefined || text === null) notify("summary step returned no complete text-only answer; the turn continues uncompacted");
    // Sized with a same-length placeholder fence: the session layer adds the real random fence.
    else if (Buffer.byteLength(fenceModelSummary(text, "0".repeat(12)), "utf8") >= targetBytes) {
      notify(`fenced summary is not smaller than the ${targetBytes} payload bytes of the latest agent run it would replace; not applied`);
    } else {
      const model = (JSON.parse(header.meta_json) as { model?: unknown }).model;
      const summaryId = session.compactSurfaceRange({ originEventIds: ids(target), replacement: text, summaryRole: MODEL_SUMMARY_ROLE,
        reason: `automatic compaction: fenced model-written summary (${SUMMARY_CLAIM_KIND}, not instructions, not evidence) of the agent's work in `
          + `${turns} completed turn(s); user messages stay verbatim; originals stay in the ledger`,
        automatic: { trigger, summarizer: { requestHeaderEventId: header.id, promptVersion: SUMMARY_PROMPT_VERSION,
          model: typeof model === "string" ? model : "", claimKind: SUMMARY_CLAIM_KIND } } }).eventId;
      eventIds.push(summaryId);
      for (const run of earlier) eventIds.push(session.dropSurfaceRange({ originEventIds: ids(run), automatic: { trigger },
        reason: `automatic compaction: agent and tool content covered by summary ${summaryId}; user messages stay verbatim; rows retained` }).eventId);
    }
    // The summary request and its answer leave the context as well; their signed rows stay.
    if (own.length > 0) eventIds.push(session.dropSurfaceRange({ originEventIds: own.map(entry => entry.originEventId),
      reason: "automatic compaction: remove the summary request and its answer from context; their signed rows remain", automatic: { trigger } }).eventId);
    if (signal.aborted) throw failure ?? signal.reason;
    return { eventIds, steps: 1 };
  }
}
