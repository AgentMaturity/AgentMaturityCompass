import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { AssuranceReport } from "../../types.js";
import { sealedRunReportVerifies } from "../../diagnostic/reportSeal.js";
import { getAgentPaths, resolveAgentId } from "../../fleet/paths.js";
import { openLedger, type Ledger } from "../../ledger/ledger.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../../utils/fs.js";
import { canonicalize } from "../../utils/json.js";
import { sha256Hex } from "../../utils/hash.js";
import type { Domain } from "../domainRegistry.js";
import {
  assertAssuranceReportProvenance,
  resolveRequirements,
  type PackResponseEvidence
} from "./conformanceEvidence.js";
import { renderConformanceJson, renderConformanceMarkdown } from "./conformanceExport.js";
import { deriveStationRequirements, type ConformanceStationProfile } from "./conformanceRequirements.js";
import {
  conformanceExportSchema,
  type ConformanceCounts,
  type ConformanceExport,
  type ConformanceRefusedInput,
  type ConformanceRequirement,
  type ConformanceStatus
} from "./conformanceSchema.js";
import { currentConformanceEnvironment, resolveSourceCommit } from "./environment.js";

export interface ConformanceVerdict {
  status: ConformanceStatus;
  counts: ConformanceCounts;
  failedRequirementIds: string[];
  notEvaluatedRequirementIds: string[];
}

/**
 * The only rule that turns requirement statuses into a conformance status:
 * REQUIREMENTS_MET when at least one requirement exists and every one is PASS.
 * A FAIL or a NOT_EVALUATED anywhere is REQUIREMENTS_NOT_MET — nothing is weighted,
 * averaged or thresholded, so nothing can hide an unmeasured requirement.
 */
export function conformanceStatusFrom(requirements: readonly ConformanceRequirement[]): ConformanceVerdict {
  const failedRequirementIds = requirements.filter((row) => row.status === "FAIL").map((row) => row.id);
  const notEvaluatedRequirementIds = requirements.filter((row) => row.status === "NOT_EVALUATED").map((row) => row.id);
  const pass = requirements.filter((row) => row.status === "PASS").length;
  const counts: ConformanceCounts = {
    total: requirements.length,
    pass,
    fail: failedRequirementIds.length,
    notEvaluated: notEvaluatedRequirementIds.length
  };
  const status: ConformanceStatus =
    requirements.length > 0 && failedRequirementIds.length === 0 && notEvaluatedRequirementIds.length === 0 ? "REQUIREMENTS_MET" : "REQUIREMENTS_NOT_MET";
  return { status, counts, failedRequirementIds, notEvaluatedRequirementIds };
}

export interface ComposeConformanceInput {
  station: Domain;
  agentId: string;
  packResponses: PackResponseEvidence[];
  /** Reports whose seal the caller has already verified; provenance is checked here. */
  assuranceReports: AssuranceReport[];
  profile?: ConformanceStationProfile;
  refusedInputs?: ConformanceRefusedInput[];
  sourceCommit?: string;
  nowTs?: number;
  conformanceRunId?: string;
}

/** Composes an unsealed run (seal fields empty) from already-loaded evidence. */
export function composeConformanceRun(input: ComposeConformanceInput): ConformanceExport {
  const specs = deriveStationRequirements(input.station, input.profile);
  const requirements = resolveRequirements({
    station: input.station,
    agentId: input.agentId,
    specs,
    packResponses: input.packResponses,
    assuranceReports: input.assuranceReports
  });
  const verdict = conformanceStatusFrom(requirements);
  const commit = resolveSourceCommit(input.sourceCommit);
  const run: ConformanceExport = {
    schema: "amc.conformance-run/1",
    conformanceRunId: input.conformanceRunId ?? randomUUID(),
    station: input.station,
    agentId: input.agentId,
    generatedTs: input.nowTs ?? Date.now(),
    sourceCommit: commit.sourceCommit,
    sourceCommitResolution: commit.resolution,
    environment: currentConformanceEnvironment(),
    profile: input.profile ? { id: input.profile.id, source: input.profile.source } : null,
    status: verdict.status,
    counts: verdict.counts,
    failedRequirementIds: verdict.failedRequirementIds,
    notEvaluatedRequirementIds: verdict.notEvaluatedRequirementIds,
    requirements,
    inputs: {
      assuranceRuns: [...input.assuranceReports]
        .sort((a, b) => a.ts - b.ts || a.assuranceRunId.localeCompare(b.assuranceRunId))
        .map((report) => ({
          assuranceRunId: report.assuranceRunId,
          sessionId: report.sessionId ?? "",
          reportJsonSha256: report.reportJsonSha256,
          ts: report.ts,
          packIds: report.packResults.map((pack) => pack.packId)
        })),
      packResponseCount: input.packResponses.length
    },
    refusedInputs: input.refusedInputs ?? [],
    reportJsonSha256: "",
    runSealSig: ""
  };
  return conformanceExportSchema.parse(run);
}

/** Hashes the canonical run with empty seal fields and signs it — the shared seal discipline of reportSeal.ts. */
export function sealConformanceRun(run: ConformanceExport, sign: (hashHex: string) => string): ConformanceExport {
  const base: ConformanceExport = { ...run, reportJsonSha256: "", runSealSig: "" };
  const hash = sha256Hex(canonicalize(base));
  return { ...base, reportJsonSha256: hash, runSealSig: sign(hash) };
}

