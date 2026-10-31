import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import YAML from "yaml";
import { getPublicKeyHistory } from "../crypto/keys.js";
import { parseWindowToMs } from "../utils/time.js";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { openLedger } from "../ledger/ledger.js";
import { resolveAgentId } from "../fleet/paths.js";
import { descopedReason, familyReview, type ComplianceFramework } from "./frameworks.js";
import { defaultComplianceMapsFile } from "./builtInMappings.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { complianceMapsPath, publishComplianceMaps, publishComplianceMapsAsync, readComplianceMapsPair, type ComplianceMapsPublicationOptions } from "./complianceMapPublication.js";
import {
  complianceMapsSchema,
  type ComplianceCategoryResult,
  type ComplianceCategoryStatus,
  type ComplianceMapping,
  type ComplianceMapsFile,
  type ComplianceMapsFileInput,
  type ComplianceReportJson
} from "./mappingSchema.js";
import { coverageScore } from "./coverageScorer.js";
import { countAttestedOnce, effectiveTrustTier, evidenceProducer, readerTrustFor } from "../claims/evidenceProvenance.js";
import type { ClaimEnvelope, ResultState } from "../claims/eligibility/types.js";
import { envelopeForAggregate, envelopeForUnverifiedResult } from "../claims/eligibility/adapters/results.js";
import { loadCatalog } from "../catalog/loader.js";
import type { ControlResult } from "../catalog/evidence/types.js";
import {
  complianceContext, evaluateMappingRequirement, ledgerChainError, type ComplianceEvidenceSource, type RequirementEvaluation
} from "../catalog/evidence/mappingAdapter.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";
import { subjectRole, verifiedAssuranceByPack } from "./evidenceBinding.js";
import { stationsForMapping } from "./stationTags.js";
import type { Station } from "../domains/stations.js";

/** Retained sync SDK API. Its checked signature is prepared before the first body replacement. */
export function initComplianceMaps(workspace: string, file?: ComplianceMapsFileInput): { path: string; sigPath: string } {
  return publishComplianceMaps(workspace, file);
}
/** Maintained initialized-workspace path; no provider work occurs under the short publication lock. */
export function initComplianceMapsAsync(workspace: string, file?: ComplianceMapsFileInput, options: ComplianceMapsPublicationOptions = {}): Promise<{ path: string; sigPath: string }> {
  return publishComplianceMapsAsync(workspace, file, options);
}

export function loadComplianceMaps(workspace: string, explicitPath?: string): ComplianceMapsFile {
  const path = explicitPath ? resolve(workspace, explicitPath) : complianceMapsPath(workspace);
  if (!pathExists(path)) {
    if (!explicitPath) {
      return defaultComplianceMapsFile();
    }
    throw new Error(`Compliance maps not found: ${path}`);
  }
  return complianceMapsSchema.parse(YAML.parse(readUtf8(path)) as unknown);
}

function verifyComplianceMapsBytes(workspace: string, path: string, body: Buffer | null, sidecar: Buffer | null): {
  valid: boolean; signatureExists: boolean; reason: string | null; path: string; sigPath: string;
} {
  const sigPath = `${path}.sig`;
  if (body === null) return { valid: false, signatureExists: false, reason: "compliance maps missing", path, sigPath };
  if (sidecar === null) return { valid: false, signatureExists: false, reason: "compliance maps signature missing", path, sigPath };
  return { ...verifyAuditorSignatureBytes(workspace, "COMPLIANCE_MAPS", body, sidecar), signatureExists: true, path, sigPath };
}
export function verifyComplianceMapsSignature(workspace: string, explicitPath?: string): ReturnType<typeof verifyComplianceMapsBytes> {
  const path = explicitPath ? resolve(workspace, explicitPath) : complianceMapsPath(workspace);
  try { const pair = readComplianceMapsPair(path); return verifyComplianceMapsBytes(workspace, path, pair.body?.bytes ?? null, pair.sidecar?.bytes ?? null); }
  catch { return { valid: false, signatureExists: pathExists(`${path}.sig`), reason: "invalid compliance maps signature", path, sigPath: `${path}.sig` }; }
}

export { ComplianceMapsPublicationError } from "./complianceMapPublication.js";

const STATUS_BY_RESULT: Readonly<Record<ResultState, ComplianceCategoryStatus>> = {
  pass: "SATISFIED", fail: "MISSING", not_evaluated: "NOT_EVALUATED"
};
const LIST_CAP = 24;
const APPLICABILITY_NEEDED = "A compiled plan must record that this control applies before it can pass";

function envelopeOf(producer: string, result: ControlResult): ClaimEnvelope {
  return { claimKind: result.claimKind, statusDimensions: result.dimensions,
    provenance: { producer, method: "runtime_observation", evidenceRefs: result.admitted.map((row) => row.ref.id) },
    eligibleLevel: null, reasons: result.claimReasons };
}

