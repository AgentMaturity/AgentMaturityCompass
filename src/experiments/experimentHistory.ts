import { readdirSync } from "node:fs";
import { basename, join } from "node:path";
import type { ExperimentReport } from "../types.js";
import { verifyHexDigestAny } from "../crypto/keys.js";
import { runHashVerificationKeys } from "../ledger/runHashSignature.js";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import type { ExperimentFile } from "./experimentSchema.js";

export function listExperimentRunFiles(dir: string): string[] {
  if (!pathExists(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => join(dir, name))
    .sort((a, b) => a.localeCompare(b));
}

/** Why a stored run report may not be read as this experiment's current result, or null when it may. */
function experimentReportProblem(workspace: string, agentId: string, experiment: ExperimentFile, runId: string, report: ExperimentReport, currentConfiguration = true): string | null {
  if (typeof report !== "object" || report === null || Array.isArray(report)) return "report is not an object";
  const { reportJsonSha256, reportSealSig, ...base } = report;
  if (typeof reportJsonSha256 !== "string" || sha256Hex(canonicalize(base)) !== reportJsonSha256) return "report hash does not match its contents";
  let sealed = false;
  try { sealed = typeof reportSealSig === "string" && verifyHexDigestAny(reportJsonSha256, reportSealSig, runHashVerificationKeys(workspace)); }
  catch { sealed = false; }
  if (!sealed) return "report seal does not verify";
  const config = experiment.experiment;
  if (report.runId !== runId || report.experimentId !== config.experimentId || report.agentId !== agentId) return "report belongs to another run, experiment or agent";
  if (currentConfiguration && (report.casebookId !== config.casebookId || report.baselineConfigId !== config.baselineConfig.id)) return "experiment casebook or baseline changed since this run";
  if (currentConfiguration && report.candidateConfigId !== config.candidateConfig?.id) return "experiment candidate changed since this run";
  return null;
}

/** Read-only history may include earlier configurations; every report still needs its own valid seal and identity. */
export function readExperimentRun(workspace: string, agentId: string, experiment: ExperimentFile, file: string, currentConfiguration = true): ExperimentReport {
  let report: ExperimentReport;
  try { report = JSON.parse(readUtf8(file)) as ExperimentReport; }
  catch { throw new Error(`experiment run ${basename(file)} is unreadable`); }
  const problem = experimentReportProblem(workspace, agentId, experiment, basename(file, ".json"), report, currentConfiguration);
  if (problem) throw new Error(`experiment run ${basename(file)} refused: ${problem}`);
  return report;
}

