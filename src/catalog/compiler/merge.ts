/**
 * Layer and station merge (P1-10): binding parameters of every applicable or unresolved control, grouped by name.
 * Controls sharing a name must declare one strictness (STRICTNESS_MISMATCH). `max`, `min`, `true_wins`, `union` and
 * a non-empty `intersection` apply the stricter value; an empty intersection and any difference in a `none` parameter
 * stay unresolved (the plan is blocked) unless an unexpired reviewer exception names one of the differing values.
 * Every difference is listed in the conflicts.
 */
import { canonicalize } from "../../utils/json.js";
import type { ControlRecord, Strictness } from "../types.js";
import { CompileError, type Conflict, type ParamValue, type ReviewerException } from "./types.js";

export interface MergedParameter { name: string; strictness: Strictness; value: ParamValue | null; controlIds: string[] }

const key = (value: ParamValue): string => canonicalize(value);
const norm = (value: ParamValue): ParamValue => (Array.isArray(value) ? [...new Set(value)].sort() : value);

function numbers(name: string, values: ParamValue[]): number[] {
  if (!values.every((v) => typeof v === "number")) throw new CompileError("PARAMETER_TYPE", `${name}: ${canonicalize(values)} are not all numbers`);
  return values as number[];
}
function lists(name: string, values: ParamValue[]): string[][] {
  if (!values.every(Array.isArray)) throw new CompileError("PARAMETER_TYPE", `${name}: ${canonicalize(values)} are not all lists`);
  return values as string[][];
}

/** The stricter of differing values, or null when the strictness cannot pick one. */
function stricter(name: string, strictness: Strictness, values: ParamValue[]): ParamValue | null {
  switch (strictness) {
    case "max": return Math.max(...numbers(name, values));
    case "min": return Math.min(...numbers(name, values));
    case "true_wins": return values.includes(true);
    case "union": return [...new Set(lists(name, values).flat())].sort();
    case "intersection": {
      const [first = [], ...rest] = lists(name, values);
      const common = first.filter((v) => rest.every((list) => list.includes(v)));
      return common.length > 0 ? common : null;
    }
    case "none": return null;
  }
}

export function mergeParameters(controls: ControlRecord[], liveExceptions: ReviewerException[]): {
  parameters: Map<string, MergedParameter>;
  conflicts: Conflict[];
} {
  const groups = new Map<string, Array<{ controlId: string; value: ParamValue; strictness: Strictness }>>();
  for (const control of controls) {
    for (const p of control.binding.parameters) groups.set(p.name, [...(groups.get(p.name) ?? []), { controlId: control.id, value: norm(p.value), strictness: p.strictness }]);
  }
  const parameters = new Map<string, MergedParameter>();
  const conflicts: Conflict[] = [];
  for (const [name, rows] of [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const strictness = rows[0]!.strictness;
    if (rows.some((r) => r.strictness !== strictness)) {
      throw new CompileError("STRICTNESS_MISMATCH", `${name} is declared ${[...new Set(rows.map((r) => `${r.strictness} by ${r.controlId}`))].join(", ")}`);
    }
    const controlIds = [...new Set(rows.map((r) => r.controlId))].sort();
    const values = [...new Map(rows.map((r) => [key(r.value), r.value])).entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, v]) => v);
    if (values.length === 1) {
      parameters.set(name, { name, strictness, value: values[0]!, controlIds });
      continue;
    }
    let value = stricter(name, strictness, values);
    let resolution: Conflict["resolution"] = value === null ? "unresolved" : "stricter_applied";
    let exceptionId: string | null = null;
    if (value === null) {
      const named = liveExceptions
        .filter((e) => e.parameter === name && controlIds.includes(e.controlId) && e.value !== null && values.some((v) => key(v) === key(norm(e.value!))))
        .sort((a, b) => (a.id < b.id ? -1 : 1))[0];
      if (named?.value != null) {
        value = norm(named.value);
        resolution = "reviewer_exception";
        exceptionId = named.id;
      }
    }
    parameters.set(name, { name, strictness, value, controlIds });
    conflicts.push({ parameter: name, controlIds, values, strictness, resolution, appliedValue: value, exceptionId });
  }
  return { parameters, conflicts };
}
