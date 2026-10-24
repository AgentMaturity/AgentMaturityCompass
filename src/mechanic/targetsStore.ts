import { join } from "node:path";
import YAML from "yaml";
import { questionBank } from "../diagnostic/questionBank.js";
import { loadRunReport } from "../diagnostic/runner.js";
import { latestRunId } from "../diagnostic/runReportResolution.js";
import { resolveAgentId } from "../fleet/paths.js";
import { captureOrgPairs, orgPairBytes, publishOrgPairs, prepareOrgPairsAsync, type OrgPairsSnapshot, type OrgPairsOptions } from "../org/preparedOrgPairs.js";
import { canonicalize } from "../utils/json.js";
import { captureMechanicPair, requireMechanicPair, verifyMechanicPair } from "./mechanicPairs.js";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { mechanicTargetsSchema, type MechanicScope, type MechanicTargets } from "./targetSchema.js";

export function mechanicRoot(workspace: string): string {
  return join(workspace, ".amc", "mechanic");
}

export function mechanicTargetsPath(workspace: string): string {
  return join(mechanicRoot(workspace), "targets.yaml");
}

export function mechanicTargetsSigPath(workspace: string): string {
  return `${mechanicTargetsPath(workspace)}.sig`;
}

function questionIds(): string[] {
  return [...questionBank].map((q) => q.id).sort((a, b) => a.localeCompare(b));
}

function measuredTargetMapping(workspace: string, scope: MechanicScope): Record<string, number> | null {
  const agentId = scope.type === "AGENT" ? resolveAgentId(workspace, scope.id) : "default";
  const runId = latestRunId(workspace, agentId);
  if (!runId) {
    return null;
  }
  try {
    const report = loadRunReport(workspace, runId, agentId);
    const mapped: Record<string, number> = {};
    for (const qid of questionIds()) {
      mapped[qid] = Math.max(0, Math.min(5, Math.round(report.questionScores.find((row) => row.questionId === qid)?.finalLevel ?? 3)));
    }
    return mapped;
  } catch {
    return null;
  }
}

function defaultTargets(scope: MechanicScope, mode: "DESIRED" | "EXCELLENCE", measured: Record<string, number> | null): MechanicTargets {
  const ids = questionIds();
  const now = Date.now();
  const targets: Record<string, number> = {};
  for (const id of ids) {
    if (mode === "EXCELLENCE") {
      targets[id] = 5;
      continue;
    }
    targets[id] = Math.max(0, Math.min(5, Math.round(measured?.[id] ?? 3)));
  }
  return mechanicTargetsSchema.parse({
    mechanicTargets: {
      version: 1,
      scope,
      mode,
      targets,
      dimensionMinimums: {},
      locking: {
        preventLoweringBelowMeasured: true,
        maxStepChangePerApply: 2,
        requireReasonForChange: true
      },
      createdTs: now,
      updatedTs: now
    }
  });
}

export function loadMechanicTargets(workspace: string): MechanicTargets {
  const path = mechanicTargetsPath(workspace);
  if (!pathExists(path)) {
    const created = initMechanicTargets({
      workspace,
      scope: { type: "WORKSPACE", id: "workspace" },
      mode: "DESIRED"
    });
    return created.targets;
  }
  return mechanicTargetsSchema.parse(YAML.parse(readUtf8(path)) as unknown);
}

function planMechanicTargets(params: {
  workspace: string;
  targets: MechanicTargets;
  reason?: string;
  measured?: Record<string, number> | null;
}, previous?: OrgPairsSnapshot) {
  const path = mechanicTargetsPath(params.workspace);
  const parsed = mechanicTargetsSchema.parse(params.targets);
  const before = previous ?? captureOrgPairs([path]), currentBytes = orgPairBytes(before, path);
  const current = currentBytes === null ? null : mechanicTargetsSchema.parse(YAML.parse(currentBytes.toString("utf8")) as unknown);
  const explicit = params.measured === undefined || params.measured === null ? null : structuredClone(params.measured);
  const measured = explicit ?? measuredTargetMapping(params.workspace, parsed.mechanicTargets.scope), measuredProjection = canonicalize(measured);

  if (parsed.mechanicTargets.locking.requireReasonForChange) {
    const changed = current
      ? Object.keys(parsed.mechanicTargets.targets).some((key) => (current.mechanicTargets.targets[key] ?? 0) !== parsed.mechanicTargets.targets[key])
      : true;
    if (changed && (!params.reason || params.reason.trim().length === 0)) {
      throw new Error("target change reason required by locking policy");
    }
  }

  if (current) {
    const maxStep = parsed.mechanicTargets.locking.maxStepChangePerApply;
    for (const key of questionIds()) {
      const previous = current.mechanicTargets.targets[key] ?? 0;
      const next = parsed.mechanicTargets.targets[key] ?? 0;
      if (Math.abs(next - previous) > maxStep) {
        throw new Error(`target ${key} changed by more than maxStepChangePerApply (${maxStep})`);
      }
    }
  }

  if (parsed.mechanicTargets.locking.preventLoweringBelowMeasured && measured) {
    for (const key of questionIds()) {
      const next = parsed.mechanicTargets.targets[key] ?? 0;
      const observed = measured[key] ?? 0;
      if (next < observed) {
        throw new Error(`target ${key} cannot be lowered below measured level (${observed})`);
      }
    }
  }

  const normalized: MechanicTargets = {
    mechanicTargets: {
      ...parsed.mechanicTargets,
      updatedTs: Date.now()
    }
  };
  if (!current) {
    normalized.mechanicTargets.createdTs = normalized.mechanicTargets.updatedTs;
  }

  const bytes = Buffer.from(YAML.stringify(normalized));
  return { before, path, bytes, assertInputsCurrent() {
    if (parsed.mechanicTargets.locking.preventLoweringBelowMeasured && explicit === null && canonicalize(measuredTargetMapping(params.workspace, parsed.mechanicTargets.scope)) !== measuredProjection)
      throw new Error("selected mechanic measured target floor changed while signing");
  } };
}

