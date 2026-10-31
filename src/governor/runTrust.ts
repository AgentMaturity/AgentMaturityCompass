/**
 * Trusted run readers: a diagnostic run counts only when its seal verifies, it names the agent being read, and the
 * ledger `runs` table anchors it with the same hash, seal and status. `latestTrustedRun` serves gates and signers that
 * act on one run; `scanTrustedRuns` serves history readers (bench, forecast, org, indices, drift monitors).
 */
import { readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { openLedger } from "../ledger/ledger.js";
import type { DiagnosticReport, RunRecord } from "../types.js";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { fleetAgentsDir, fleetRoot } from "../fleet/paths.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { agentRunFiles, latestVerifiedRun, refusedRunsBlocking, scanVerifiedRuns, type RefusedRun } from "../diagnostic/runReportResolution.js";

/**
 * The run a gate or signer may act on (governor, ToolHub, the native Action Policy guard, transformation planning,
 * what-if, certificate, passport, binder): the newest run whose seal verifies under the workspace run-hash keys
 * (`latestVerifiedRun`), that names this agent, that the ledger `runs` table anchors with the same hash, seal and status,
 * and that is the agent's newest ledger run. Anything else is refused with the reason: a newer unverifiable or tampered
 * file blocks, and so does a newer ledger run of this agent (or one no file on disk can attribute to another agent), so
 * deleting the newest run file cannot roll the gate back to an older sealed run. Display callers that may show an
 * unverified run use `latestDisplayRun` and label it.
 */
export function latestTrustedRun(workspace: string, agentId: string): { run: DiagnosticReport | null; refusal: string | null } {
  const { run, blocking } = latestVerifiedRun(workspace, agentId);
  if (blocking.length > 0) return { run: null, refusal: sealRefusal(blocking) };
  if (!run) return { run: null, refusal: null };
  const rows = readLedgerRuns(workspace);
  const refusal = runAnchorRefusal(run, agentId, rows)
    ?? newerLedgerRunRefusal(workspace, agentId, rows!.find((row) => row.run_id === run.runId)!, rows!);
  return refusal === null ? { run, refusal: null } : { run: null, refusal };
}

/** A history read for consumers that sign, gate or alert on more than the latest run. */
export interface TrustedRunScan {
  /** This agent's sealed, ledger-anchored runs, newest first, each read from `<runId>.json` and present once. */
  runs: DiagnosticReport[];
  /** Tampered or unreadable files, and unsealed files newer than `runs[0]`: the history may be stale. */
  blocking: RefusedRun[];
  /**
   * Why this agent's history is not whole: the ledger cannot be read; a sealed file of this agent not anchored in the
   * ledger, not named for its runId, or present more than once; or a ledger run that may be this agent's and is missing
   * or untrusted on disk (history thinned by deleting or hiding files). An alerting reader must not report a clean
   * result while this is non-empty.
   */
  untrusted: string[];
  /** Sealed runs of another agent copied into this agent's runs dir: excluded, not this agent's history at all. */
  foreign: string[];
}

/**
 * `scanVerifiedRuns` with the `latestTrustedRun` agent and anchor checks applied to every run, plus a ledger coverage
 * check: each sealed ledger run is either in `runs`, or attributable on disk to another agent. Unsigned ledger rows are
 * skipped; the ledger itself records them as carrying no seal.
 */
export function scanTrustedRuns(workspace: string, agentId: string): TrustedRunScan {
  const scan = scanVerifiedRuns(workspace, agentId);
  const rows = readLedgerRuns(workspace);
  const names = new Set(agentRunFiles(workspace, agentId).map((file) => basename(file, ".json")));
  const counts = new Map<string, number>();
  for (const run of scan.runs) counts.set(run.runId, (counts.get(run.runId) ?? 0) + 1);
  const runs: DiagnosticReport[] = [], untrusted: string[] = [], foreign: string[] = [];
  const reported = new Set<string>(), refusedIds = new Set<string>();
  for (const run of scan.runs) {
    if (run.agentId !== agentId) {
      foreign.push(`diagnostic run ${run.runId} is sealed for agent ${String(run.agentId)}, not ${agentId}`);
      continue;
    }
    const copies = counts.get(run.runId)!;
    const refusal = copies > 1 ? `diagnostic run ${run.runId} appears in ${copies} run files`
      : !names.has(run.runId) ? `diagnostic run ${run.runId} is not stored as ${run.runId}.json`
        : runAnchorRefusal(run, agentId, rows);
    if (refusal === null) runs.push(run);
    else {
      refusedIds.add(run.runId);
      if (!reported.has(refusal)) { reported.add(refusal); untrusted.push(refusal); }
    }
  }
  const blocking = refusedRunsBlocking(scan.refused, runs[0]?.ts ?? null);
  if (rows === null) {
    untrusted.push("the ledger could not be read to check run history");
  } else {
    // Runs already in `runs`, or already reported above or as blocking files, need no coverage line.
    const seen = new Set([...runs.map((run) => run.runId), ...refusedIds, ...blocking.map((row) => basename(row.file, ".json"))]);
    // ponytail: one targeted file read per ledger run per agent dir; index run files once if ledgers grow large.
    for (const row of rows) {
      if (seen.has(row.run_id) || row.run_seal_sig === "unsigned") continue;
      const owner = ledgerRunOwner(workspace, row);
      if (owner === agentId) untrusted.push(`the ledger records run ${row.run_id} for ${agentId} but its run file is not trusted`);
      else if (owner === null) untrusted.push(`the ledger records run ${row.run_id} with no matching run file on disk`);
    }
  }
  return { runs, blocking, untrusted, foreign };
}

/** The trusted history for a consumer that signs or exports it, newest first; throws with every reason otherwise. */
export function listTrustedRuns(workspace: string, agentId: string): DiagnosticReport[] {
  const { runs, blocking, untrusted, foreign } = scanTrustedRuns(workspace, agentId);
  const reasons = [...(blocking.length > 0 ? [sealRefusal(blocking)] : []), ...foreign, ...untrusted];
  if (reasons.length > 0) throw new Error(`run history for agent ${agentId} is not trusted: ${reasons.join("; ")}`);
  return runs;
}

function sealRefusal(blocking: readonly RefusedRun[]): string {
  return `diagnostic run ${blocking.map((row) => basename(row.file)).join(", ")} failed seal verification`;
}

/** The ledger's runs, newest first, or null when it cannot be read (an unreadable ledger never vouches for a run). */
function readLedgerRuns(workspace: string): RunRecord[] | null {
  try {
    const ledger = openLedger(workspace);
    try {
      return ledger.listRuns();
    } finally {
      ledger.close();
    }
  } catch {
    return null;
  }
}

/** Why `run` is not this agent's ledger-anchored run, or null when it is. */
function runAnchorRefusal(run: DiagnosticReport, agentId: string, rows: readonly RunRecord[] | null): string | null {
  if (run.agentId !== agentId) return `diagnostic run ${run.runId} is sealed for agent ${String(run.agentId)}, not ${agentId}`;
  const row = rows?.find((item) => item.run_id === run.runId);
  return row && row.report_json_sha256 === run.reportJsonSha256 && row.run_seal_sig === run.runSealSig && row.status === run.status
    ? null : `diagnostic run ${run.runId} is not anchored in the ledger`;
}

/**
 * Rollback guard: a ledger run recorded at or after `selected` (ties count as newer) that is this agent's, or that no
 * run file on disk with the row's hash attributes to another agent, means the selected file is not the agent's newest.
 * `rows` is `listRuns()`, newest first.
 */
function newerLedgerRunRefusal(workspace: string, agentId: string, selected: RunRecord, rows: readonly RunRecord[]): string | null {
  for (const row of rows) {
    if (row.ts < selected.ts) break;
    if (row.run_id === selected.run_id) continue;
    const owner = ledgerRunOwner(workspace, row);
    if (owner === agentId) return `the ledger records newer run ${row.run_id} for ${agentId}, not ${selected.run_id}`;
    if (owner === null) return `the ledger records newer run ${row.run_id} with no matching run file on disk`;
  }
  return null;
}

/** The agentId of the run file whose content hashes to the ledger row's hash, searched across every agent's runs dir. */
function ledgerRunOwner(workspace: string, row: RunRecord): string | null {
  const agentsDir = fleetAgentsDir(workspace);
  const dirs = [join(fleetRoot(workspace), "runs"),
    ...(pathExists(agentsDir) ? readdirSync(agentsDir).map((id) => join(agentsDir, id, "runs")) : [])];
  for (const dir of dirs) {
    const file = join(dir, `${row.run_id}.json`);
    if (!pathExists(file)) continue;
    try {
      const parsed = JSON.parse(readUtf8(file)) as Record<string, unknown>;
      if (typeof parsed.agentId === "string"
        && sha256Hex(canonicalize({ ...parsed, reportJsonSha256: "", runSealSig: "" })) === row.report_json_sha256) return parsed.agentId;
    } catch {
      // unreadable: not attributable
    }
  }
  return null;
}
