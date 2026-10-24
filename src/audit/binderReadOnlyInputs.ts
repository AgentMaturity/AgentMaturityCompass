import Database from "better-sqlite3";
import { join } from "node:path";
import YAML from "yaml";
import { assurancePolicyPath } from "../assurance/assurancePolicyStore.js";
import { assurancePolicySchema } from "../assurance/assurancePolicySchema.js";
import { mechanicTuningPath } from "../mechanic/tuningStore.js";
import { mechanicTuningSchema } from "../mechanic/tuningSchema.js";
import { listRetentionSegments } from "../ops/retention/retentionArchive.js";
import { readUtf8 } from "../utils/fs.js";
import { hostWorkspaceSchema } from "../workspaces/hostSchema.js";
import { normalizeWorkspaceId } from "../workspaces/workspaceId.js";

// Missing assurance policy is an explicit initialized-workspace prerequisite. No initializer/signing fallback.
export function readAuditAssurancePolicy(workspace: string) {
  return assurancePolicySchema.parse(YAML.parse(readUtf8(assurancePolicyPath(workspace))) as unknown);
}
// The collector's existing try/catch keeps missing or invalid tuning as unavailable; it no longer creates a policy.
export function readAuditMechanicTuning(workspace: string) {
  return mechanicTuningSchema.parse(YAML.parse(readUtf8(mechanicTuningPath(workspace))) as unknown);
}
// segmentCount is the only retentionStatus member this binder consumes. No writable Ledger is needed.
export function readAuditRetentionCount(workspace: string): number { return listRetentionSegments(workspace).length; }

/** Same selected host row/schema, using a genuine readonly, file-must-exist connection; no migration/digest write. */
export function readAuditWorkspaceRecord(hostDir: string, workspaceId: string) {
  const db = new Database(join(hostDir, "host.db"), { readonly: true, fileMustExist: true });
  try {
    const row = db.prepare(`SELECT workspace_id AS workspaceId, name, created_ts AS createdTs, updated_ts AS updatedTs, status
      FROM workspaces WHERE workspace_id = ?`).get(normalizeWorkspaceId(workspaceId));
    return row ? hostWorkspaceSchema.parse(row) : null;
  } finally { db.close(); }
}
