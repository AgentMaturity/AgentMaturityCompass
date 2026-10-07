import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { AssuranceReport } from "../../types.js";
import { envelopeForAggregate, envelopeFromDimensions } from "../../claims/eligibility/adapters/results.js";
import { sealedRunReportVerifies } from "../../diagnostic/reportSeal.js";
import { getAgentPaths, resolveAgentId } from "../../fleet/paths.js";
import { openLedger, type Ledger } from "../../ledger/ledger.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../../utils/fs.js";
import { canonicalize } from "../../utils/json.js";
import { sha256Hex } from "../../utils/hash.js";
import type { Domain } from "../domainRegistry.js";
import {
  assertAssuranceReportProvenance,
  isFresh,
  resolvePackResponseEvidence,
  resolveRequirements,
  type EvidenceFreshness,
  type PackResponseEvidence,
  type PackResponseResolution
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
  /** Answers already admitted by resolvePackResponseEvidence. */
  packResponses: PackResponseEvidence[];
  /** Reports whose seal the caller has already verified; provenance is checked here. */
  assuranceReports: AssuranceReport[];
  profile?: ConformanceStationProfile;
  refusedInputs?: ConformanceRefusedInput[];
  sourceCommit?: string;
  /** The freshness the evidence was admitted under; its nowTs is the run's generatedTs. */
  freshness: EvidenceFreshness;
  conformanceRunId?: string;
}