interface LoadedAssuranceEvidence {
  accepted: AssuranceReport[];
  refused: ConformanceRefusedInput[];
}

function eventsBelongToSession(ledger: Ledger, report: AssuranceReport): string | null {
  for (const pack of report.packResults) {
    for (const scenario of pack.scenarioResults) {
      if (scenario.inconclusive === true) continue;
      for (const eventId of scenario.evidenceEventIds) {
        const event = ledger.getEventById(eventId);
        if (!event) return `ledger event ${eventId} (scenario ${pack.packId}/${scenario.scenarioId}) not found in the ledger`;
        if (event.session_id !== report.sessionId) {
          return `ledger event ${eventId} belongs to session ${event.session_id}, not the run's session ${report.sessionId ?? ""}`;
        }
      }
    }
  }
  return null;
}

/**
 * Loads the agent's assurance reports as conformance evidence. A report is
 * accepted only when its seal verifies against the workspace auditor keys,
 * it names a ledger session, and every measured scenario's event ids exist in
 * that session. Anything else is listed under refusedInputs with the reason.
 */
function loadAssuranceEvidence(params: {
  workspace: string;
  agentId: string;
  ledger: Ledger;
  maxEvidenceAgeMs?: number;
  nowTs: number;
}): LoadedAssuranceEvidence {
  const dir = join(getAgentPaths(params.workspace, params.agentId).reportsDir, "assurance");
  const accepted: AssuranceReport[] = [];
  const refused: ConformanceRefusedInput[] = [];
  if (!pathExists(dir)) return { accepted, refused };
  const files = readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => join(dir, file))
    .sort((a, b) => a.localeCompare(b));
  for (const file of files) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(readUtf8(file)) as Record<string, unknown>;
    } catch (error) {
      refused.push({ source: file, reason: `unreadable JSON: ${error instanceof Error ? error.message : String(error)}` });
      continue;
    }
    if (parsed.agentId !== params.agentId) continue;
    if (!sealedRunReportVerifies(params.workspace, parsed)) {
      refused.push({ source: file, reason: "seal did not verify against the workspace auditor keys (hash or signature)" });
      continue;
    }
    const report = parsed as unknown as AssuranceReport;
    try {
      assertAssuranceReportProvenance(report);
    } catch (error) {
      refused.push({ source: file, reason: error instanceof Error ? error.message : String(error) });
      continue;
    }
    if (params.maxEvidenceAgeMs !== undefined && report.ts < params.nowTs - params.maxEvidenceAgeMs) {
      refused.push({ source: file, reason: `assurance run ${report.assuranceRunId} is older than maxEvidenceAgeMs=${params.maxEvidenceAgeMs}` });
      continue;
    }
    const mismatch = eventsBelongToSession(params.ledger, report);
    if (mismatch !== null) {
      refused.push({ source: file, reason: mismatch });
      continue;
    }
    accepted.push(report);
  }
  return { accepted, refused };
}

export interface RunIndustryConformanceInput {
  workspace: string;
  agentId?: string;
  station: Domain;
  packResponses: PackResponseEvidence[];
  profile?: ConformanceStationProfile;
  sourceCommit?: string;
  nowTs?: number;
  /** When set, assurance runs older than this are refused as stale evidence. Off by default. */
  maxEvidenceAgeMs?: number;
}

export interface RunIndustryConformanceResult {
  run: ConformanceExport;
  jsonPath: string;
  markdownPath: string;
}

export function conformanceReportsDir(workspace: string, agentId: string): string {
  const dir = join(getAgentPaths(workspace, agentId).reportsDir, "conformance");
  ensureDir(dir);
  return dir;
}

/**
 * Runs a station conformance against a workspace: loads and verifies the
 * agent's assurance evidence, composes the requirements, seals the result with
 * the workspace auditor key and writes JSON + Markdown under
 * `reports/conformance/`.
 */
export function runIndustryConformance(input: RunIndustryConformanceInput): RunIndustryConformanceResult {
  const agentId = resolveAgentId(input.workspace, input.agentId);
  const nowTs = input.nowTs ?? Date.now();
  const ledger = openLedger(input.workspace);
  try {
    const evidence = loadAssuranceEvidence({
      workspace: input.workspace,
      agentId,
      ledger,
      maxEvidenceAgeMs: input.maxEvidenceAgeMs,
      nowTs
    });
    const unsealed = composeConformanceRun({
      station: input.station,
      agentId,
      packResponses: input.packResponses,
      assuranceReports: evidence.accepted,
      profile: input.profile,
      refusedInputs: evidence.refused,
      sourceCommit: input.sourceCommit,
      nowTs
    });
    const run = sealConformanceRun(unsealed, (hash) => ledger.signRunHash(hash));
    const dir = conformanceReportsDir(input.workspace, agentId);
    const jsonPath = join(dir, `${run.conformanceRunId}.json`);
    const markdownPath = join(dir, `${run.conformanceRunId}.md`);
    writeFileAtomic(jsonPath, renderConformanceJson(run), 0o644);
    writeFileAtomic(markdownPath, renderConformanceMarkdown(run), 0o644);
    return { run, jsonPath, markdownPath };
  } finally {
    ledger.close();
  }
}
