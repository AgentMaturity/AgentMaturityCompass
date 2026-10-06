import { describe, expect, test } from "vitest";
import {
  evaluateClaimEligibility,
  renderClaimLabel,
  type ClaimEligibilityInput,
  type ClaimEnvelope,
  type ClaimKind,
  type ClaimMethod,
  type ClaimReasonCode,
  type EvidenceState,
  type ResultState
} from "../../src/claims/eligibility/index.js";

const NOW = Date.UTC(2026, 9, 5, 12, 0, 0);
const DAY = 86_400_000;

function input(overrides: Partial<ClaimEligibilityInput> = {}): ClaimEligibilityInput {
  return {
    producer: "test",
    method: "runtime_observation",
    regulated: false,
    proposed: { result: "pass", level: 3 },
    evidence: {
      eventCount: 12,
      tiers: ["OBSERVED"],
      newestTs: NOW - 1_000,
      maxAgeMs: DAY,
      boundToControl: true,
      sameScope: true,
      contradictory: false,
      signatureValid: true,
      issuerPinned: null
    },
    now: NOW,
    ...overrides
  };
}

function withEvidence(patch: Partial<ClaimEligibilityInput["evidence"]>, overrides: Partial<ClaimEligibilityInput> = {}) {
  const base = input(overrides);
  return { ...base, evidence: { ...base.evidence, ...patch } };
}

const applicable = { state: "applicable" } as const;

interface Row {
  name: string;
  input: ClaimEligibilityInput;
  kind?: ClaimKind;
  notKind?: ClaimKind;
  result?: ResultState;
  evidence?: EvidenceState;
  eligibleLevel?: number | null;
  reason?: ClaimReasonCode;
}