export function saveMechanicTargets(params: {
  workspace: string;
  targets: MechanicTargets;
  reason?: string;
  measured?: Record<string, number> | null;
}): { path: string; sigPath: string } {
  const plan = planMechanicTargets(params);
  return publishOrgPairs(params.workspace, [{ path: plan.path, bytes: plan.bytes }], { assertInputsCurrent: plan.assertInputsCurrent }, plan.before)[0]!;
}
/** Internal checked preparation; callers retain the real gate across later independent log waits. */
export async function prepareMechanicTargets(params: Parameters<typeof saveMechanicTargets>[0], options: OrgPairsOptions = {}, previous?: OrgPairsSnapshot) {
  const plan = planMechanicTargets({ ...params, targets: mechanicTargetsSchema.parse(params.targets) }, previous);
  if (orgPairBytes(plan.before, plan.path) !== null) requireMechanicPair(captureMechanicPair(params.workspace, plan.path, "mechanic targets missing", plan.before));
  const prepared = await prepareOrgPairsAsync(params.workspace, [{ path: plan.path, bytes: plan.bytes }], {
    beforePublish: options.beforePublish, assertInputsCurrent() { plan.assertInputsCurrent(); options.assertInputsCurrent?.(); }
  }, plan.before);
  return { bytes: Buffer.from(plan.bytes), assertCurrent: prepared.assertCurrent, publish() { return prepared.publish()[0]!; } };
}
export function captureMechanicTargets(workspace: string) {
  const captured = captureMechanicPair(workspace, mechanicTargetsPath(workspace), "mechanic targets missing");
  const targets = mechanicTargetsSchema.parse(YAML.parse(requireMechanicPair(captured).toString("utf8")) as unknown);
  return { ...captured, targets };
}
export async function prepareInitialMechanicTargets(params: Parameters<typeof initMechanicTargets>[0], options: OrgPairsOptions = {}, previous?: OrgPairsSnapshot) {
  const input = { ...params, scope: { ...params.scope } }, measured = measuredTargetMapping(input.workspace, input.scope);
  const targets = defaultTargets(input.scope, input.mode, measured), expected = canonicalize(measured);
  const prepared = await prepareMechanicTargets({ workspace: input.workspace, targets, reason: "initial mechanic targets", measured }, {
    beforePublish: options.beforePublish, assertInputsCurrent() {
      if (canonicalize(measuredTargetMapping(input.workspace, input.scope)) !== expected) throw new Error("selected initial mechanic measurement changed while signing");
      options.assertInputsCurrent?.(); }
  }, previous);
  return { assertCurrent: prepared.assertCurrent, publish() { return { ...prepared.publish(), targets }; } };
}
export async function initMechanicTargetsAsync(params: Parameters<typeof initMechanicTargets>[0]) { return (await prepareInitialMechanicTargets(params)).publish(); }

export function initMechanicTargets(params: {
  workspace: string;
  scope: MechanicScope;
  mode: "DESIRED" | "EXCELLENCE";
}): { path: string; sigPath: string; targets: MechanicTargets } {
  const measured = measuredTargetMapping(params.workspace, params.scope);
  const targets = defaultTargets(params.scope, params.mode, measured);
  const saved = saveMechanicTargets({
    workspace: params.workspace,
    targets,
    reason: "initial mechanic targets",
    measured
  });
  return {
    ...saved,
    targets
  };
}

export function verifyMechanicTargetsSignature(workspace: string) {
  return verifyMechanicPair(workspace, mechanicTargetsPath(workspace), "mechanic targets missing");
}
