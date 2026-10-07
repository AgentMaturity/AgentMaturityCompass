/**
 * Which stored results AMC 1.x wrote, and the claim each is read under (P1-35). Pure: no clock, file or
 * environment. Readers use it before labelling a stored result, and `amc verify --relabel-legacy` uses it to
 * record relabels; both get the same answer. A legacy result is never observed or independently reviewed: 1.x
 * verifiers trusted keys shipped inside artifacts (G1) and operators chose trust tiers (G2), so its provenance
 * cannot be checked. See docs/migration/LEGACY_RESULTS.md.
 */
import { envelopeForLegacyResult } from "../../claims/eligibility/adapters.js";
import { isLegacyAmcVersion } from "../../claims/eligibility/adapters/results.js";
import { producerOfMeta } from "../../claims/evidenceProvenance.js";
import { CLAIM_KINDS, type ClaimEnvelope } from "../../claims/eligibility/types.js";
import type { AssuranceReport } from "../../types.js";
import { CURRENT_LEGACY_NOTICE, type LegacyClaimKind } from "./notices.js";

export type LegacyArtifactKind = "ledger_session" | "diagnostic_report" | "assurance_report" | "assurance_certificate"
  | "trust_certificate" | "passport" | "bundle" | "domain_report" | "compliance_report";

export const LEGACY_ARTIFACT_KINDS: readonly LegacyArtifactKind[] = ["ledger_session", "diagnostic_report", "assurance_report",
  "assurance_certificate", "trust_certificate", "passport", "bundle", "domain_report", "compliance_report"];

/** The 1.x claims, verbatim. */
export interface LegacyOriginal { trustTier: string | null; level: string | null; label: string | null }

export interface LegacyClassification {
  rule: string;
  claimKind: LegacyClaimKind;
  levelCap: "L1" | null;
  original: LegacyOriginal;
  noticeId: string;
  noticeVersion: number;
}

/** A ledger session as the classifier reads it: its row and its events' meta, in ledger order. */
export interface LedgerSessionInput {
  binaryPath: string;
  events: ReadonlyArray<{ meta_json: string }>;
}

type Parsed = Record<string, unknown>;
const record = (value: unknown): Parsed | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Parsed : null;

/** A result that already carries P0-08's claim kind and dimensions decided its own claim. */
function hasClaimEnvelope(parsed: unknown): boolean {
  const value = record(parsed);
  return !!value && CLAIM_KINDS.includes(value.claimKind as never) && record(value.statusDimensions) !== null;
}

function classification(rule: string, claimKind: LegacyClaimKind, original: Partial<LegacyOriginal>,
  levelCap: "L1" | null = null): LegacyClassification {
  return {
    rule, claimKind, levelCap,
    original: { trustTier: original.trustTier ?? null, level: original.level ?? null, label: original.label ?? null },
    noticeId: CURRENT_LEGACY_NOTICE.id, noticeVersion: CURRENT_LEGACY_NOTICE.version
  };
}

const text = (value: unknown): string | null => typeof value === "string" ? value : null;
const STRONG_TIERS = ["OBSERVED_HARDENED", "OBSERVED", "ATTESTED"];

function classifySession(session: LedgerSessionInput): LegacyClassification | null {
  const metas = session.events.map((event) => {
    try {
      return record(JSON.parse(event.meta_json)) ?? {};
    } catch {
      return {};
    }
  });
  // R2: 1.1.1 seeded dogfood rows as OBSERVED; since P0-15 every seeded row carries claimKind synthetic_example.
  const seeded = (meta: Parsed) => meta.provenance === "dogfood" || meta.source === "dogfood-maturity";
  const dogfood = session.binaryPath === "amc-dogfood-agent" || metas.some(seeded);
  const unmarked = metas.filter((meta) => meta.claimKind === undefined);
  if (dogfood && unmarked.length > 0) {
    return classification("R2-dogfood-seeded", "synthetic_example", { trustTier: text(unmarked.find(seeded)?.trustTier) });
  }
  // R4: an import, manual or external row whose stored tier says AMC observed it, or that a third party attested it
  // without carrying the attestation (1.x let the operator choose; 1.2 writes SELF_REPORTED or a bound attestation).
  const overclaimed = metas.filter((meta) => {
    const producer = producerOfMeta(meta);
    if (producer === "amc-runtime" || producer === "synthetic") return false;
    if (meta.trustTier === "ATTESTED") return typeof record(meta.attestation)?.keyId !== "string";
    return meta.trustTier === "OBSERVED" || meta.trustTier === "OBSERVED_HARDENED";
  }).map((meta) => meta.trustTier as string);
  if (overclaimed.length === 0) return null;
  return classification("R4-operator-tier", "self_reported", { trustTier: STRONG_TIERS.find((tier) => overclaimed.includes(tier)) ?? null });
}