const rows: Row[] = [
  {
    name: "synthetic values, proposed pass L4",
    input: input({ method: "synthetic", proposed: { result: "pass", level: 4 } }),
    kind: "synthetic_example", result: "not_evaluated", eligibleLevel: null, reason: "SYNTHETIC_VALUES"
  },
  {
    name: "numeric self-answers all 5, regulated",
    input: withEvidence({ eventCount: 5, tiers: ["SELF_REPORTED"] },
      { method: "numeric_self_answer", regulated: true, applicability: applicable, proposed: { result: "pass", level: 5 } }),
    kind: "self_reported", result: "not_evaluated", eligibleLevel: 1, reason: "SELF_REPORTED_NO_POSITIVE_STATUS"
  },
  {
    name: "numeric self-answers, not regulated, proposed L3",
    input: withEvidence({ eventCount: 5, tiers: ["SELF_REPORTED"] }, { method: "numeric_self_answer" }),
    kind: "self_reported", result: "pass", eligibleLevel: 1, reason: "SELF_REPORTED_LEVEL_CAP"
  },
  {
    name: "runtime observation, 12 OBSERVED events, bound, fresh, regulated pass L3",
    input: input({ regulated: true, applicability: applicable }),
    kind: "observed", result: "pass", evidence: "sufficient", eligibleLevel: 3
  },
  {
    name: "runtime observation, 0 events, regulated",
    input: withEvidence({ eventCount: 0, tiers: [] }, { regulated: true, applicability: applicable }),
    result: "not_evaluated", evidence: "incomplete", eligibleLevel: null, reason: "EMPTY_EVIDENCE"
  },
  {
    name: "events from another control",
    input: withEvidence({ boundToControl: false }, { regulated: true, applicability: applicable }),
    result: "not_evaluated", reason: "UNBOUND_EVIDENCE"
  },
  {
    name: "regulated fail on events from another control",
    input: withEvidence({ boundToControl: false }, { regulated: true, applicability: applicable,
      proposed: { result: "fail", level: 2 } }),
    result: "not_evaluated", reason: "UNBOUND_EVIDENCE"
  },
  {
    name: "negative event count, regulated",
    input: withEvidence({ eventCount: -1 }, { regulated: true, applicability: applicable }),
    result: "not_evaluated", evidence: "incomplete", eligibleLevel: null, reason: "EMPTY_EVIDENCE"
  },
  {
    name: "NaN event count, regulated",
    input: withEvidence({ eventCount: Number.NaN }, { regulated: true, applicability: applicable }),
    result: "not_evaluated", evidence: "incomplete", eligibleLevel: null, reason: "EMPTY_EVIDENCE"
  },
  {
    name: "stale evidence",
    input: withEvidence({ newestTs: NOW - 2 * DAY }),
    result: "not_evaluated", evidence: "stale", reason: "STALE_EVIDENCE"
  },
  {
    name: "future-dated evidence (replayed or forged timestamp)",
    input: withEvidence({ newestTs: NOW + DAY }),
    result: "not_evaluated", evidence: "stale", reason: "STALE_EVIDENCE"
  },
  {
    name: "evidence of unknown age with a freshness bound",
    input: withEvidence({ newestTs: null }),
    result: "not_evaluated", evidence: "stale", reason: "STALE_EVIDENCE"
  },
  {
    name: "contradictory evidence",
    input: withEvidence({ contradictory: true }),
    result: "not_evaluated", evidence: "contradictory", reason: "CONTRADICTORY_EVIDENCE"
  },
  {
    name: "cross-tenant evidence",
    input: withEvidence({ sameScope: false }),
    result: "not_evaluated", evidence: "untrusted", reason: "CROSS_SCOPE_EVIDENCE"
  },
  {
    name: "forged signing key",
    input: withEvidence({ signatureValid: false }),
    result: "not_evaluated", evidence: "untrusted", reason: "SIGNATURE_INVALID"
  },
  {
    name: "independent approved review, issuer not pinned",
    input: withEvidence({ tiers: ["ATTESTED"], issuerPinned: false },
      { method: "human_review", review: { state: "approved", independent: true } }),
    notKind: "independently_reviewed", kind: "self_reported", reason: "ISSUER_NOT_PINNED"
  },
  {
    name: "independent approved review, issuer pinned",
    input: withEvidence({ tiers: ["ATTESTED"], issuerPinned: true },
      { method: "human_review", review: { state: "approved", independent: true } }),
    kind: "independently_reviewed", result: "pass"
  },
  {
    name: "approved review by the producer itself",
    input: withEvidence({ tiers: ["ATTESTED"], issuerPinned: true },
      { method: "human_review", review: { state: "approved", independent: false } }),
    kind: "self_reported", reason: "REVIEW_NOT_INDEPENDENT"
  },
  {
    name: "keyword match, regulated pass",
    input: input({ method: "keyword_match", regulated: true, applicability: applicable }),
    result: "not_evaluated", eligibleLevel: 1, reason: "WEAK_METHOD"
  },
  {
    name: "path presence, pass L4",
    input: input({ method: "path_presence", proposed: { result: "pass", level: 4 } }),
    eligibleLevel: 1, reason: "WEAK_METHOD"
  },
  {
    name: "legacy 1.1.1, OBSERVED pass L4",
    input: input({ proposed: { result: "pass", level: 4 }, legacy: { version: "1.1.1", originalTier: "OBSERVED" } }),
    kind: "self_reported", reason: "LEGACY_1X_UNVERIFIED"
  },
  {
    name: "not applicable",
    input: input({ regulated: true, applicability: { state: "not_applicable", rationale: "no personal data" } }),
    result: "not_evaluated", reason: "NOT_APPLICABLE"
  },
  {
    name: "regulated with no applicability decision",
    input: input({ regulated: true }),
    result: "not_evaluated", reason: "APPLICABILITY_UNRESOLVED"
  }
];

