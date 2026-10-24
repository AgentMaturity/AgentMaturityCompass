/** Actual mechanic budget action. Raw config-purpose wire; no BUNDLE envelope or caller-supplied authority. */
import { relative } from "node:path";
import YAML from "yaml";
import { captureBudgetsPublication, BudgetsPublicationError, budgetsSchema, budgetsPath } from "../budgets/budgets.js";
import { captureOrgPairs, assertOrgPairsCurrent, orgPairBytes, OrgPairsPublicationError } from "../org/preparedOrgPairs.js";
import { mechanicTuningPath, prepareInitialMechanicTuning } from "./tuningStore.js";
import { mechanicTuningSchema } from "./tuningSchema.js";

class MechanicBudgetPublicationError extends Error {
  readonly code = "MECHANIC_BUDGET_PARTIAL";
  constructor(readonly publishedPaths: readonly string[], readonly attemptedPath: string, cause: unknown) {
    super("mechanic budget publication is incomplete; inspect committed members before retrying", { cause });
    this.name = "MechanicBudgetPublicationError";
  }
}

export async function updateMechanicBudgets(params: {
  workspace: string; agentId: string; beforeEffect: () => void; recordEffect: (effect: string) => void;
}): Promise<string> {
  const { workspace, agentId, beforeEffect, recordEffect } = params;
  beforeEffect(); const tuningPath = mechanicTuningPath(workspace), tuningBefore = captureOrgPairs([tuningPath]);
  // Capture the real raw config authority and both actual budget destinations BEFORE any cold prerequisite await.
  const writer = captureBudgetsPublication(workspace, beforeEffect), currentBytes = writer.bytes;
  let tuningBytes = orgPairBytes(tuningBefore, tuningPath), assertTuning = () => assertOrgPairsCurrent(tuningBefore);
  const completed: string[] = []; let attemptedPath = relative(workspace, tuningPath);
  const recordMany = (paths: readonly string[]) => { const values = paths.map(path => relative(workspace, path)); completed.push(...values); for (const value of values) recordEffect(value); };
  const record = (path: string) => recordMany([path]);
  try {
    if (tuningBytes === null) {
      const initial = await prepareInitialMechanicTuning({ workspace, scope: { type: "WORKSPACE", id: "workspace" } }, {
        beforePublish() { beforeEffect(); writer.assertCurrent(); },
        assertInputsCurrent() { assertOrgPairsCurrent(tuningBefore); writer.assertCurrent(); }
      }, tuningBefore);
      const saved = initial.publish(); recordMany([saved.path, saved.sigPath]);
      // This gate checks the exact prepared own pair; no newer authority or arbitrary post-read is adopted.
      initial.assertCurrent(); tuningBytes = Buffer.from(initial.bytes); assertTuning = initial.assertCurrent;
    }
    if (currentBytes === null) throw new Error(`Budgets config not found: ${budgetsPath(workspace)}`);
    const budgets = budgetsSchema.parse(YAML.parse(currentBytes.toString("utf8")) as unknown);
    const existing = budgets.budgets.perAgent[agentId] ?? budgets.budgets.perAgent.default;
    if (!existing) throw new Error(`budgets profile missing for agent ${agentId}`);
    const tuning = mechanicTuningSchema.parse(YAML.parse(tuningBytes.toString("utf8")) as unknown).mechanicTuning.knobs;
    budgets.budgets.perAgent[agentId] = {
      ...existing,
      daily: {
        ...existing.daily,
        maxLlmRequests: Math.max(1, tuning.maxToolCallsPerRun),
        maxLlmTokens: Math.max(1000, tuning.maxTokensPerRun),
        maxCostUsd: Math.max(0.01, tuning.maxCostPerDayUsd),
        maxToolExecutes: Object.fromEntries(Object.entries(existing.daily.maxToolExecutes).map(([actionClass]) => [
          actionClass, Math.max(0, tuning.maxToolCallsPerRun)
        ])) as typeof existing.daily.maxToolExecutes
      },
      perMinute: { maxLlmRequests: Math.max(1, Math.ceil(tuning.maxToolCallsPerRun / 2)),
        maxLlmTokens: Math.max(1000, Math.ceil(tuning.maxTokensPerRun / 12)) }
    };
    attemptedPath = ".amc/budgets.yaml";
    const prepared = await writer.prepareAsync(Buffer.from(YAML.stringify(budgets)), assertTuning);
    const saved = prepared.publish({ recorded: record }); prepared.assertCurrent(); return saved.configPath;
  } catch (cause) {
    const partial = cause instanceof OrgPairsPublicationError || cause instanceof BudgetsPublicationError ? cause.publishedPaths : [];
    if (completed.length === 0 && partial.length === 0) throw cause;
    throw new MechanicBudgetPublicationError(Object.freeze([...new Set([...completed, ...partial])]),
      cause instanceof OrgPairsPublicationError || cause instanceof BudgetsPublicationError ? cause.attemptedPath : attemptedPath, cause);
  }
}
