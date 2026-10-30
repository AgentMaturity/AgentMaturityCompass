import { readdirSync, realpathSync, statSync, unlinkSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { ensureDir, pathExists } from "../../utils/fs.js";
import { getWorkspaceScope } from "../../enforce/evidenceEmitter.js";
import { withDeletionGate, resolveDeletionWorkspace, DeletionDenied } from "../../residency/deletionGate.js";
import { RegimeRetentionRefused, regimeFloor } from "../retention/regimeRetention.js";

export function rotateLogs(params: {
  workspace?: string;
  logDir: string;
  maxDays: number;
  maxFileMb: number;
}): {
  removed: string[];
  kept: string[];
} {
  const scoped = params.workspace ?? getWorkspaceScope();
  const workspace = scoped === undefined ? undefined : resolveDeletionWorkspace(scoped);
  const logDir = resolve(params.logDir);
  ensureDir(logDir);
  const removed: string[] = [];
  const kept: string[] = [];
  // P2-26: no log younger than an applicable regime's floor is deleted, by age or by size; an unreadable plan refuses.
  const floor = workspace === undefined ? null : regimeFloor(workspace, "logs");
  if (floor !== null && params.maxDays < floor.days) {
    throw new RegimeRetentionRefused([`maintenance.rotateLogsDays ${params.maxDays} days undercuts the ${floor.days}-day logs minimum of ${floor.regimeIds.join(", ")}`]);
  }
  const cutoff = Date.now() - Math.max(1, params.maxDays) * 24 * 60 * 60 * 1000;
  const floorCutoff = floor === null ? Infinity : Date.now() - floor.days * 24 * 60 * 60 * 1000;
  const maxBytes = Math.max(1, params.maxFileMb) * 1024 * 1024;
  for (const entry of readdirSync(logDir, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }
    const full = join(logDir, entry.name);
    if (!pathExists(full)) {
      continue;
    }
    const stat = statSync(full);
    const tooOld = stat.mtimeMs < cutoff;
    const tooLarge = stat.size > maxBytes && stat.mtimeMs < floorCutoff;
    if (tooOld || tooLarge) {
      try {
        const targetWorkspace = resolveDeletionWorkspace(workspace);
        if (workspace === undefined) {
          // Legacy cwd authority does not authorize an arbitrary external log directory.
          const suffix = relative(realpathSync(targetWorkspace), realpathSync(logDir));
          if (isAbsolute(suffix) || suffix === ".." || suffix.startsWith(`..${sep}`)) {
            throw new DeletionDenied({ verdict: "unknown", reason: "tenant_unmapped" }, false);
          }
        }
        withDeletionGate({ workspace: targetWorkspace, executor: "maintenance.log-unlink",
          target: { kind: "logs", before: new Date(cutoff).toISOString() } }, () => unlinkSync(full));
        removed.push(full);
      } catch (error) {
        if (!(error instanceof DeletionDenied)) throw error;
        kept.push(full);
      }
    } else {
      kept.push(full);
    }
  }
  return { removed, kept };
}
