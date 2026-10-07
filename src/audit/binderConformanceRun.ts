/**
 * Conformance runs in the audit binder (P1-16). A run file holds free text (requirement titles, reasons, refused
 * input paths) and raw identifiers (agent, sessions, answers), so a binder never copies it. It carries a projection
 * built field by field from an allowlist: ids that pass SAFE_ID, statuses, claim kinds, the five status dimensions as
 * states, counts, digests and times. Agent, session, answer and assurance-run ids are hashed with the binder's own
 * identifier hashing (hashAuditId and the policy's hashTruncBytes), and the projection must pass the binder's PII
 * scan. A field added to the run later reaches no binder until it is added here.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { ClaimKind, EvidenceState, ResultState, ReviewState, StatusDimensions } from "../claims/eligibility/types.js";
import {
  verifyConformanceExport, type ConformanceCounts, type ConformanceExport, type ConformanceRequirementKind,
  type ConformanceRequirementStatus, type ConformanceStatus
} from "../domains/conformance/index.js";
import { getAgentPaths } from "../fleet/paths.js";
import { loadTrustContext, type TrustContext } from "../trust/index.js";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { hashAuditId, scanBinderForPii } from "./binderRedaction.js";

export const NO_VERIFIED_CONFORMANCE_RUN = "no verified conformance run";

/** An id a binder may carry as is: no whitespace, slash, `@` or `|`, so never a path, URL, address or free text. */
const SAFE_ID = /^[A-Za-z0-9._:-]{1,200}$/;
const GIT_SHA = /^[0-9a-f]{40}$/;

interface ProjectedDimensions {
  applicability: StatusDimensions["applicability"]["state"];
  evidence: EvidenceState;
  result: ResultState;
  enforcement: StatusDimensions["enforcement"]["state"];
  review: ReviewState;
}

export interface BinderConformanceProjection {
  schema: "amc.binder-conformance-run/1";
  conformanceRunId: string;
  station: string;
  agentIdHash: string;
  generatedTs: number;
  sourceCommit: string;
  status: ConformanceStatus;
  counts: ConformanceCounts;
  claimKind: ClaimKind;
  dimensions: ProjectedDimensions;
  freshness: { nowTs: number; maxEvidenceAgeMs: number };
  inputs: { assuranceRuns: number; packResponses: number; refused: number };
  reportJsonSha256: string;
  requirements: Array<{
    id: string;
    kind: ConformanceRequirementKind;
    status: ConformanceRequirementStatus;
    claimKind: ClaimKind;
    dimensions: ProjectedDimensions;
    evidence: Array<{ kind: string; ref: string }>;
  }>;
}

export interface BinderConformanceRun {
  /** sections.conformanceRun of binder.json, which the binder signature covers. */
  section: {
    status: ConformanceStatus | null;
    conformanceRunId: string | null;
    station: string | null;
    counts: ConformanceCounts | null;
    reportJsonSha256: string | null;
    checkSha256: string | null;
    summarySha256: string | null;
    notes: string[];
  };
  /** The exact bytes of checks/conformance-run.json and summaries/conformance-run.md; their digests are in `section`. */
  files: { json: string; markdown: string } | null;
}

function dimensions(s: StatusDimensions): ProjectedDimensions {
  return { applicability: s.applicability.state, evidence: s.evidence, result: s.result, enforcement: s.enforcement.state, review: s.review };
}

export function projectConformanceRun(run: ConformanceExport, hashTruncBytes: number): BinderConformanceProjection {
  const hashed = (value: string): string => `hash:${hashAuditId(value, hashTruncBytes)}`;
  const safeId = (value: string): string => (SAFE_ID.test(value) ? value : hashed(value));
  return {
    schema: "amc.binder-conformance-run/1",
    conformanceRunId: safeId(run.conformanceRunId),
    station: run.station,
    agentIdHash: hashAuditId(run.agentId, hashTruncBytes),
    generatedTs: run.generatedTs,
    sourceCommit: GIT_SHA.test(run.sourceCommit) ? run.sourceCommit : "unknown",
    status: run.status,
    counts: { total: run.counts.total, pass: run.counts.pass, fail: run.counts.fail, notEvaluated: run.counts.notEvaluated },
    claimKind: run.claimKind,
    dimensions: dimensions(run.statusDimensions),
    freshness: { nowTs: run.freshness.nowTs, maxEvidenceAgeMs: run.freshness.maxEvidenceAgeMs },
    inputs: { assuranceRuns: run.inputs.assuranceRuns.length, packResponses: run.inputs.packResponseCount, refused: run.refusedInputs.length },
    reportJsonSha256: run.reportJsonSha256,
    requirements: run.requirements.map((row) => ({
      id: safeId(row.id),
      kind: row.kind,
      status: row.status,
      claimKind: row.claimKind,
      dimensions: dimensions(row.statusDimensions),
      // Event ids point into the ledger; session, answer and assurance-run ids are hashed like the binder's scope id.
      evidence: row.evidence.map((ref) => ({ kind: ref.kind, ref: ref.kind === "ledger-event" ? safeId(ref.id) : hashed(`${ref.kind}:${ref.id}`) }))
    }))
  };
}

