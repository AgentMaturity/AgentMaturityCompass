/**
 * Readable plan diff (P1-10): requirements added, removed or changed with reasons, and leaf-level runtime-policy and
 * evidence-plan changes. Rows of object lists are matched by their id field, not by position. An absent value shows as
 * null. Whether a change weakens the plan is sign.ts's question, not this file's.
 */
import { canonicalize } from "../../utils/json.js";
import type { CompiledPlan, PlanDiff, RequirementDecision } from "./types.js";

const ROW_KEYS = ["testId", "contractId", "id", "name", "actionClass", "controlId", "mergeKey", "parameter"];

function rowKey(row: unknown): string {
  if (row && typeof row === "object") {
    for (const k of ROW_KEYS) {
      const v = (row as Record<string, unknown>)[k];
      if (typeof v === "string") return v;
    }
  }
  return canonicalize(row);
}

/** Leaf values by path; rows of object lists are keyed `[key]`, lists of plain values are one leaf. */
function leaves(value: unknown, path: string, out = new Map<string, unknown>()): Map<string, unknown> {
  if (Array.isArray(value) && value.some((v) => v !== null && typeof v === "object")) {
    for (const row of value) leaves(row, `${path}[${rowKey(row)}]`, out);
  } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) leaves(v, path ? `${path}.${k}` : k, out);
  } else {
    out.set(path, value);
  }
  return out;
}

function leafDiff(before: unknown, after: unknown): Array<{ path: string; before: unknown; after: unknown }> {
  const [a, b] = [leaves(before, ""), leaves(after, "")];
  return [...new Set([...a.keys(), ...b.keys()])].sort()
    .filter((path) => canonicalize(a.get(path)) !== canonicalize(b.get(path)))
    .map((path) => ({ path, before: a.get(path) ?? null, after: b.get(path) ?? null }));
}

const why = (r: RequirementDecision): string =>
  r.exclusion?.reason ?? (r.missingFacts.length > 0 ? `missing facts: ${r.missingFacts.join(", ")}` : `pulled in by ${r.pulledInBy.join(", ")}`);

export function diffPlans(prev: CompiledPlan, next: CompiledPlan): PlanDiff {
  const before = new Map(prev.requirements.map((r) => [r.controlId, r]));
  const after = new Map(next.requirements.map((r) => [r.controlId, r]));
  const requirements: PlanDiff["requirements"] = [];
  for (const id of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const [b, a] = [before.get(id), after.get(id)];
    if (!b && a) requirements.push({ controlId: id, change: "added", before: null, after: a.applicability, reason: why(a) });
    else if (b && !a) requirements.push({ controlId: id, change: "removed", before: b.applicability, after: null, reason: "no longer pulled in by the profile" });
    else if (b && a && b.applicability !== a.applicability) requirements.push({ controlId: id, change: "applicability", before: b.applicability, after: a.applicability, reason: why(a) });
    else if (b && a && b.controlVersion !== a.controlVersion) requirements.push({ controlId: id, change: "version", before: b.controlVersion, after: a.controlVersion, reason: "catalog control version changed" });
  }
  const policy = (p: CompiledPlan) => ({ ...p.runtimePolicy, policyDigest: undefined });
  return {
    previousDigest: prev.digest,
    requirements,
    runtimePolicy: leafDiff(policy(prev), policy(next)),
    evidencePlan: leafDiff(prev.evidencePlan, next.evidencePlan),
    conflicts: leafDiff(prev.conflicts, next.conflicts),
    mergeRules: leafDiff(prev.effectiveMergeRules ?? [], next.effectiveMergeRules ?? []),
    mergeExceptionRejected: leafDiff(prev.mergeExceptionRejected ?? [], next.mergeExceptionRejected ?? [])
  };
}

const show = (value: unknown): string => `\`${value === null ? "absent" : JSON.stringify(value)}\``;

export function renderPlanDiffMarkdown(diff: PlanDiff | null): string {
  if (!diff) return "# Control plan diff\n\nNo previous plan was given, so there is nothing to compare.\n";
  const section = (title: string, lines: string[]) => [`## ${title}`, "", ...(lines.length > 0 ? lines : ["None."]), ""];
  return [
    "# Control plan diff", "", `Previous plan: \`${diff.previousDigest}\``, "",
    ...section("Requirements added, removed or changed", diff.requirements.map((r) =>
      `- \`${r.controlId}\` ${r.change}: ${r.before ?? "absent"} -> ${r.after ?? "absent"} (${r.reason})`)),
    ...section("Runtime policy changes", diff.runtimePolicy.map((c) => `- \`${c.path}\`: ${show(c.before)} -> ${show(c.after)}`)),
    ...section("Evidence plan changes", diff.evidencePlan.map((c) => `- \`${c.path}\`: ${show(c.before)} -> ${show(c.after)}`)),
    ...section("Conflict resolution changes", (diff.conflicts ?? []).map((c) => `- \`${c.path}\`: ${show(c.before)} -> ${show(c.after)}`)),
    ...section("Effective station rules", (diff.mergeRules ?? []).map((c) => `- \`${c.path}\`: ${show(c.before)} -> ${show(c.after)}`)),
    ...section("Rejected station exceptions", (diff.mergeExceptionRejected ?? []).map((c) => `- \`${c.path}\`: ${show(c.before)} -> ${show(c.after)}`))
  ].join("\n");
}
