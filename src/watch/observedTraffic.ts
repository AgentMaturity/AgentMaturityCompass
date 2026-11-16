/**
 * Numbers from the rows AMC already records about an agent's traffic, and "observed change" notes about them.
 *
 * Rows read (each counted as recorded; this module does not re-check each row's signature):
 * - gateway `llm_response` rows (2xx): response model, tokens, and whether the reply was a refusal (only where the
 *   gateway recorded a stop reason; the Anthropic stop reason "refusal" counts, anything unrecorded stays unknown);
 * - hook control decisions (`audit` rows with a control schema): allowed, asked or denied tool calls;
 * - hook post-execution reports (`tool_result` rows): whether the tool call failed, as the provider reported it.
 * A task is one run id, or one recorded session when no run id is set. A note says what changed in the numbers and
 * from which rows; it never names a cause and never says an agent is safe, unsafe, degraded or broken.
 */
import { openLedger } from "../ledger/ledger.js";
import { plainName } from "../importers/sessionImportCommon.js";

export const OBSERVED_ROW_LIMIT = 200_000;

export interface ObservedRow {
  id: string;
  ts: number;
  kind: "model-reply" | "tool-decision" | "tool-outcome";
  task: string;
  model: string | null;
  tokens: number | null;
  refusal: boolean | null;
  denied: boolean;
  asked: boolean;
  failed: boolean | null;
}

export interface ObservedRates {
  toolDecisions: { total: number; denied: number; asked: number; denialRate: number | null };
  toolOutcomes: { total: number; failed: number; outcomeUnknown: number; errorRate: number | null };
  modelReplies: { total: number; refusals: number; refusalUnknown: number; refusalRate: number | null; tasks: number; tokensPerTask: number | null };
}

export interface ObservedChangeNote {
  metric: "tool-error rate" | "tool-denial rate" | "refusal rate" | "tokens per task" | "response model";
  from: string;
  before: string;
  after: string;
  rows: { count: number; firstId: string; lastId: string };
  text: string;
}

function meta(json: string): Record<string, unknown> {
  try {
    const value = JSON.parse(json) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function tokensOf(usage: unknown): number | null {
  if (!usage || typeof usage !== "object") return null;
  const u = usage as Record<string, unknown>;
  const total = count(u.total_tokens) ?? count(u.totalTokens);
  if (total !== null) return total;
  const input = count(u.input_tokens) ?? count(u.prompt_tokens) ?? count(u.inputTokens);
  const output = count(u.output_tokens) ?? count(u.completion_tokens) ?? count(u.outputTokens);
  return input === null && output === null ? null : (input ?? 0) + (output ?? 0);
}

function rowOf(event: { id: string; ts: number; session_id: string; event_type: string; meta_json: string }, agentId: string): ObservedRow | null {
  const m = meta(event.meta_json);
  if (m.agentId !== agentId) return null;
  const task = typeof m.run_id === "string" && m.run_id ? `run:${m.run_id}` : `session:${event.session_id}`;
  const base = { id: event.id, ts: event.ts, task, model: null, tokens: null, refusal: null, denied: false, asked: false, failed: null };
  if (event.event_type === "llm_response") {
    const status = count(m.statusCode);
    if (status === null || status < 200 || status > 299) return null;
    return { ...base, kind: "model-reply", model: plainName(m.model), tokens: tokensOf(m.usage),
      refusal: typeof m.stopReason === "string" ? m.stopReason === "refusal" : null };
  }
  if (event.event_type === "audit" && (m.controlSchemaVersion !== undefined || m.approvalControlSchemaVersion !== undefined)
    && (m.decision === "allow" || m.decision === "deny" || m.decision === "ask")) {
    return { ...base, kind: "tool-decision", denied: m.decision === "deny", asked: m.decision === "ask" };
  }
  if (event.event_type === "tool_result" && (m.postExecutionSchemaVersion !== undefined || m.codexObservationSchemaVersion !== undefined)) {
    const reported = m.reported && typeof m.reported === "object" ? (m.reported as Record<string, unknown>).outcome : undefined;
    return { ...base, kind: "tool-outcome", failed: reported === "failed" ? true : reported === "completed" ? false : null };
  }
  return null;
}

/** Rows of one agent between two times, oldest first; `truncated` when more than the limit were recorded. */
export function readObservedRows(workspace: string, input: { agentId: string; sinceTs: number; untilTs: number }): { rows: ObservedRow[]; truncated: boolean } {
  let ledger: ReturnType<typeof openLedger>;
  try { ledger = openLedger(workspace, { readonly: true }); } catch { return { rows: [], truncated: false }; }
  try {
    const events = ledger.db.prepare(`SELECT id, ts, session_id, event_type, meta_json FROM evidence_events
      WHERE ts >= ? AND ts <= ? AND event_type IN ('llm_response', 'audit', 'tool_result') ORDER BY ts ASC, rowid ASC LIMIT ?`)
      .all(input.sinceTs, input.untilTs, OBSERVED_ROW_LIMIT + 1) as Array<{ id: string; ts: number; session_id: string; event_type: string; meta_json: string }>;
    const rows = events.slice(0, OBSERVED_ROW_LIMIT).map((event) => rowOf(event, input.agentId)).filter((row): row is ObservedRow => row !== null);
    return { rows, truncated: events.length > OBSERVED_ROW_LIMIT };
  } catch {
    return { rows: [], truncated: false };
  } finally {
    ledger.close();
  }
}

const rate = (part: number, whole: number) => whole > 0 ? Number((part / whole).toFixed(4)) : null;

export function observedRates(rows: ObservedRow[]): ObservedRates {
  const decisions = rows.filter((row) => row.kind === "tool-decision");
  const outcomes = rows.filter((row) => row.kind === "tool-outcome");
  const replies = rows.filter((row) => row.kind === "model-reply");
  const knownOutcomes = outcomes.filter((row) => row.failed !== null);
  const knownReplies = replies.filter((row) => row.refusal !== null);
  const taskTokens = new Map<string, number>();
  for (const row of replies) if (row.tokens !== null) taskTokens.set(row.task, (taskTokens.get(row.task) ?? 0) + row.tokens);
  const tokenSum = [...taskTokens.values()].reduce((sum, value) => sum + value, 0);
  return {
    toolDecisions: { total: decisions.length, denied: decisions.filter((row) => row.denied).length,
      asked: decisions.filter((row) => row.asked).length, denialRate: rate(decisions.filter((row) => row.denied).length, decisions.length) },
    toolOutcomes: { total: outcomes.length, failed: knownOutcomes.filter((row) => row.failed).length, outcomeUnknown: outcomes.length - knownOutcomes.length,
      errorRate: rate(knownOutcomes.filter((row) => row.failed).length, knownOutcomes.length) },
    modelReplies: { total: replies.length, refusals: knownReplies.filter((row) => row.refusal).length, refusalUnknown: replies.length - knownReplies.length,
      refusalRate: rate(knownReplies.filter((row) => row.refusal).length, knownReplies.length), tasks: taskTokens.size,
      tokensPerTask: taskTokens.size > 0 ? Math.round(tokenSum / taskTokens.size) : null }
  };
}