/**
 * A category from its requirements' control results (P1-11): fail when any requirement fails, pass only when every one
 * passes, the weakest claim kind and the worst evidence (envelopeForAggregate). `status` is derived from the result for
 * one more minor release and is never PARTIAL.
 */
function evaluateMapping(mapping: ComplianceMapping, evaluations: RequirementEvaluation[], now: number): ComplianceCategoryResult {
  const producer = `compliance:${mapping.framework}:${mapping.id}`;
  const claim = envelopeForAggregate(producer, evaluations.map((row) => envelopeOf(producer, row.result)), now);
  const dimensions = claim.statusDimensions;
  const reasons = [...new Set(evaluations.flatMap((row) => [...row.notes, ...row.result.reasons]))];
  const needed = evaluations
    .filter((row) => row.result.dimensions.result === "fail" || row.result.dimensions.evidence !== "sufficient"
      || (row.result.claimKind !== "observed" && row.result.claimKind !== "independently_reviewed"))
    .map((row) => row.needed);
  if (dimensions.applicability.state !== "applicable") needed.push(APPLICABILITY_NEEDED);
  return {
    id: mapping.id,
    framework: mapping.framework,
    category: mapping.category,
    description: mapping.description,
    status: STATUS_BY_RESULT[dimensions.result],
    result: dimensions.result,
    evidence: dimensions.evidence,
    dimensions,
    claimKind: claim.claimKind,
    claimReasons: claim.reasons,
    notEvaluatedReasons: dimensions.result === "not_evaluated" ? reasons : [],
    reasons,
    evidenceRefs: evaluations.flatMap((row) => row.refs).slice(0, LIST_CAP),
    admitted: evaluations.flatMap((row) => row.result.admitted).slice(0, LIST_CAP),
    rejected: evaluations.flatMap((row) => row.result.rejected).slice(0, LIST_CAP),
    neededToSatisfy: [...new Set(needed)]
  };
}

/** A category that was not evaluated for a reason outside its evidence: the claim, the message and what would fix it. */
function unevaluatedMapping(mapping: ComplianceMapping, claim: ClaimEnvelope, message: string, needed: string): ComplianceCategoryResult {
  return {
    id: mapping.id,
    framework: mapping.framework,
    category: mapping.category,
    description: mapping.description,
    status: "NOT_EVALUATED",
    result: "not_evaluated",
    evidence: claim.statusDimensions.evidence,
    dimensions: claim.statusDimensions,
    claimKind: claim.claimKind,
    claimReasons: claim.reasons,
    notEvaluatedReasons: [message],
    reasons: [message],
    evidenceRefs: [],
    admitted: [],
    rejected: [],
    neededToSatisfy: [needed]
  };
}

/** Unsigned or tampered maps decide nothing: every category is not evaluated on untrusted evidence. */
function untrustedMapping(mapping: ComplianceMapping, reason: string | null, now: number): ComplianceCategoryResult {
  const message = `Compliance maps signature invalid (${reason ?? "unknown"}); categories are not evaluated against untrusted maps.`;
  const claim = envelopeForUnverifiedResult({ producer: `compliance:${mapping.framework}:${mapping.id}`, recordCount: 0,
    regulated: true, signatureValid: false, now });
  return unevaluatedMapping(mapping, claim, message, "Run `amc compliance init` (or re-sign the maps), then `amc compliance verify`");
}

/** A descoped category (ISO/IEC 42005): no evidence is read for it and coverage leaves it out (P1-45). */
function descopedMapping(mapping: ComplianceMapping, reason: string, now: number): ComplianceCategoryResult {
  const claim = envelopeForUnverifiedResult({ producer: `compliance:${mapping.framework}:${mapping.id}`, recordCount: 0,
    regulated: true, applicability: { state: "unresolved", reason }, now });
  return { ...unevaluatedMapping(mapping, claim, reason, "A licensed copy of the standard and a named expert's review (D-08)"), descoped: reason };
}

function monitorKeysOf(workspace: string): string[] | null {
  try {
    return getPublicKeyHistory(workspace, "monitor");
  } catch {
    return null;
  }
}

