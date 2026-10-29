import { readFileSync } from "node:fs";
import { join } from "node:path";
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
    return { plan, outcome: "measured", reason: null };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" && (error as NodeJS.ErrnoException).path === path) {
      return { plan: null, outcome: "not_evaluated", reason: "Transform plan missing." };
    }
    return { plan: null, outcome: "source_unavailable",
      reason: `Transform plan ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}` };
  }
}