export function renderBinderConformanceJson(projection: BinderConformanceProjection): string {
  return `${canonicalize(projection)}\n`;
}

export function renderBinderConformanceMarkdown(p: BinderConformanceProjection): string {
  return [
    "# AMC Conformance Run (binder copy)",
    "",
    "_Evidence of conformity within the station's derived requirement set. Allowlisted fields only; identifiers hashed as in binder.json._",
    "",
    `- Conformance Run ID: \`${p.conformanceRunId}\``,
    `- Station: \`${p.station}\``,
    `- Agent (hashed): \`${p.agentIdHash}\``,
    `- Generated: \`${new Date(p.generatedTs).toISOString()}\``,
    `- Status: **${p.status}**`,
    `- Requirements: ${p.counts.total} total — PASS ${p.counts.pass}, FAIL ${p.counts.fail}, NOT_EVALUATED ${p.counts.notEvaluated}`,
    `- Claim kind: ${p.claimKind}; applicability: ${p.dimensions.applicability}; result: ${p.dimensions.result}`,
    `- Maximum evidence age: ${p.freshness.maxEvidenceAgeMs} ms before \`${new Date(p.freshness.nowTs).toISOString()}\``,
    `- Inputs: ${p.inputs.assuranceRuns} assurance runs and ${p.inputs.packResponses} answers accepted, ${p.inputs.refused} refused`,
    `- Source commit: \`${p.sourceCommit}\``,
    `- Run seal digest: \`${p.reportJsonSha256}\``,
    "",
    "## Requirements",
    "| Requirement | Status | Claim | Result | Evidence refs |",
    "|---|---|---|---|---|",
    ...p.requirements.map((row) => `| \`${row.id}\` | ${row.status} | ${row.claimKind} | ${row.dimensions.result} | ${row.evidence.length} |`),
    ""
  ].join("\n");
}

/**
 * The conformanceRun section and files for one agent. Each run file under the agent's reports/conformance/ is read
 * once and verified under `trust` (default: the operator's pinned trust, P0-09); the newest one is projected,
 * scanned and rendered once, and the section records the digests of the bytes the binder writes. Fails closed: no
 * agent scope, no run, a trust context that cannot load, any run file that does not verify, or a projection that
 * fails the PII scan gives status null and "no verified conformance run", and no files. Notes never carry error
 * text, which can name local paths.
 */
export function binderConformanceRun(workspace: string, agentId: string | null, hashTruncBytes: number, trust?: TrustContext): BinderConformanceRun {
  const none = (...notes: string[]): BinderConformanceRun => ({ files: null, section: { status: null, conformanceRunId: null,
    station: null, counts: null, reportJsonSha256: null, checkSha256: null, summarySha256: null, notes: [NO_VERIFIED_CONFORMANCE_RUN, ...notes] } });
  if (agentId === null) return none("conformance runs are agent-scoped and this binder's scope is not an agent");
  const dir = join(getAgentPaths(workspace, agentId).reportsDir, "conformance");
  if (!pathExists(dir)) return none();
  let context: TrustContext;
  try {
    context = trust ?? loadTrustContext();
  } catch {
    return none("the operator's pinned trust could not be loaded");
  }
  const verified: ConformanceExport[] = [];
  let failed = 0;
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".json"))) {
    let candidate: unknown;
    try {
      candidate = JSON.parse(readUtf8(join(dir, file))) as unknown;
    } catch {
      failed += 1;
      continue;
    }
    const result = verifyConformanceExport(candidate, { workspace, trust: context });
    if (result.ok && result.run?.agentId === agentId) verified.push(result.run);
    else failed += 1;
  }
  if (failed > 0) return none(`${failed} conformance run file(s) did not verify under pinned trust`);
  const run = verified.sort((a, b) => b.generatedTs - a.generatedTs)[0];
  if (!run) return none();
  const projection = projectConformanceRun(run, hashTruncBytes);
  if (scanBinderForPii(projection).status !== "PASS") return none("the conformance run did not pass the binder's PII scan");
  const files = { json: renderBinderConformanceJson(projection), markdown: renderBinderConformanceMarkdown(projection) };
  return { files, section: { status: projection.status, conformanceRunId: projection.conformanceRunId, station: projection.station,
    counts: projection.counts, reportJsonSha256: projection.reportJsonSha256, checkSha256: sha256Hex(files.json),
    summarySha256: sha256Hex(files.markdown), notes: [`weakest claim kind: ${projection.claimKind}`] } };
}
