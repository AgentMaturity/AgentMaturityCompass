import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { getPublicKeyHistory, verifyHexDigestAny } from "../crypto/keys.js";
import { latestAssuranceByPack } from "../assurance/assuranceRunner.js";
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
  type ComplianceMapsFile,
  type ComplianceReportJson
} from "./mappingSchema.js";
import { coverageScore } from "./coverageScorer.js";

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

const trustTierSchema = z.enum(["OBSERVED", "OBSERVED_HARDENED", "ATTESTED", "SELF_REPORTED"]);

function inferTrustTier(event: EvidenceEvent, meta: Record<string, unknown>): "OBSERVED" | "ATTESTED" | "SELF_REPORTED" {
  if (typeof meta.trustTier === "string") {
    const parsed = trustTierSchema.safeParse(meta.trustTier);
    if (parsed.success) {
      if (parsed.data === "SELF_REPORTED") return "SELF_REPORTED";
      if (parsed.data === "ATTESTED") return "ATTESTED";
      return "OBSERVED";
    }
  }
  if (event.event_type === "review") {
    return "SELF_REPORTED";
  }
  return "OBSERVED";
}

function parseMeta(event: EvidenceEvent): Record<string, unknown> {
  try {
    return JSON.parse(event.meta_json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function parseAuditType(event: EvidenceEvent): string | null {
  if (event.event_type !== "audit") {
    return null;
  }
  try {
    const parsed = event.payload_inline ? (JSON.parse(event.payload_inline) as Record<string, unknown>) : {};
    if (typeof parsed.auditType === "string" && parsed.auditType.length > 0) {
      return parsed.auditType;
    }
  } catch {
    // ignore parse error
  }
  const meta = parseMeta(event);
  return typeof meta.auditType === "string" ? meta.auditType : null;
}

export function complianceMapsPath(workspace: string): string {
  return join(workspace, ".amc", "compliance-maps.yaml");
}

export function complianceMapsSigPath(workspace: string): string {
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

export function signComplianceMaps(workspace: string): string {
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

function evaluateRequirement(params: {
  requirement: ComplianceEvidenceRequirement;
  events: EvidenceEvent[];
  assuranceByPack: Map<string, { score0to100: number; scenarioResults: Array<{ auditEventTypes: string[] }> }>;
}): {
  pass: boolean;
  reason: string;
  refs: ComplianceCategoryResult["evidenceRefs"];
  needed: string;
} {
  const refs: ComplianceCategoryResult["evidenceRefs"] = [];
  switch (params.requirement.type) {
    case "requires_evidence_event": {
      const requirement = params.requirement;
      const typed = params.events.filter((event) => requirement.eventTypes.includes(event.event_type));
    for (const event of typed.slice(0, 12)) {
      refs.push({
        eventId: event.id,
        eventHash: event.event_hash,
        eventType: event.event_type
      });
    }
    if (typed.length === 0) {
      return {
        pass: false,
        reason: `No evidence events found for types: ${requirement.eventTypes.join(", ")}`,
        refs,
        needed: `Capture ${requirement.eventTypes.join(", ")} events with OBSERVED trust tier`
      };
    }
    const observed = typed.filter((event) => {
      const meta = parseMeta(event);
      const tier = inferTrustTier(event, meta);
      return tier === "OBSERVED";
    }).length;
    const ratio = observed / Math.max(1, typed.length);
      if (ratio < requirement.minObservedRatio) {
      return {
        pass: false,
        reason: `Observed trust ratio ${ratio.toFixed(3)} is below required ${requirement.minObservedRatio.toFixed(3)}`,
        refs,
        needed: `Increase OBSERVED evidence ratio to at least ${requirement.minObservedRatio.toFixed(2)}`
      };
    }
    return {
      pass: true,
      reason: `Found ${typed.length} matching events with observed ratio ${ratio.toFixed(3)}`,
      refs,
      needed: "No additional evidence required for this requirement"
    };
    }

    case "requires_assurance_pack": {
      const requirement = params.requirement;
      const pack = params.assuranceByPack.get(requirement.packId);
      if (!pack) {
        return {
          pass: false,
          reason: `Assurance pack '${requirement.packId}' not found in window`,
          refs,
          needed: `Run assurance pack '${requirement.packId}' with score >= ${requirement.minScore}`
        };
      }
      const succeededCount = pack.scenarioResults.reduce(
        (sum, scenario) => sum + scenario.auditEventTypes.filter((type) => type.endsWith("_SUCCEEDED")).length,
        0
      );
      const pass = pack.score0to100 >= requirement.minScore && succeededCount <= requirement.maxSucceeded;
      return {
        pass,
        reason: pass
          ? `Assurance pack '${requirement.packId}' score ${pack.score0to100} meets threshold`
          : `Assurance pack '${requirement.packId}' score ${pack.score0to100} / succeeded events ${succeededCount} does not meet threshold`,
        refs,
        needed: `Improve '${requirement.packId}' score to >= ${requirement.minScore} and keep *_SUCCEEDED <= ${requirement.maxSucceeded}`
      };
    }

    case "requires_no_audit": {
      const requirement = params.requirement;
      const violatingEvents = params.events
        .filter((event) => event.event_type === "audit")
        .filter((event) => {
          const auditType = parseAuditType(event);
          return auditType ? requirement.auditTypesDenylist.includes(auditType) : false;
        });
      for (const event of violatingEvents.slice(0, 12)) {
        refs.push({
          eventId: event.id,
          eventHash: event.event_hash,
          eventType: event.event_type
        });
      }
      if (violatingEvents.length > 0) {
        return {
          pass: false,
          reason: `Found denied audit events: ${requirement.auditTypesDenylist.join(", ")}`,
          refs,
          needed: `Resolve and eliminate audit events: ${requirement.auditTypesDenylist.join(", ")}`
        };
      }
      return {
        pass: true,
        reason: "No denied audit events found",
        refs,
        needed: "No additional evidence required for this requirement"
      };
    }
  }
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
    const events = ledger.getEventsBetween(windowStartTs, windowEndTs).filter((event) => {
      const meta = parseMeta(event);
      const metaAgent = typeof meta.agentId === "string" ? meta.agentId : "default";
      return metaAgent === agentId || event.session_id === "system";
    });

    const assuranceByPack = latestAssuranceByPack({
      workspace,
      agentId,
      windowStartTs,
      windowEndTs
    });

    const categories: ComplianceCategoryResult[] = [];
    for (const mapping of mappings) {
      const reasons: string[] = [];
      const evidenceRefs: ComplianceCategoryResult["evidenceRefs"] = [];
      const needed: string[] = [];
      let passCount = 0;
      for (const requirement of mapping.evidenceRequirements) {
        const evaluated = evaluateRequirement({
          requirement,
          events,
          assuranceByPack: assuranceByPack as unknown as Map<
            string,
            { score0to100: number; scenarioResults: Array<{ auditEventTypes: string[] }> }
          >
        });
        reasons.push(evaluated.reason);
        evidenceRefs.push(...evaluated.refs);
        needed.push(evaluated.needed);
        if (evaluated.pass) {
          passCount += 1;
        }
      }

      let status: ComplianceCategoryResult["status"] = "UNKNOWN";
      if (mapping.evidenceRequirements.length > 0) {
        if (passCount === mapping.evidenceRequirements.length) {
          status = "SATISFIED";
        } else if (passCount === 0) {
          status = evidenceRefs.length === 0 ? "MISSING" : "PARTIAL";
        } else {
          status = "PARTIAL";
        }
      }
      if (!verify.valid && status === "SATISFIED") {
        status = "PARTIAL";
        reasons.push("Compliance maps signature invalid; green status is downgraded to PARTIAL.");
      }
      categories.push({
        id: mapping.id,
        framework: mapping.framework,
        category: mapping.category,
        description: mapping.description,
        status,
        reasons: [...new Set(reasons)],
        evidenceRefs: evidenceRefs.slice(0, 24),
        neededToSatisfy: [...new Set(needed)]
      });
    }

    const trustCounts = {
      observed: 0,
      attested: 0,
      selfReported: 0
    };
    for (const event of events) {
      const tier = inferTrustTier(event, parseMeta(event));
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
        "Controls not represented in verified AMC evidence are marked as UNKNOWN/MISSING.",
        "Owner attestations must be explicitly signed and are not inferred automatically."
      ]
    };
  } finally {
    ledger.close();
  }
}
