import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { EvidenceOutcome } from "../types.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { readTransparencyEntries, transparencyLogPath, verifyTransparencyLog } from "../transparency/logChain.js";
import { pathExists } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { transformPlanSchema, type TransformPlan } from "../transformation/transformTasks.js";
import type { ForecastScope } from "./forecastSchema.js";

export interface ForecastTransformPlanInput {
  outcome: EvidenceOutcome;
  reason: string | null;
}

/** Optional forecast input: parse and verify the same bytes before using effort or recommendations. */
export function loadForecastTransformPlan(workspace: string, scope: ForecastScope): ForecastTransformPlanInput & { plan: TransformPlan | null } {
  if (scope.type === "WORKSPACE") {
    return { plan: null, outcome: "not_evaluated", reason: "Transform plans are scoped to agents or nodes." };
  }
  const path = scope.type === "AGENT"
    ? join(workspace, ".amc", "agents", scope.id, "transform", "latest.json")
    : join(workspace, ".amc", "org", "transform", scope.id, "latest.json");
  try {
    const bytes = readFileSync(path);
    const plan = transformPlanSchema.parse(JSON.parse(bytes.toString("utf8")) as unknown);
    const verification = verifyAuditorSignatureBytes(workspace, "BUNDLE", bytes, readFileSync(`${path}.sig`));
    if (!verification.valid) {
      return { plan: null, outcome: "source_unavailable", reason: `Transform plan verification failed: ${verification.reason ?? "unknown"}` };
    }
    const boundId = plan.scope.type === "AGENT" ? plan.scope.agentId : plan.scope.nodeId;
    if (plan.scope.type !== scope.type || boundId !== scope.id) {
      return { plan: null, outcome: "source_unavailable", reason: "Transform plan is signed for a different scope." };
    }
    const rollback = transformPlanAnchorProblem(workspace, scope, plan, bytes) ?? transformPlanRollbackProblem(workspace, dirname(path), plan, bytes);
    if (rollback) return { plan: null, outcome: "source_unavailable", reason: rollback };
    return { plan, outcome: "measured", reason: null };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" && (error as NodeJS.ErrnoException).path === path) {
      return { plan: null, outcome: "not_evaluated", reason: "Transform plan missing." };
    }
    return { plan: null, outcome: "source_unavailable",
      reason: `Transform plan ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}` };
  }
}

/**
 * Freshness is anchored in the sealed transparency log, which the workspace cannot rewrite without the auditor key:
 * the newest TRANSFORM_PLAN_CREATED/UPDATED entry for this scope must name latest.json's planId and exact bytes.
 * ponytail: reads and verifies the whole log on each refresh; a restored older log+seal pair is caught only by the
 * log's own anchors (src/keys/highWater.ts names it the second floor), not here.
 */
function transformPlanAnchorProblem(workspace: string, scope: ForecastScope, plan: TransformPlan, latestBytes: Buffer): string | null {
  if (!pathExists(transparencyLogPath(workspace))) return "Transform plan has no transparency record.";
  const log = verifyTransparencyLog(workspace);
  if (!log.ok) return "Transform plan freshness is unverifiable: the transparency log does not verify.";
  const entries = readTransparencyEntries(workspace);
  if ((entries.at(-1)?.hash ?? "") !== log.lastHash) return "Transform plan freshness is unverifiable: the transparency log changed while reading.";
  const agentId = scope.type === "AGENT" ? scope.id : `node:${scope.id}`;
  const anchor = entries.filter((entry) => entry.agentId === agentId
    && (entry.type === "TRANSFORM_PLAN_CREATED" || entry.type === "TRANSFORM_PLAN_UPDATED")).at(-1);
  if (!anchor) return "Transform plan has no transparency record.";
  if (anchor.artifact.id !== plan.planId || anchor.artifact.sha256 !== sha256Hex(latestBytes)) {
    return "Transform plan is not the latest recorded plan; latest.json was rolled back.";
  }
  return null;
}

/** latest.json must be the archived signed plan with the newest createdTs; an unverifiable archive entry is tampering. */
function transformPlanRollbackProblem(workspace: string, root: string, plan: TransformPlan, latestBytes: Buffer): string | null {
  const plansDir = join(root, "plans");
  let archived: Buffer;
  try { archived = readFileSync(join(plansDir, `${plan.planId}.json`)); }
  catch { return "Transform plan is not in the signed plan archive."; }
  if (!archived.equals(latestBytes)) return "Transform plan differs from its archived signed copy.";
  for (const name of readdirSync(plansDir).filter((file) => file.endsWith(".json") && file !== `${plan.planId}.json`)) {
    let other: TransformPlan;
    try {
      const bytes = readFileSync(join(plansDir, name));
      if (!verifyAuditorSignatureBytes(workspace, "TRANSFORM_PLAN", bytes, readFileSync(join(plansDir, `${name}.sig`))).valid) {
        return `Transform plan archive entry ${name} does not verify.`;
      }
      other = transformPlanSchema.parse(JSON.parse(bytes.toString("utf8")) as unknown);
    } catch { return `Transform plan archive entry ${name} does not verify.`; }
    if (other.createdTs > plan.createdTs) return "A newer signed transform plan exists; latest.json was rolled back.";
  }
  return null;
}