export function generateComplianceReport(params: {
  workspace: string;
  trust?: import("../trust/trustContext.js").TrustContext;
  agentId?: string;
  window: string;
  framework: ComplianceFramework;
  /** Keep only mappings whose stations include this one; the kept categories are evaluated exactly as without it. */
  station?: Station;
  mapsPath?: string;
}): ComplianceReportJson {
  const workspace = params.workspace;
  const agentId = resolveAgentId(workspace, params.agentId);
  const now = Date.now();
  const windowMs = parseWindowToMs(params.window);
  const windowStartTs = now - windowMs;
  const windowEndTs = now;
  const path = params.mapsPath ? resolve(workspace, params.mapsPath) : complianceMapsPath(workspace);
  const body = pathExists(path) ? readFileSync(path) : null;
  if (body === null && params.mapsPath) throw new Error(`Compliance maps not found: ${path}`);
  const maps = body === null ? defaultComplianceMapsFile() : complianceMapsSchema.parse(YAML.parse(body.toString("utf8")) as unknown);
  let sidecar: Buffer | null = null, invalidSidecar = false;
  try { if (pathExists(`${path}.sig`)) sidecar = readFileSync(`${path}.sig`); } catch { invalidSidecar = true; }
  const verify = invalidSidecar ? { valid: false, reason: "invalid compliance maps signature" } : verifyComplianceMapsBytes(workspace, path, body, sidecar);
  const { station } = params;
  const mappings = maps.complianceMaps.mappings.filter((row) => row.framework === params.framework
    && (station === undefined || stationsForMapping(row).includes(station)));
  const ledger = openLedger(workspace);
  try {
    // One read of the whole chain: the rows a category counts are the rows whose chain was verified here.
    const chain = ledger.getAllEvents();
    const monitorKeys = monitorKeysOf(workspace);
    const reader = readerTrustFor(workspace);
    const source: ComplianceEvidenceSource = {
      workspaceId: workspaceIdFromDirectory(workspace),
      agentId,
      // Events that could matter to this subject at any scope; the evidence contracts decide how each counts.
      rows: chain.filter((event) => event.ts >= windowStartTs && event.ts <= windowEndTs
        && subjectRole(event, agentId, "workspace") !== "none"),
      chainError: monitorKeys === null ? "this workspace has no monitor key to verify its ledger" : ledgerChainError(chain, monitorKeys, { workspace, ledger, trust: params.trust }),
      monitorKeys: monitorKeys ?? [],
      reader,
      assurance: verifiedAssuranceByPack({ workspace, agentId, windowStartTs, windowEndTs })
    };
    const ctx = complianceContext({ workspaceId: source.workspaceId, agentId, windowStartTs, windowEndTs,
      producers: loadCatalog().producers });

    const categories = mappings.map((mapping) => {
      const descoped = descopedReason(mapping);
      if (descoped !== null) return descopedMapping(mapping, descoped, now);
      return verify.valid
        ? evaluateMapping(mapping, mapping.evidenceRequirements.map((requirement, index) =>
          evaluateMappingRequirement(mapping, requirement, index, source, ctx)), now)
        : untrustedMapping(mapping, verify.reason, now);
    });

    const trustCounts = {
      observed: 0,
      attested: 0,
      selfReported: 0
    };
    // Synthetic rows count for nothing, not even as SELF_REPORTED (P0-18); the workspace's own keys never attest, and an
    // attested event counts once, inside the window of its own time. A chain that does not verify vouches for no tier.
    const subjectRows = source.rows.filter((row) => subjectRole(row, agentId, "agent") === "positive" && evidenceProducer(row) !== "synthetic");
    const tiers = new Map(subjectRows.map((row) => [row, source.chainError ? "SELF_REPORTED" : effectiveTrustTier(row, reader)]));
    for (const event of countAttestedOnce(subjectRows, (row) => tiers.get(row), { startTs: windowStartTs, endTs: windowEndTs })) {
      const tier = tiers.get(event);
      if (tier === "OBSERVED" || tier === "OBSERVED_HARDENED") trustCounts.observed += 1;
      else if (tier === "ATTESTED") trustCounts.attested += 1;
      else trustCounts.selfReported += 1;
    }
    const total = Math.max(1, trustCounts.observed + trustCounts.attested + trustCounts.selfReported);
    const trustTierCoverage = {
      observed: Number((trustCounts.observed / total).toFixed(4)),
      attested: Number((trustCounts.attested / total).toFixed(4)),
      selfReported: Number((trustCounts.selfReported / total).toFixed(4))
    };

    return {
      reportId: randomUUID(),
      ts: now,
      workspace,
      framework: params.framework,
      ...(station === undefined ? {} : { station }),
      agentId,
      windowStartTs,
      windowEndTs,
      configTrusted: verify.valid,
      configReason: verify.valid ? null : verify.reason,
      trustTierCoverage,
      coverage: coverageScore(categories.filter((row) => row.descoped === undefined)),
      categories,
      familyReview: familyReview(params.framework),
      nonClaims: [
        "This report provides evidence-backed signals only; it is not legal advice.",
        "Controls without control-bound AMC runtime evidence in the window are NOT_EVALUATED; absence of evidence is never a pass.",
        "A category passes only when a compiled plan records that it applies; until then sufficient evidence is still not evaluated.",
        "Ledger evidence is verified against this workspace's own monitor key: a local audit trail, not a portable verdict.",
        "Owner attestations must be explicitly signed and are not inferred automatically."
      ]
    };
  } finally {
    ledger.close();
  }
}
