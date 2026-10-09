/** P2-28: compare scoped station rules after applicability; retain independent bindings and evidence duties. */
import { canonicalize } from "../../utils/json.js";
import { validateStationScope, type StationScope } from "../../domains/stations.js";
import type { ClockDuration } from "../../incidents/regulatoryClocksTable.js";
import type { TrustContext } from "../../trust/trustContext.js";
import type { ControlRecord, MergeComparator, MergeValue } from "../types.js";
import { CompileError, type Conflict, type DeploymentProfile } from "./types.js";
import { stationExceptionRejection, type ExceptionRejection, type StationMergeException } from "./stationException.js";

export interface EffectiveMergeRule {
  mergeKey: string; comparator: MergeComparator; value: MergeValue;
  chosenControlId: string; controlIds: string[]; exceptionId: string | null;
}
export interface StationMergeResult {
  controls: ControlRecord[]; rules: EffectiveMergeRule[]; conflicts: Conflict[];
  exceptionRejected: ExceptionRejection[];
}
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** Calendar days use elapsed UTC days, like the existing clock engine; months/workDays stay distinct. */
function duration(value: MergeValue): { family: string; amount: number } | null {
  if (typeof value !== "object" || value === null) return null;
  const d: ClockDuration = value;
  if (!Number.isSafeInteger(d.amount) || d.amount < 1) return null;
  switch (d.unit) {
    case "hours": return { family: "elapsed", amount: d.amount };
    case "calendarDays": return { family: "elapsed", amount: d.amount * 24 };
    case "months": case "workDays": return { family: d.unit, amount: d.amount };
    default: return null;
  }
}

function chooseStrictest(controls: ControlRecord[]): ControlRecord | null {
  const first = controls[0]!.merge!;
  if (controls.some((c) => c.merge!.comparator !== first.comparator)) return null;
  let ranks: number[];
  switch (first.comparator) {
    case "duration-max": case "duration-min": {
      const durations = controls.map((c) => duration(c.merge!.value));
      if (durations.some((d) => !d || !Number.isSafeInteger(d.amount) || d.family !== durations[0]?.family)) return null;
      ranks = durations.map((d) => d!.amount * (first.comparator === "duration-max" ? -1 : 1));
      break;
    }
    case "count-min":
      if (controls.some((c) => typeof c.merge!.value !== "number" || !Number.isSafeInteger(c.merge!.value) || (c.merge!.value as number) < 0)) return null;
      ranks = controls.map((c) => c.merge!.value as number);
      break;
    case "boolean-required":
      if (controls.some((c) => typeof c.merge!.value !== "boolean")) return null;
      ranks = controls.map((c) => Number(c.merge!.value));
      break;
    case "enum-order": {
      const order = first.order;
      if (!order?.length || new Set(order).size !== order.length || controls.some((c) => canonicalize(c.merge!.order) !== canonicalize(order)
        || typeof c.merge!.value !== "string" || !order.includes(c.merge!.value as string))) return null;
      ranks = controls.map((c) => order.indexOf(c.merge!.value as string));
      break;
    }
    default: return null;
  }
  const best = ranks.reduce((highest, rank) => Math.max(highest, rank), -Infinity);
  return controls[ranks.indexOf(best)] ?? null;
}

/** Null scope preserves the compiler's existing unknown-fact behavior; known scopes must validate. */
export function mergeStations(scope: StationScope | null, layer0: readonly ControlRecord[], overlays: readonly ControlRecord[],
  options: { profile: DeploymentProfile; asOfMs: number; exceptions?: readonly StationMergeException[]; trust?: TrustContext }): StationMergeResult {
  if (scope) {
    const errors = validateStationScope(scope, { minStations: 1 });
    if (errors.length) throw new CompileError("PROFILE_INVALID", errors.join("; "));
  }
  const byId = new Map<string, ControlRecord>();
  for (const control of [...layer0, ...overlays]) {
    const existing = byId.get(control.id);
    if (existing && canonicalize(existing) !== canonicalize(control)) throw new CompileError("CATALOG_INVALID", `conflicting bytes for ${control.id}`);
    byId.set(control.id, control);
  }
  const controls = [...byId.values()].sort((a, b) => compare(a.id, b.id));
  const groups = new Map<string, ControlRecord[]>();
  for (const control of controls) if (control.merge) groups.set(control.merge.key, [...(groups.get(control.merge.key) ?? []), control]);
  const rules: EffectiveMergeRule[] = [];
  const conflicts: Conflict[] = [];
  const exceptionRejected: ExceptionRejection[] = [];
  const exceptions = [...(options.exceptions ?? [])].sort((a, b) => compare(a.id, b.id));
  for (const exception of exceptions) if (!groups.has(exception.mergeKey)) exceptionRejected.push({
    id: exception.id, mergeKey: exception.mergeKey, reason: "UNKNOWN_MERGE_KEY"
  });
  for (const [mergeKey, candidates] of [...groups.entries()].sort(([a], [b]) => compare(a, b))) {
    let chosen = chooseStrictest(candidates);
    let resolution: Conflict["resolution"] = chosen ? "stricter_applied" : "unresolved";
    let exceptionId: string | null = null;
    const valid: StationMergeException[] = [];
    for (const exception of exceptions.filter((e) => e.mergeKey === mergeKey)) {
      const reason = stationExceptionRejection(exception, options.profile, candidates, options.asOfMs, options.trust);
      if (reason) exceptionRejected.push({ id: exception.id, mergeKey, reason });
      else valid.push(exception);
    }
    if (new Set(valid.map((e) => e.chosenControlId)).size > 1) {
      chosen = null; resolution = "unresolved";
      for (const exception of valid) exceptionRejected.push({ id: exception.id, mergeKey, reason: "CONTRADICTORY_EXCEPTIONS" });
    } else if (valid[0]) {
      chosen = candidates.find((c) => c.id === valid[0]!.chosenControlId)!;
      exceptionId = valid[0].id; resolution = "reviewer_exception";
    }
    if (chosen) rules.push({ mergeKey, comparator: chosen.merge!.comparator, value: chosen.merge!.value,
      chosenControlId: chosen.id, controlIds: candidates.map((c) => c.id), exceptionId });
    const differing = new Set(candidates.map((c) => canonicalize(c.merge))).size > 1;
    if (candidates.length > 1 || exceptionId || !chosen) conflicts.push({
      parameter: `station:${mergeKey}`, mergeKey, controlIds: candidates.map((c) => c.id),
      values: candidates.map((c) => c.merge!.value), strictness: candidates[0]!.merge!.comparator,
      resolution, appliedValue: chosen?.merge?.value ?? null, exceptionId,
      candidates: candidates.map((c) => ({ controlId: c.id, stations: [...c.stations].sort(), value: c.merge!.value })),
      chosenControlId: chosen?.id ?? null,
      exceptionRejected: exceptionRejected.filter((e) => e.mergeKey === mergeKey),
      reason: chosen ? differing ? "Comparison selected an effective rule; independent duties remain." : "Equivalent rules; control id breaks the tie."
        : "No comparable rule or conflicting authorized exceptions; affected requirements are not evaluated."
    });
  }
  return { controls, rules, conflicts, exceptionRejected: exceptionRejected.sort((a, b) => compare(a.mergeKey, b.mergeKey) || compare(a.id, b.id)) };
}