/** Composes an unsealed run (seal fields empty) from already-loaded evidence. */
export function composeConformanceRun(input: ComposeConformanceInput): ConformanceExport {
  const specs = deriveStationRequirements(input.station, input.profile);
  const requirements = resolveRequirements({
    specs,
    packResponses: input.packResponses,
    assuranceReports: input.assuranceReports,
    nowTs: input.freshness.nowTs
  });
  const verdict = conformanceStatusFrom(requirements);
  // The run claims no more than its weakest requirement (envelopeForAggregate).
  const claim = envelopeForAggregate(`conformance:${input.station}`,
    requirements.map((row) => envelopeFromDimensions(row.id, row.claimKind, row.statusDimensions)), input.freshness.nowTs);
  const commit = resolveSourceCommit(input.sourceCommit);
  const run: ConformanceExport = {
    schema: "amc.conformance-run/1",
    conformanceRunId: input.conformanceRunId ?? randomUUID(),
    station: input.station,
    agentId: input.agentId,
    generatedTs: input.freshness.nowTs,
    sourceCommit: commit.sourceCommit,
    sourceCommitResolution: commit.resolution,
    environment: currentConformanceEnvironment(),
    profile: input.profile ? { id: input.profile.id, source: input.profile.source } : null,
    status: verdict.status,
    counts: verdict.counts,
    claimKind: claim.claimKind,
    statusDimensions: claim.statusDimensions,
    freshness: { nowTs: input.freshness.nowTs, maxEvidenceAgeMs: input.freshness.maxEvidenceAgeMs },
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

interface AdmittedInputs<T> {
  accepted: T[];
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
 * accepted only when its seal verifies against the workspace auditor keys (a
 * local audit trail), it names a ledger session, its ts is within the maximum
 * evidence age, and every measured scenario's event ids exist in that session.
 * Anything else is listed under refusedInputs, by workspace-relative path.
 */
function loadAssuranceEvidence(params: {
  workspace: string;
  agentId: string;
  ledger: Ledger;
  freshness: EvidenceFreshness;
}): AdmittedInputs<AssuranceReport> {
  const dir = join(getAgentPaths(params.workspace, params.agentId).reportsDir, "assurance");
  const accepted: AssuranceReport[] = [];
  const refused: ConformanceRefusedInput[] = [];
  if (!pathExists(dir)) return { accepted, refused };
  const files = readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => join(dir, file))
    .sort((a, b) => a.localeCompare(b));
  for (const file of files) {
    const source = relative(params.workspace, file);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(readUtf8(file)) as Record<string, unknown>;
    } catch (error) {
      refused.push({ source, reason: `unreadable JSON: ${error instanceof Error ? error.message : String(error)}` });
      continue;
    }
    if (parsed.agentId !== params.agentId) continue;
    if (!sealedRunReportVerifies(params.workspace, parsed)) {
      refused.push({ source, reason: "seal did not verify against the workspace auditor keys (hash or signature)" });
      continue;
    }
    const report = parsed as unknown as AssuranceReport;
    try {
      assertAssuranceReportProvenance(report);
    } catch (error) {
      refused.push({ source, reason: error instanceof Error ? error.message : String(error) });
      continue;
    }
    if (!isFresh(report.ts, params.freshness)) {
      refused.push({ source, reason: `assurance run ${report.assuranceRunId} is older than the maximum evidence age, or dated after this run` });
      continue;
    }
    const mismatch = eventsBelongToSession(params.ledger, report);
    if (mismatch !== null) {
      refused.push({ source, reason: mismatch });
      continue;
    }
    accepted.push(report);
  }
  return { accepted, refused };
}

/** Admits each answer through its ledger session (checked once per session); refusals keep the answer's position. */
function admitPackResponses(ledger: Ledger, responses: PackResponseEvidence[], freshness: EvidenceFreshness): AdmittedInputs<PackResponseEvidence> {
  const sessions = new Map<string, PackResponseResolution>();
  const accepted: PackResponseEvidence[] = [];
  const refused: ConformanceRefusedInput[] = [];
  responses.forEach((response, index) => {
    const resolution = resolvePackResponseEvidence(ledger, response, freshness, sessions);
    if (resolution.ok) accepted.push(response);
    else refused.push({ source: `responses[${index}]`, reason: resolution.reason });
  });
  return { accepted, refused };
}

export interface RunIndustryConformanceInput {
  workspace: string;
  agentId?: string;
  station: Domain;
  packResponses: PackResponseEvidence[];
  profile?: ConformanceStationProfile;
  sourceCommit?: string;
  /** Required and > 0, no default: evidence recorded longer ago than this, or after the run, is refused. */
  maxEvidenceAgeMs: number;
  /** Where the JSON and Markdown go; defaults to the agent's reports/conformance/. */
  outDir?: string;
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
 * Runs a station conformance check against a workspace: admits the agent's
 * assurance evidence and the questionnaire answers, composes the requirements,
 * seals the result with the workspace auditor key and writes JSON + Markdown.
 * The run's time is the server clock here, never a caller's value.
 */
export function runIndustryConformance(input: RunIndustryConformanceInput): RunIndustryConformanceResult {
  if (!Number.isSafeInteger(input.maxEvidenceAgeMs) || input.maxEvidenceAgeMs <= 0) {
    throw new Error("maxEvidenceAgeMs must be a positive whole number of milliseconds");
  }
  const agentId = resolveAgentId(input.workspace, input.agentId);
  const freshness: EvidenceFreshness = { nowTs: Date.now(), maxEvidenceAgeMs: input.maxEvidenceAgeMs };
  const ledger = openLedger(input.workspace);
  try {
    const assurance = loadAssuranceEvidence({ workspace: input.workspace, agentId, ledger, freshness });
    const answers = admitPackResponses(ledger, input.packResponses, freshness);
    const unsealed = composeConformanceRun({
      station: input.station,
      agentId,
      packResponses: answers.accepted,
      assuranceReports: assurance.accepted,
      profile: input.profile,
      refusedInputs: [...assurance.refused, ...answers.refused],
      sourceCommit: input.sourceCommit,
      freshness
    });
    const run = sealConformanceRun(unsealed, (hash) => ledger.signRunHash(hash));
    const dir = input.outDir ? resolve(input.outDir) : conformanceReportsDir(input.workspace, agentId);
    ensureDir(dir);
    const jsonPath = join(dir, `${run.conformanceRunId}.json`);
    const markdownPath = join(dir, `${run.conformanceRunId}.md`);
    writeFileAtomic(jsonPath, renderConformanceJson(run), 0o644);
    writeFileAtomic(markdownPath, renderConformanceMarkdown(run), 0o644);
    return { run, jsonPath, markdownPath };
  } finally {
    ledger.close();
  }
}
