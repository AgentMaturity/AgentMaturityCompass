import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { latestAssuranceByPack } from "../assurance/assuranceRunner.js";
import { sealedRunReportVerifies } from "../diagnostic/reportSeal.js";
import { refusedRunsBlocking, scanVerifiedRuns } from "../diagnostic/runReportResolution.js";
import { openLedger } from "../ledger/ledger.js";
import type { DiagnosticReport } from "../types.js";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import { pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { createFreezeIncident, createFreezeIncidentForSnapshot, createFreezeIncidentForAuthority, listIncidents, type FreezeIncident } from "./freezeEngine.js";
import { dispatchAlert, captureVerifiedAlertsConfig } from "./alerts.js";
import { evaluateDriftRules } from "./driftRules.js";

/** Sealed runs only (WP37): an edited run must neither trigger nor suppress a signed freeze. Bytes are kept for the TOCTOU re-check. */
function loadRunRows(workspace: string, agentId: string): Array<{ path: string; bytes: Buffer; run: DiagnosticReport }> {
  const runsDir = getAgentPaths(workspace, agentId).runsDir;
  if (!pathExists(runsDir)) return [];
  return readdirSync(runsDir).filter(name => name.endsWith(".json")).flatMap(name => {
    try { const path = join(runsDir, name), bytes = readFileSync(path), run = JSON.parse(bytes.toString("utf8")) as DiagnosticReport | null;
      return run !== null && sealedRunReportVerifies(workspace, run as unknown as Record<string, unknown>) ? [{ path, bytes, run }] : []; }
    catch { return []; }
  }).sort((a, b) => a.run.ts - b.run.ts);
}

export interface DriftCheckResult {
  agentId: string;
  triggered: boolean;
  ruleId: string | null;
  reasons: string[];
  previousRunId: string | null;
  currentRunId: string | null;
  incidentId: string | null;
}

interface DriftCheckParams { workspace: string; agentId?: string; currentRunId?: string }
type ReadyDrift = { agentId: string; previous: DiagnosticReport; current: DiagnosticReport; rule: ReturnType<typeof captureVerifiedAlertsConfig>["config"]["alerts"]["rules"][number];
  evaluated: ReturnType<typeof evaluateDriftRules>; assertInputsCurrent(): void };

function prepareDriftDecision(input: DriftCheckParams): { result: DriftCheckResult } | ReadyDrift {
  const params = { ...input }, agentId = resolveAgentId(params.workspace, params.agentId), rows = loadRunRows(params.workspace, agentId), runs = rows.map(row => row.run);
  const empty = (reasons: string[], previousRunId: string | null, currentRunId: string | null): { result: DriftCheckResult } => ({ result: {
    agentId, triggered: false, ruleId: null, reasons, previousRunId, currentRunId, incidentId: null } });
  if (runs.length < 2) return empty(["not enough runs for drift comparison"], null, runs.at(-1)?.runId ?? null);
  const select = (values: ReturnType<typeof loadRunRows>) => {
    const current = (params.currentRunId ? values.find(row => row.run.runId === params.currentRunId) : values.at(-1)) ?? values.at(-1)!;
    const previous = values.filter(row => row.run.ts < current.run.ts).at(-1)!; return { current, previous };
  };
  const selected = select(rows), { current, previous } = { current: selected.current.run, previous: selected.previous.run };
  // A tampered, unreadable or newer unsealed run means the selected pair may be stale: report it, never decide on it (WP37).
  const blocking = refusedRunsBlocking(scanVerifiedRuns(params.workspace, agentId).refused, current.ts);
  if (blocking.length > 0) return empty([`INSUFFICIENT_EVIDENCE: unverifiable diagnostic run(s) ${blocking.map(row => row.file).join(", ")}; drift not evaluated`], previous.runId, current.runId);
  let alerts: ReturnType<typeof captureVerifiedAlertsConfig>;
  try { alerts = captureVerifiedAlertsConfig(params.workspace); }
  catch (error) { return empty([`alerts config invalid: ${error instanceof Error ? error.message : "unknown"}`], previous.runId, current.runId); }
  const assurance = () => latestAssuranceByPack({ workspace: params.workspace, agentId, windowStartTs: current.windowStartTs, windowEndTs: current.windowEndTs });
  const assuranceByPack = assurance(), evaluated = evaluateDriftRules({ config: alerts.config, previousRun: previous, currentRun: current, assuranceByPack });
  if (!evaluated.triggered || !evaluated.ruleId) return empty(evaluated.reasons, previous.runId, current.runId);
  const rule = alerts.config.alerts.rules.find(item => item.id === evaluated.ruleId)!;
  const used = new Set<string>();
  for (const row of alerts.config.alerts.rules) { for (const id of Object.keys(row.when.assuranceDropBelow)) used.add(id); if (row === rule) break; }
  const projection = (values: typeof assuranceByPack) => JSON.stringify([...used].map(id => [id, values.get(id)?.score0to100 ?? null]));
  const assuranceInput = projection(assuranceByPack);
  return { agentId, current, previous, rule, evaluated, assertInputsCurrent() {
    alerts.assertCurrent();
    let now: ReturnType<typeof select>;
    try { now = select(loadRunRows(params.workspace, agentId)); }
    catch (cause) { throw new Error("selected drift decision inputs changed while freeze signing was prepared", { cause }); }
    if (now.current?.path !== selected.current.path || now.previous?.path !== selected.previous.path
      || !now.current.bytes.equals(selected.current.bytes) || !now.previous.bytes.equals(selected.previous.bytes)
      || projection(assurance()) !== assuranceInput) throw new Error("selected drift decision inputs changed while freeze signing was prepared");
  } };
}

function incidentInput(params: DriftCheckParams, ready: ReadyDrift): Parameters<typeof createFreezeIncident>[0] {
  return { workspace: params.workspace, agentId: ready.agentId, ruleId: ready.evaluated.ruleId!, previousRunId: ready.previous.runId,
    currentRunId: ready.current.runId, deltas: ready.evaluated.deltas,
    actionClasses: ready.rule.actions.includes("FREEZE_EXECUTE") ? ready.rule.freezeActionClasses ?? ["DEPLOY", "WRITE_HIGH", "SECURITY"] : [],
    reason: ready.evaluated.reasons.join("; ") };
}

/** Retained incident-signing branch for callback-absent registry consumers. */
export async function runDriftCheck(input: DriftCheckParams): Promise<DriftCheckResult> {
  const params = { ...input }, ready = prepareDriftDecision(params); if ("result" in ready) return ready.result;
  const incident = createFreezeIncidentForSnapshot(incidentInput(params, ready), ready.assertInputsCurrent);
  return finishDriftCheck(params, ready, incident, false);
}
export async function runDriftCheckAsync(input: DriftCheckParams): Promise<DriftCheckResult> {
  return runDriftCheckForAuthority(input, () => {});
}
/** Internal maintained caller handoff. No request-derived actor or signer selector is accepted. */
export async function runDriftCheckForAuthority(input: DriftCheckParams, beforePublish: () => void): Promise<DriftCheckResult> {
  const params = { ...input }, ready = prepareDriftDecision(params); if ("result" in ready) return ready.result;
  const incident = await createFreezeIncidentForAuthority(incidentInput(params, ready), () => { beforePublish(); ready.assertInputsCurrent(); });
  return finishDriftCheck(params, ready, incident, true);
}

class DriftPartialError extends Error {
  readonly code = "DRIFT_PARTIAL";
  constructor(readonly incidentId: string, readonly incidentPath: string, readonly phase: string, readonly completed: readonly string[], cause: unknown) {
    super("drift incident was published, but a later required effect did not complete", { cause }); this.name = "DriftPartialError";
  }
}
/** Preserve an already published incident when a maintained caller's secondary effect fails. */
export function driftPostPublicationError(workspace: string, result: Pick<DriftCheckResult, "agentId" | "incidentId">, phase: string, cause: unknown): unknown {
  return result.incidentId === null ? cause : new DriftPartialError(result.incidentId,
    join(getAgentPaths(workspace, result.agentId).rootDir, "incidents", `${result.incidentId}.json`), phase, ["incident", "drift-check"], cause);
}

async function finishDriftCheck(params: DriftCheckParams, ready: ReadyDrift, incident: FreezeIncident, checked: boolean): Promise<DriftCheckResult> {
  const { agentId, current, previous, rule, evaluated } = ready, completed = ["incident"];
  let phase = "ledger-open";
  try {
    phase = "ledger-open";
    const ledger = openLedger(params.workspace); completed.push("ledger-open");
    const sessionId = `drift-${randomUUID()}`;
    let failed: unknown;
    try {
      phase = "ledger-start";
      ledger.startSession({
        sessionId,
        runtime: "unknown",
        binaryPath: "amc-drift-check",
        binarySha256: sha256Hex("amc-drift-check")
      });
      completed.push("ledger-start"); phase = "drift-audit";
      ledger.appendEvidence({
        sessionId,
        runtime: "unknown",
        eventType: "audit",
        payload: JSON.stringify({
          auditType: "DRIFT_REGRESSION_DETECTED",
          severity: "HIGH",
          agentId,
          ruleId: evaluated.ruleId,
          previousRunId: previous.runId,
          currentRunId: current.runId,
          incidentId: incident.incidentId,
          reasons: evaluated.reasons
        }),
        payloadExt: "json",
        inline: true,
        meta: {
          auditType: "DRIFT_REGRESSION_DETECTED",
          severity: "HIGH",
          agentId,
          incidentId: incident.incidentId,
          ruleId: evaluated.ruleId,
          trustTier: "OBSERVED"
        }
      });
      completed.push("drift-audit");
      if (incident.freeze.actionClasses.length > 0) {
        phase = "freeze-audit";
        ledger.appendEvidence({
          sessionId,
          runtime: "unknown",
          eventType: "audit",
          payload: JSON.stringify({
            auditType: "EXECUTE_FROZEN_ACTIVE",
            severity: "HIGH",
            agentId,
            incidentId: incident.incidentId,
            actionClasses: incident.freeze.actionClasses
          }),
          payloadExt: "json",
          inline: true,
          meta: {
            auditType: "EXECUTE_FROZEN_ACTIVE",
            severity: "HIGH",
            agentId,
            incidentId: incident.incidentId,
            actionClasses: incident.freeze.actionClasses,
            trustTier: "OBSERVED"
          }
        });
      }
      if (incident.freeze.actionClasses.length > 0) completed.push("freeze-audit");
      phase = "ledger-seal"; ledger.sealSession(sessionId); completed.push("ledger-seal");
    } catch (error) { failed = error; throw error; }
    finally {
      if (failed === undefined) phase = "ledger-close";
      try { ledger.close(); completed.push("ledger-close"); }
      // oxlint-disable-next-line no-unsafe-finally -- A cleanup failure must surface, with any primary failure, instead of reporting success.
      catch (error) { if (failed !== undefined) throw new AggregateError([failed, error], "drift ledger close also failed", { cause: failed }); throw error; }
    }

    if (rule.actions.includes("ALERT_OWNER")) {
      phase = "alert";
      await dispatchAlert(params.workspace, {
        type: "AMC_ALERT",
        ruleId: rule.id,
        agentId,
        runId: current.runId,
        summary: `Drift/regression detected: ${evaluated.reasons.join(" | ")}`,
        links: {
          dashboard: "http://127.0.0.1:4173",
          report: `.amc/agents/${agentId}/reports/${current.runId}.md`
        },
        hashes: {
          reportSha256: current.reportJsonSha256,
          bundleSha256: sha256Hex(`${agentId}:${current.runId}`)
        }
      });
      completed.push("alert");
    }

    return { agentId, triggered: true, ruleId: evaluated.ruleId, reasons: evaluated.reasons,
      previousRunId: previous.runId, currentRunId: current.runId, incidentId: incident.incidentId };
  } catch (error) {
    if (!checked) throw error;
    throw new DriftPartialError(incident.incidentId, join(getAgentPaths(params.workspace, agentId).rootDir, "incidents", `${incident.incidentId}.json`), phase, [...completed], error);
  }
}

export function lastDriftCheckSummary(workspace: string, agentId?: string): {
  incidentId: string | null;
  activeFreeze: boolean;
} {
  const incidents = listIncidents(workspace, resolveAgentId(workspace, agentId));
  const latest = incidents[0];
  return {
    incidentId: latest?.incidentId ?? null,
    activeFreeze: Boolean(latest?.freeze.active)
  };
}

export function writeDriftCheckReport(params: {
  workspace: string;
  agentId?: string;
  outFile: string;
  result: DriftCheckResult;
}): string {
  const out = join(params.workspace, params.outFile);
  const lines = [
    `# Drift Report (${params.result.agentId})`,
    "",
    `triggered: ${params.result.triggered ? "yes" : "no"}`,
    `ruleId: ${params.result.ruleId ?? "none"}`,
    `previousRunId: ${params.result.previousRunId ?? "n/a"}`,
    `currentRunId: ${params.result.currentRunId ?? "n/a"}`,
    `incidentId: ${params.result.incidentId ?? "none"}`,
    "",
    "## Reasons",
    ...params.result.reasons.map((reason) => `- ${reason}`)
  ];
  writeFileAtomic(out, `${lines.join("\n")}\n`, 0o644);
  return out;
}