function meanLevel(run: Parsed): string | null {
  const layers = Array.isArray(run.layerScores) ? run.layerScores as Array<{ avgFinalLevel?: unknown }> : [];
  const levels = layers.map((layer) => layer.avgFinalLevel).filter((level): level is number => typeof level === "number");
  return levels.length === 0 ? null : `L${Number((levels.reduce((a, b) => a + b, 0) / levels.length).toFixed(2))}`;
}

/** R5 for a diagnostic run: P0-22's detector decides, an AMC version missing or below 1.2.0. */
function classifyRun(run: Parsed): LegacyClassification | null {
  const version = text(record(run.methodology)?.amcVersion);
  if (!Array.isArray(run.layerScores) || !isLegacyAmcVersion(version)) return null;
  return classification("R5-no-claim-envelope", "self_reported", { level: meanLevel(run), label: text(run.trustLabel) }, "L1");
}

// Matches the 1.x domain-report line computed from generated scores (G3); 1.2 never prints it.
const DOMAIN_READINESS_LINE = /^.*\bCertification Readiness\b.*$/m;

/**
 * The legacy claim of a stored result, or null when it is not a 1.x result. `parsed` is the parsed JSON; for a
 * bundle or a certificate it is the run the artifact carries, for a ledger session a LedgerSessionInput, and for a
 * domain report its text. Passports, assurance certificates and trust-certificate JSON record no AMC version and no
 * claim envelope, so nothing in them tells 1.x from 1.2: they get null here, and readers print them self-reported.
 */
export function classifyLegacyArtifact(kind: LegacyArtifactKind, parsed: unknown): LegacyClassification | null {
  if (kind === "domain_report") {
    const line = typeof parsed === "string" ? DOMAIN_READINESS_LINE.exec(parsed) : null;
    return line ? classification("R3-domain-report", "synthetic_example", { label: line[0].trim() }) : null;
  }
  if (kind === "ledger_session") return classifySession(parsed as LedgerSessionInput);
  const value = record(parsed);
  if (!value || hasClaimEnvelope(value)) return null;
  switch (kind) {
    case "assurance_report":
      // R1: AMC 1.x graded a canned reply for every scenario; fba5824e added evidenceStatus when it removed it.
      return typeof value.assuranceRunId === "string" && value.evidenceStatus === undefined
        ? classification("R1-assurance-canned-reply", "synthetic_example", { trustTier: text(value.trustTier), label: text(value.trustLabel) })
        : null;
    case "diagnostic_report":
    case "bundle":
    case "trust_certificate":
      return classifyRun(value);
    case "compliance_report": {
      // P0-17 added a result to every category; a report without one predates it.
      const categories = Array.isArray(value.categories) ? value.categories.map(record) : [];
      if (categories.length === 0 || categories.every((category) => category?.result !== undefined)) return null;
      return classification("R5-no-claim-envelope", "self_reported",
        { label: [...new Set(categories.map((category) => text(category?.status)).filter(Boolean))].join(", ") || null }, "L1");
    }
    default:
      return null;
  }
}

/**
 * A stored assurance report's claim: a 1.x report (R1) is a legacy synthetic example through P0-08's legacy adapter,
 * never a pass and never a level, whatever its seal says; any other report gets the caller's envelope.
 */
export function assuranceReportClaim(report: AssuranceReport, current: () => ClaimEnvelope, now: number): ClaimEnvelope {
  const found = classifyLegacyArtifact("assurance_report", report);
  if (!found) return current();
  return envelopeForLegacyResult({
    producer: `assurance:${report.assuranceRunId}`, version: "none",
    ...(found.original.trustTier ? { originalTier: found.original.trustTier } : {}),
    method: "synthetic", status: "NOT_EVALUATED", level: null, eventCount: 0, evidenceRefs: [report.assuranceRunId], now
  });
}
