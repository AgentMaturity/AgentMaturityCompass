/**
 * "Observed change" notes over the rows observedTraffic.ts reads, through the existing change-point code
 * (detectCusumChangePoints). A note states what changed in the numbers and which rows it rests on; it is not a
 * diagnosis and never names a cause.
 */
import { detectCusumChangePoints } from "../forecast/changePoint.js";
import { median } from "../experiments/stats.js";
import { observedRates, type ObservedChangeNote, type ObservedRow } from "./observedTraffic.js";

const OBSERVED_BUCKETS = 24;
/** A bucket gives a value for a metric only with at least this many rows behind it. */
const MIN_ROWS_PER_BUCKET = 3;

type Metric = Exclude<ObservedChangeNote["metric"], "response model">;

const METRICS: Array<{ metric: Metric; kind: ObservedRow["kind"]; value: (rows: ObservedRow[]) => number | null; percent: boolean }> = [
  { metric: "tool-error rate", kind: "tool-outcome", value: (rows) => observedRates(rows).toolOutcomes.errorRate, percent: true },
  { metric: "tool-denial rate", kind: "tool-decision", value: (rows) => observedRates(rows).toolDecisions.denialRate, percent: true },
  { metric: "refusal rate", kind: "model-reply", value: (rows) => observedRates(rows).modelReplies.refusalRate, percent: true },
  { metric: "tokens per task", kind: "model-reply", value: (rows) => observedRates(rows).modelReplies.tokensPerTask, percent: false }
];

const shown = (value: number, percent: boolean) => percent ? `${(value * 100).toFixed(1)}%` : String(Math.round(value));
const iso = (ts: number) => new Date(ts).toISOString();
const rowRef = (rows: ObservedRow[]) => ({ count: rows.length, firstId: rows[0]?.id ?? "", lastId: rows.at(-1)?.id ?? "" });

function noteText(metric: string, before: string, after: string, from: string, rows: ObservedChangeNote["rows"]): string {
  return `Observed change: ${metric} went from ${before} to ${after} from ${from} on, in ${rows.count} recorded row(s) `
    + `(${rows.firstId} to ${rows.lastId}). This says what changed in the numbers, not why.`;
}

function buckets(rows: ObservedRow[], sinceTs: number, untilTs: number): Array<{ start: number; rows: ObservedRow[] }> {
  const width = Math.max(1, Math.ceil((untilTs - sinceTs) / OBSERVED_BUCKETS));
  const out = Array.from({ length: OBSERVED_BUCKETS }, (_, index) => ({ start: sinceTs + index * width, rows: [] as ObservedRow[] }));
  // A task stays in the bucket where it started, so tokens per task never counts a task split across two buckets.
  const taskStart = new Map<string, number>();
  for (const row of rows) if (row.kind === "model-reply") taskStart.set(row.task, Math.min(taskStart.get(row.task) ?? row.ts, row.ts));
  for (const row of rows) {
    const ts = row.kind === "model-reply" ? taskStart.get(row.task) ?? row.ts : row.ts;
    out[Math.min(OBSERVED_BUCKETS - 1, Math.max(0, Math.floor((ts - sinceTs) / width)))]!.rows.push(row);
  }
  return out;
}

function metricNotes(slots: Array<{ start: number; rows: ObservedRow[] }>): ObservedChangeNote[] {
  const notes: ObservedChangeNote[] = [];
  for (const { metric, kind, value, percent } of METRICS) {
    const points = slots.flatMap((slot) => {
      const rows = slot.rows.filter((row) => row.kind === kind);
      const v = rows.length >= MIN_ROWS_PER_BUCKET ? value(rows) : null;
      return v === null ? [] : [{ ts: slot.start, value: v, rows }];
    });
    // CUSUM restarts after each alarm, so a lasting shift alarms again and again: one note per change of direction.
    const changes = detectCusumChangePoints({ points }).filter((change, index, all) => index === 0 || all[index - 1]!.direction !== change.direction);
    for (const [index, change] of changes.entries()) {
      const next = changes[index + 1]?.ts ?? Number.POSITIVE_INFINITY;
      const before = points.filter((point) => point.ts < change.ts && point.ts >= (changes[index - 1]?.ts ?? Number.NEGATIVE_INFINITY)).map((point) => point.value);
      const afterPoints = points.filter((point) => point.ts >= change.ts && point.ts < next);
      if (before.length === 0 || afterPoints.length === 0) continue;
      const rows = rowRef(afterPoints.flatMap((point) => point.rows));
      const b = shown(median(before), percent), a = shown(median(afterPoints.map((point) => point.value)), percent);
      if (a === b) continue;
      notes.push({ metric, from: iso(change.ts), before: b, after: a, rows, text: noteText(metric, b, a, iso(change.ts), rows) });
    }
  }
  return notes;
}

function modelNotes(slots: Array<{ start: number; rows: ObservedRow[] }>): ObservedChangeNote[] {
  const notes: ObservedChangeNote[] = [];
  let previous: string | null = null;
  for (const slot of slots) {
    const counts = new Map<string, number>();
    for (const row of slot.rows) if (row.kind === "model-reply" && row.model) counts.set(row.model, (counts.get(row.model) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
    if (top === null) continue;
    if (previous !== null && top !== previous) {
      const rows = rowRef(slot.rows.filter((row) => row.kind === "model-reply" && row.model === top));
      notes.push({ metric: "response model", from: iso(slot.start), before: previous, after: top, rows,
        text: noteText("the model named in most replies", previous, top, iso(slot.start), rows) });
    }
    previous = top;
  }
  return notes;
}

export function observedChangeNotes(rows: ObservedRow[], window: { sinceTs: number; untilTs: number }): ObservedChangeNote[] {
  const slots = buckets(rows, window.sinceTs, window.untilTs);
  return [...modelNotes(slots), ...metricNotes(slots)].sort((a, b) => a.from.localeCompare(b.from));
}
