import { join } from "node:path";
import { loadOpsPolicy, verifyOpsPolicySignature } from "../policy.js";
import { appendOpsAuditEvent } from "../audit.js";
import { pruneOpsCaches } from "./cachePrune.js";
import { rotateLogs } from "./logRotation.js";
import { ensureOperationalIndexes, runVacuum } from "./sqliteMaintenance.js";
import { maintenanceStats } from "./stats.js";

export function maintenanceStatsCli(workspace: string): ReturnType<typeof maintenanceStats> {
  return maintenanceStats(workspace);
}

export function maintenanceVacuumCli(workspace: string): ReturnType<typeof runVacuum> {
  const verify = verifyOpsPolicySignature(workspace);
  if (!verify.valid) {
    throw new Error(`ops policy invalid: ${verify.reason ?? "unknown reason"}`);
  }
  const result = runVacuum(workspace);
  appendOpsAuditEvent({
    workspace,
    auditType: "MAINTENANCE_VACUUM",
    payload: {
      lastVacuumTs: result.lastVacuumTs
    }
  });
  return result;
}

export function maintenanceReindexCli(workspace: string): ReturnType<typeof ensureOperationalIndexes> {
  const verify = verifyOpsPolicySignature(workspace);
  if (!verify.valid) {
    throw new Error(`ops policy invalid: ${verify.reason ?? "unknown reason"}`);
  }
  return ensureOperationalIndexes(workspace);
}

export function maintenanceRotateLogsCli(workspace: string): ReturnType<typeof rotateLogs> {
  const verify = verifyOpsPolicySignature(workspace);
  if (!verify.valid) {
    throw new Error(`ops policy invalid: ${verify.reason ?? "unknown reason"}`);
  }
  const policy = loadOpsPolicy(workspace);
  const result = rotateLogs({
    workspace,
    logDir: join(workspace, ".amc", "studio", "logs"),
    maxDays: policy.opsPolicy.maintenance.rotateLogsDays,
    maxFileMb: policy.opsPolicy.maintenance.maxLogFileMb
  });
  appendOpsAuditEvent({
    workspace,
    auditType: "MAINTENANCE_ROTATE_LOGS",
    payload: {
      removed: result.removed.length,
      kept: result.kept.length
    }
  });
  return result;
}

export function maintenancePruneCacheCli(workspace: string): ReturnType<typeof pruneOpsCaches> {
  const verify = verifyOpsPolicySignature(workspace);
  if (!verify.valid) {
    throw new Error(`ops policy invalid: ${verify.reason ?? "unknown reason"}`);
  }
  const policy = loadOpsPolicy(workspace);
  return pruneOpsCaches({
    workspace,
    pruneConsoleSnapshotsDays: policy.opsPolicy.maintenance.pruneConsoleSnapshotsDays,
    pruneTransformSnapshotsDays: policy.opsPolicy.maintenance.pruneTransformSnapshotsDays
  });
}