describe("evaluateClaimEligibility", () => {
  test.each(rows)("$name", (row) => {
    const envelope = evaluateClaimEligibility(row.input);
    if (row.kind) expect(envelope.claimKind).toBe(row.kind);
    if (row.notKind) expect(envelope.claimKind).not.toBe(row.notKind);
    if (row.result) expect(envelope.statusDimensions.result).toBe(row.result);
    if (row.evidence) expect(envelope.statusDimensions.evidence).toBe(row.evidence);
    if (row.eligibleLevel !== undefined) expect(envelope.eligibleLevel).toBe(row.eligibleLevel);
    if (row.reason) expect(envelope.reasons).toContain(row.reason);
    else expect(envelope.reasons).toEqual([]);
  });

  test("regulated applicability defaults to unresolved", () => {
    const envelope = evaluateClaimEligibility(input({ regulated: true }));
    expect(envelope.statusDimensions.applicability.state).toBe("unresolved");
    expect(evaluateClaimEligibility(input()).statusDimensions.applicability).toEqual({ state: "applicable" });
  });

  test("legacy results keep their original version and tier in provenance", () => {
    const envelope = evaluateClaimEligibility(rows.find((row) => row.name.startsWith("legacy"))!.input);
    expect(envelope.provenance.legacy).toEqual({ version: "1.1.1", originalTier: "OBSERVED" });
    expect(renderClaimLabel(envelope).kindLabel).toBe("Legacy (1.x), self-reported");
  });

  test("weak methods and empty streams never yield a regulated pass or a level above 1", () => {
    const weak: ClaimMethod[] = ["synthetic", "numeric_self_answer", "keyword_match", "unkeyed_checksum", "path_presence"];
    for (const method of weak) {
      for (const eventCount of [0, 12]) {
        for (const regulated of [true, false]) {
          const envelope = evaluateClaimEligibility(withEvidence({ eventCount, tiers: ["OBSERVED_HARDENED"], issuerPinned: true },
            { method, regulated, applicability: applicable, proposed: { result: "pass", level: 5 },
              review: { state: "approved", independent: true } }));
          if (regulated) expect(envelope.statusDimensions.result, method).not.toBe("pass");
          expect(envelope.eligibleLevel ?? 0, method).toBeLessThanOrEqual(1);
        }
      }
    }
    const empty = evaluateClaimEligibility(withEvidence({ eventCount: 0 }, { regulated: true, applicability: applicable,
      proposed: { result: "pass", level: 5 } }));
    expect(empty.statusDimensions.result).toBe("not_evaluated");
    expect(empty.eligibleLevel).toBeNull();
  });

  test("does not mutate its input", () => {
    const row = input({ regulated: true, applicability: applicable, entitlement: { active: true } });
    const before = structuredClone(row);
    evaluateClaimEligibility(row);
    expect(row).toEqual(before);
  });
});

describe("properties over every row", () => {
  const strip = ({ entitlement: _entitlement, ...rest }: ClaimEnvelope) => rest;

  test.each(rows)("entitlement is copied and changes nothing else: $name", (row) => {
    const plain = evaluateClaimEligibility({ ...row.input, entitlement: undefined });
    const active = evaluateClaimEligibility({ ...row.input, entitlement: { active: true } });
    const inactive = evaluateClaimEligibility({ ...row.input, entitlement: { active: false } });
    expect(active.entitlement).toEqual({ active: true });
    expect(inactive.entitlement).toEqual({ active: false });
    expect(strip(active)).toEqual(strip(plain));
    expect(strip(inactive)).toEqual(strip(plain));
  });

  test.each(rows)("changing now changes only staleness: $name", (row) => {
    const base = evaluateClaimEligibility(row.input);
    expect(evaluateClaimEligibility({ ...row.input, now: row.input.now + 1 })).toEqual(base);
    const later = evaluateClaimEligibility({ ...row.input, now: row.input.now + 30 * DAY });
    expect(later.claimKind).toBe(base.claimKind);
    expect(later.eligibleLevel).toBe(base.eligibleLevel);
    expect(later.provenance).toEqual(base.provenance);
    const { evidence: _laterEvidence, result: _laterResult, ...laterRest } = later.statusDimensions;
    const { evidence: _baseEvidence, result: _baseResult, ...baseRest } = base.statusDimensions;
    expect(laterRest).toEqual(baseRest);
    expect(later.reasons.filter((code) => code !== "STALE_EVIDENCE")).toEqual(base.reasons.filter((code) => code !== "STALE_EVIDENCE"));
    if (later.statusDimensions.result !== base.statusDimensions.result) {
      expect(later.reasons).toContain("STALE_EVIDENCE");
    }
  });
});
