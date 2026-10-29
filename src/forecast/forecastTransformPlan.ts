import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { EvidenceOutcome } from "../types.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
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
    const rollback = transformPlanRollbackProblem(workspace, dirname(path), plan, bytes);
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

/** latest.json must be the archived signed plan with the newest createdTs; an older signed plan copied over it is a rollback. */
function transformPlanRollbackProblem(workspace: string, root: string, plan: TransformPlan, latestBytes: Buffer): string | null {
  const plansDir = join(root, "plans");
  let archived: Buffer;
  try { archived = readFileSync(join(plansDir, `${plan.planId}.json`)); }
  catch { return "Transform plan is not in the signed plan archive."; }
  if (!archived.equals(latestBytes)) return "Transform plan differs from its archived signed copy.";
  for (const name of readdirSync(plansDir).filter((file) => file.endsWith(".json") && file !== `${plan.planId}.json`)) {
    try {
      const bytes = readFileSync(join(plansDir, name));
      if (!verifyAuditorSignatureBytes(workspace, "TRANSFORM_PLAN", bytes, readFileSync(join(plansDir, `${name}.sig`))).valid) continue;
      if (transformPlanSchema.parse(JSON.parse(bytes.toString("utf8")) as unknown).createdTs > plan.createdTs) {
        return "A newer signed transform plan exists; latest.json was rolled back.";
      }
    } catch { continue; }
  }
  return null;
}
