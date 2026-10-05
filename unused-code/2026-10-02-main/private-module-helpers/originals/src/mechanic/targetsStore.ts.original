import { readdirSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { questionBank } from "../diagnostic/questionBank.js";
import { loadRunReport } from "../diagnostic/runner.js";
import { resolveAgentId } from "../fleet/paths.js";
import { signFileWithAuditor, verifySignedFileWithAuditor } from "../org/orgSigner.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
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

function latestRunIdForAgent(workspace: string, agentId: string): string | null {
  const runsDir = join(workspace, ".amc", "agents", agentId, "runs");
  if (!pathExists(runsDir)) {
    return null;
  }
  const files = readdirSync(runsDir)
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));
  if (files.length === 0) {
    return null;
  }
  return files[files.length - 1]!.replace(/\.json$/, "");
}

function measuredTargetMapping(workspace: string, scope: MechanicScope): Record<string, number> | null {
  const agentId = scope.type === "AGENT" ? resolveAgentId(workspace, scope.id) : "default";
  const runId = latestRunIdForAgent(workspace, agentId);
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

export function defaultTargets(scope: MechanicScope, mode: "DESIRED" | "EXCELLENCE", measured: Record<string, number> | null): MechanicTargets {
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

export function saveMechanicTargets(params: {
  workspace: string;
  targets: MechanicTargets;
  reason?: string;
  measured?: Record<string, number> | null;
}): { path: string; sigPath: string } {
  const path = mechanicTargetsPath(params.workspace);
  ensureDir(mechanicRoot(params.workspace));
  const parsed = mechanicTargetsSchema.parse(params.targets);
  const current = pathExists(path) ? mechanicTargetsSchema.parse(YAML.parse(readUtf8(path)) as unknown) : null;
  const measured = params.measured ?? measuredTargetMapping(params.workspace, parsed.mechanicTargets.scope);

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

  writeFileAtomic(path, YAML.stringify(normalized), 0o644);
  const sigPath = signFileWithAuditor(params.workspace, path);
  return { path, sigPath };
}

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
  const path = mechanicTargetsPath(workspace);
  if (!pathExists(path)) {
    return {
      valid: false,
      signatureExists: false,
      reason: "mechanic targets missing",
      path,
      sigPath: `${path}.sig`
    };
  }
  return verifySignedFileWithAuditor(workspace, path);
}
