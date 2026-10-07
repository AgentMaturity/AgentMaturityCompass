import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { getPublicKeyHistory, verifyHexDigestAny } from "../crypto/keys.js";
import { parseWindowToMs } from "../utils/time.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { openLedger } from "../ledger/ledger.js";
import { resolveAgentId } from "../fleet/paths.js";
import type { ComplianceFramework } from "./frameworks.js";
import { defaultComplianceMapsFile } from "./builtInMappings.js";
import { signDigestWithPolicy, verifySignedDigest } from "../crypto/signing/signer.js";
import {
  complianceMapsSchema,
  type ComplianceCategoryResult,
  type ComplianceCategoryStatus,
  type ComplianceMapping,
  type ComplianceMapsFile,
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

interface SignedDigest {
  digestSha256: string;
  signature: string;
  signedTs: number;
  signer: "auditor";
  envelope?: {
    v: 1;
    alg: "ed25519";
    pubkeyB64: string;
    fingerprint: string;
    sigB64: string;
    signedTs: number;
    signer: {
      type: "VAULT" | "NOTARY";
      attestationLevel: "SOFTWARE" | "HARDWARE";
      notaryFingerprint?: string;
    };
  };
}

function complianceMapsPath(workspace: string): string {
  return join(workspace, ".amc", "compliance-maps.yaml");
}

function complianceMapsSigPath(workspace: string): string {
  return `${complianceMapsPath(workspace)}.sig`;
}

function signComplianceMapsDigest(workspace: string, digest: string): SignedDigest {
  const signed = signDigestWithPolicy({
    workspace,
    kind: "COMPLIANCE_MAPS",
    digestHex: digest
  });
  return {
    digestSha256: digest,
    signature: signed.signature,
    signedTs: signed.signedTs,
    signer: "auditor",
    envelope: signed.envelope
  };
}

function signComplianceMaps(workspace: string): string {
  const path = complianceMapsPath(workspace);
  if (!pathExists(path)) {
    throw new Error(`Compliance maps not found: ${path}`);
  }
  const digest = sha256Hex(readFileSync(path));
  const sigPath = complianceMapsSigPath(workspace);
  writeFileAtomic(sigPath, JSON.stringify(signComplianceMapsDigest(workspace, digest), null, 2), 0o644);
  return sigPath;
}

export function initComplianceMaps(workspace: string, file?: ComplianceMapsFile): {
  path: string;
  sigPath: string;
} {
  ensureDir(join(workspace, ".amc"));
  const path = complianceMapsPath(workspace);
  const payload = complianceMapsSchema.parse(file ?? defaultComplianceMapsFile());
  writeFileAtomic(path, YAML.stringify(payload), 0o644);
  return {
    path,
    sigPath: signComplianceMaps(workspace)
  };
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

export function verifyComplianceMapsSignature(workspace: string, explicitPath?: string): {
  valid: boolean;
  signatureExists: boolean;
  reason: string | null;
  path: string;
  sigPath: string;
} {
  const path = explicitPath ? resolve(workspace, explicitPath) : complianceMapsPath(workspace);
  const sigPath = `${path}.sig`;
  if (!pathExists(path)) {
    return { valid: false, signatureExists: false, reason: "compliance maps missing", path, sigPath };
  }
  if (!pathExists(sigPath)) {
    return { valid: false, signatureExists: false, reason: "compliance maps signature missing", path, sigPath };
  }
  try {
    const sig = z
      .object({
        digestSha256: z.string().length(64),
        signature: z.string().min(1),
        signedTs: z.number().int(),
        signer: z.literal("auditor"),
        envelope: z
          .object({
            v: z.literal(1),
            alg: z.literal("ed25519"),
            pubkeyB64: z.string().min(1),
            fingerprint: z.string().length(64),
            sigB64: z.string().min(1),
            signedTs: z.number().int(),
            signer: z.object({
              type: z.enum(["VAULT", "NOTARY"]),
              attestationLevel: z.enum(["SOFTWARE", "HARDWARE"]),
              notaryFingerprint: z.string().length(64).optional()
            })
          })
          .optional()
      })
      .parse(JSON.parse(readUtf8(sigPath)) as unknown);
    const digest = sha256Hex(readFileSync(path));
    if (digest !== sig.digestSha256) {
      return { valid: false, signatureExists: true, reason: "digest mismatch", path, sigPath };
    }
    const valid = verifySignedDigest({
      workspace,
      digestHex: digest,
      signed: {
        signature: sig.signature,
        envelope: sig.envelope
      }
    }) || verifyHexDigestAny(digest, sig.signature, getPublicKeyHistory(workspace, "auditor"));
    return {
      valid,
      signatureExists: true,
      reason: valid ? null : "signature verification failed",
      path,
      sigPath
    };
  } catch (error) {
    return {
      valid: false,
      signatureExists: true,
      reason: String(error),
      path,
      sigPath
    };
  }
}

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
    .filter((row) => row.result.dimensions.result === "fail" || row.result.dimensions.evidence !== "sufficient")
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

/** Unsigned or tampered maps decide nothing: every category is not evaluated on untrusted evidence. */
function untrustedMapping(mapping: ComplianceMapping, reason: string | null, now: number): ComplianceCategoryResult {
  const message = `Compliance maps signature invalid (${reason ?? "unknown"}); categories are not evaluated against untrusted maps.`;
  const claim = envelopeForUnverifiedResult({ producer: `compliance:${mapping.framework}:${mapping.id}`, recordCount: 0,
    regulated: true, signatureValid: false, now });
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
    neededToSatisfy: ["Run `amc compliance init` (or re-sign the maps), then `amc compliance verify`"]
  };
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
  const maps = loadComplianceMaps(workspace, params.mapsPath);
  const verify = verifyComplianceMapsSignature(workspace, params.mapsPath);
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
      chainError: monitorKeys === null ? "this workspace has no monitor key to verify its ledger" : ledgerChainError(chain, monitorKeys),
      monitorKeys: monitorKeys ?? [],
      reader,
      assurance: verifiedAssuranceByPack({ workspace, agentId, windowStartTs, windowEndTs })
    };
    const ctx = complianceContext({ workspaceId: source.workspaceId, agentId, windowStartTs, windowEndTs,
      producers: loadCatalog().producers });

    const categories = mappings.map((mapping) => verify.valid
      ? evaluateMapping(mapping, mapping.evidenceRequirements.map((requirement, index) =>
        evaluateMappingRequirement(mapping, requirement, index, source, ctx)), now)
      : untrustedMapping(mapping, verify.reason, now));

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
      coverage: coverageScore(categories),
      categories,
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
