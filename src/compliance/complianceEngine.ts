import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { getPublicKeyHistory, verifyHexDigestAny } from "../crypto/keys.js";
import type { EvidenceEvent } from "../types.js";
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
  type ComplianceEvidenceRequirement,
  type ComplianceMapping,
  type ComplianceMapsFile,
  type ComplianceReportJson
} from "./mappingSchema.js";
import { coverageScore } from "./coverageScorer.js";
import { countAttestedOnce, effectiveTrustTier, eventMeta, evidenceProducer, readerTrustFor, type ReaderTrust } from "../claims/evidenceProvenance.js";
import type { EvidenceState, ResultState } from "../claims/eligibility/types.js";
import { auditTypeOf, isBoundToControl, subjectRole, verifiedAssuranceByPack, type VerifiedAssurance } from "./evidenceBinding.js";

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

function inferTrustTier(
  event: EvidenceEvent, meta: Record<string, unknown>, reader: () => ReaderTrust = readerTrustFor()
): "OBSERVED" | "ATTESTED" | "SELF_REPORTED" {
  // P0-18: the tier comes from provenance; effectiveTrustTier reads the same cached parse as `meta`.
  const tier = effectiveTrustTier(event, reader);
  if (tier === "OBSERVED" || tier === "OBSERVED_HARDENED") return "OBSERVED";
  return tier === "ATTESTED" ? "ATTESTED" : "SELF_REPORTED";
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

type EvidenceRef = ComplianceCategoryResult["evidenceRefs"][number];

interface RequirementOutcome {
  outcome: ResultState;
  evidence: EvidenceState;
  reason: string;
  refs: EvidenceRef[];
  needed: string;
}

const NOTHING_NEEDED = "No additional evidence required for this requirement";

function refsOf(events: EvidenceEvent[]): EvidenceRef[] {
  return events.slice(0, 12).map((event) => ({ eventId: event.id, eventHash: event.event_hash, eventType: event.event_type }));
}

function evaluateEvidenceEvent(
  requirement: Extract<ComplianceEvidenceRequirement, { type: "requires_evidence_event" }>,
  mapping: ComplianceMapping,
  events: EvidenceEvent[],
  isPositive: (event: EvidenceEvent) => boolean
): RequirementOutcome {
  const types = requirement.eventTypes.join(", ");
  const needed = `Capture ${types} events bound to '${mapping.id}' (meta.controlIds) from AMC runtime with OBSERVED trust tier`;
  const bound = events.filter((event) =>
    requirement.eventTypes.includes(event.event_type) && isPositive(event) && isBoundToControl(event, mapping, requirement));
  const runtime = bound.filter((event) => evidenceProducer(event) === "amc-runtime");
  if (bound.length === 0) {
    return { outcome: "not_evaluated", evidence: "incomplete", reason: `no control-bound evidence for ${mapping.id} in window`, refs: [], needed };
  }
  if (runtime.length === 0) {
    const producers = [...new Set(bound.map((event) => evidenceProducer(event)))].join(", ");
    return {
      outcome: "not_evaluated",
      evidence: "untrusted",
      reason: `${bound.length} control-bound events for ${mapping.id} came only from non-runtime producers (${producers}) and are not admitted`,
      refs: refsOf(bound),
      needed
    };
  }
  const observed = runtime.filter((event) => inferTrustTier(event, eventMeta(event)) === "OBSERVED").length;
  const ratio = observed / runtime.length;
  if (ratio < requirement.minObservedRatio) {
    return {
      outcome: "not_evaluated",
      evidence: "untrusted",
      reason: `Observed trust ratio ${ratio.toFixed(3)} is below required ${requirement.minObservedRatio.toFixed(3)}`,
      refs: refsOf(runtime),
      needed: `Increase OBSERVED evidence ratio to at least ${requirement.minObservedRatio.toFixed(2)}`
    };
  }
  return {
    outcome: "pass",
    evidence: "sufficient",
    reason: `Found ${runtime.length} control-bound runtime events with observed ratio ${ratio.toFixed(3)}`,
    refs: refsOf(runtime),
    needed: NOTHING_NEEDED
  };
}

function evaluateAssurancePack(
  requirement: Extract<ComplianceEvidenceRequirement, { type: "requires_assurance_pack" }>,
  assurance: VerifiedAssurance
): RequirementOutcome {
  const needed = `Run assurance pack '${requirement.packId}' with score >= ${requirement.minScore} and *_SUCCEEDED <= ${requirement.maxSucceeded}`;
  const pack = assurance.packs.get(requirement.packId);
  if (!pack) {
    const forged = assurance.unverifiable.some((row) => row.packIds.includes(requirement.packId));
    return forged
      ? { outcome: "not_evaluated", evidence: "untrusted", reason: `Assurance report for '${requirement.packId}' failed hash, seal or run integrity verification`, refs: [], needed }
      : { outcome: "not_evaluated", evidence: "incomplete", reason: `No sealed assurance run for '${requirement.packId}' in window`, refs: [], needed };
  }
  // Truth rule 3: a keyword match is never a regulated result, pass or fail. Older reports carry no flag and count for nothing.
  if (pack.regulatedEligible !== true) {
    const method = pack.gradingMethod ?? "keyword";
    return { outcome: "not_evaluated", evidence: "untrusted", reason: `assurance pack ${requirement.packId} is ${method}-graded; keyword grading is not regulated evidence`, refs: [], needed };
  }
  // Inconclusive scenarios never reached the agent: a pack that measured nothing, or passed on part of its scenarios, proves nothing.
  const total = pack.scenarioResults.length;
  const inconclusive = pack.scenarioResults.filter((scenario) => scenario.inconclusive === true).length;
  if (inconclusive === total) {
    return { outcome: "not_evaluated", evidence: "incomplete", reason: `Assurance pack '${requirement.packId}' measured no scenario`, refs: [], needed };
  }
  const succeededCount = pack.scenarioResults.reduce(
    (sum, scenario) => sum + scenario.auditEventTypes.filter((type) => type.endsWith("_SUCCEEDED")).length,
    0
  );
  const pass = pack.score0to100 >= requirement.minScore && succeededCount <= requirement.maxSucceeded;
  if (pass && inconclusive > 0) {
    return {
      outcome: "not_evaluated",
      evidence: "incomplete",
      reason: `Assurance pack '${requirement.packId}': ${inconclusive} of ${total} scenarios inconclusive; a partial measurement cannot pass`,
      refs: [],
      needed
    };
  }
  return {
    outcome: pass ? "pass" : "fail",
    evidence: "sufficient",
    reason: pass
      ? `Assurance pack '${requirement.packId}' score ${pack.score0to100} meets threshold`
      : `Assurance pack '${requirement.packId}' score ${pack.score0to100} / succeeded events ${succeededCount} does not meet threshold`,
    refs: [],
    needed: pass ? NOTHING_NEEDED : needed
  };
}

function evaluateNoAudit(
  requirement: Extract<ComplianceEvidenceRequirement, { type: "requires_no_audit" }>,
  events: EvidenceEvent[],
  role: (event: EvidenceEvent) => ReturnType<typeof subjectRole>
): RequirementOutcome {
  const denied = requirement.auditTypesDenylist.join(", ");
  // Violations count from any producer and from the workspace system session: fail closed.
  const violating = events.filter((event) => {
    const auditType = auditTypeOf(event);
    return auditType !== null && role(event) !== "none" && requirement.auditTypesDenylist.includes(auditType);
  });
  if (violating.length > 0) {
    return {
      outcome: "fail",
      evidence: "sufficient",
      reason: `Found denied audit events: ${denied}`,
      refs: refsOf(violating),
      needed: `Resolve and eliminate audit events: ${denied}`
    };
  }
  const activity = events.filter((event) => role(event) === "positive" && evidenceProducer(event) === "amc-runtime");
  if (activity.length === 0) {
    return {
      outcome: "not_evaluated",
      evidence: "incomplete",
      reason: "no agent activity in window; absence of violations proves nothing",
      refs: [],
      needed: "Capture AMC runtime evidence for this agent in the window"
    };
  }
  return {
    outcome: "pass",
    evidence: "sufficient",
    reason: `No denied audit events found across ${activity.length} runtime events`,
    refs: [],
    needed: NOTHING_NEEDED
  };
}

function evaluateRequirement(params: {
  requirement: ComplianceEvidenceRequirement;
  mapping: ComplianceMapping;
  events: EvidenceEvent[];
  agentId: string;
  assurance: VerifiedAssurance;
}): RequirementOutcome {
  const scope = params.mapping.binding?.scope ?? "agent";
  const role = (event: EvidenceEvent) => subjectRole(event, params.agentId, scope);
  switch (params.requirement.type) {
    case "requires_evidence_event":
      return evaluateEvidenceEvent(params.requirement, params.mapping, params.events, (event) => role(event) === "positive");
    case "requires_assurance_pack":
      return evaluateAssurancePack(params.requirement, params.assurance);
    case "requires_no_audit":
      return evaluateNoAudit(params.requirement, params.events, role);
  }
}

const EVIDENCE_SEVERITY: EvidenceState[] = ["sufficient", "incomplete", "stale", "contradictory", "untrusted"];

function worstEvidence(states: EvidenceState[]): EvidenceState {
  return states.reduce<EvidenceState>(
    (worst, state) => (EVIDENCE_SEVERITY.indexOf(state) > EVIDENCE_SEVERITY.indexOf(worst) ? state : worst),
    "sufficient"
  );
}

/** Any fail is a failure (PARTIAL only when another requirement passed); SATISFIED only when every requirement passed. */
function evaluateMapping(
  mapping: ComplianceMapping,
  evaluate: (requirement: ComplianceEvidenceRequirement) => RequirementOutcome
): ComplianceCategoryResult {
  const outcomes = mapping.evidenceRequirements.map(evaluate);
  const failed = outcomes.some((row) => row.outcome === "fail");
  const notEvaluated = outcomes.filter((row) => row.outcome === "not_evaluated");
  let status: ComplianceCategoryResult["status"] = "NOT_EVALUATED";
  let result: ResultState = "not_evaluated";
  if (failed) {
    result = "fail";
    status = outcomes.some((row) => row.outcome === "pass") ? "PARTIAL" : "MISSING";
  } else if (outcomes.length > 0 && outcomes.every((row) => row.outcome === "pass")) {
    result = "pass";
    status = "SATISFIED";
  }
  return {
    id: mapping.id,
    framework: mapping.framework,
    category: mapping.category,
    description: mapping.description,
    status,
    result,
    evidence: worstEvidence(outcomes.map((row) => row.evidence)),
    notEvaluatedReasons: [...new Set(notEvaluated.map((row) => row.reason))],
    reasons: [...new Set(outcomes.map((row) => row.reason))],
    evidenceRefs: outcomes.flatMap((row) => row.refs).slice(0, 24),
    neededToSatisfy: [...new Set(outcomes.map((row) => row.needed))]
  };
}

/** Unsigned or tampered maps decide nothing: every category is not evaluated. */
function untrustedMapping(mapping: ComplianceMapping, reason: string | null): ComplianceCategoryResult {
  const message = `Compliance maps signature invalid (${reason ?? "unknown"}); categories are not evaluated against untrusted maps.`;
  return {
    id: mapping.id,
    framework: mapping.framework,
    category: mapping.category,
    description: mapping.description,
    status: "NOT_EVALUATED",
    result: "not_evaluated",
    evidence: "untrusted",
    notEvaluatedReasons: [message],
    reasons: [message],
    evidenceRefs: [],
    neededToSatisfy: ["Run `amc compliance init` (or re-sign the maps), then `amc compliance verify`"]
  };
}

export function generateComplianceReport(params: {
  workspace: string;
  agentId?: string;
  window: string;
  framework: ComplianceFramework;
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
  const mappings = maps.complianceMaps.mappings.filter((row) => row.framework === params.framework);
  const ledger = openLedger(workspace);
  try {
    // Events that could matter to this subject at any scope; evidenceBinding decides how each counts.
    const events = ledger.getEventsBetween(windowStartTs, windowEndTs)
      .filter((event) => subjectRole(event, agentId, "workspace") !== "none");
    const assurance = verifiedAssuranceByPack({ workspace, agentId, windowStartTs, windowEndTs });

    const categories = mappings.map((mapping) => verify.valid
      ? evaluateMapping(mapping, (requirement) => evaluateRequirement({ requirement, mapping, events, agentId, assurance }))
      : untrustedMapping(mapping, verify.reason));

    const trustCounts = {
      observed: 0,
      attested: 0,
      selfReported: 0
    };
    // Synthetic rows count for nothing, not even as SELF_REPORTED (P0-18); the workspace's own keys never attest, and an
    // attested event counts once, inside the window of its own time.
    const reader = readerTrustFor(workspace);
    const subjectRows = events.filter((row) => subjectRole(row, agentId, "agent") === "positive" && evidenceProducer(row) !== "synthetic");
    const tiers = new Map(subjectRows.map((row) => [row, inferTrustTier(row, eventMeta(row), reader)]));
    for (const event of countAttestedOnce(subjectRows, (row) => tiers.get(row), { startTs: windowStartTs, endTs: windowEndTs })) {
      const tier = tiers.get(event);
      if (tier === "OBSERVED") trustCounts.observed += 1;
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
        "Owner attestations must be explicitly signed and are not inferred automatically."
      ]
    };
  } finally {
    ledger.close();
  }
}
