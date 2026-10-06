import { describe, expect, test } from "vitest";
import {
  claimEnvelopeSchema,
  claimKindSchema,
  envelopeForSelfAssessment,
  evaluateClaimEligibility,
  formatClaimLabel,
  REASON_TEXT,
  renderClaimLabel,
  renderClaimLegend,
  statusDimensionsSchema,
  type ClaimEligibilityInput,
  type ClaimEnvelope
} from "../../src/claims/eligibility/index.js";

const NOW = Date.UTC(2026, 9, 5, 12, 0, 0);
const base: ClaimEligibilityInput = {
  producer: "test",
  method: "runtime_observation",
  regulated: false,
  proposed: { result: "pass", level: 3 },
  evidence: {
    eventCount: 12, tiers: ["OBSERVED"], newestTs: NOW - 1_000, boundToControl: true, sameScope: true,
    contradictory: false, signatureValid: true, issuerPinned: true
  },
  now: NOW
};

const envelopes: Record<string, ClaimEnvelope> = {
  synthetic: evaluateClaimEligibility({ ...base, method: "synthetic" }),
  selfReported: envelopeForSelfAssessment({ producer: "questionnaire", answers: [5, 5], regulated: true, now: NOW }),
  observed: evaluateClaimEligibility({ ...base, enforcement: { state: "enforced", boundary: "gateway" } }),
  reviewed: evaluateClaimEligibility({ ...base, method: "human_review", review: { state: "approved", independent: true } }),
  legacy: evaluateClaimEligibility({ ...base, legacy: { version: "1.1.1" } })
};

function stripMarkup(text: string): string {
  return text.replace(/<[^>]+>/g, "").replace(/\*\*/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&amp;/g, "&");
}

describe("renderClaimLabel", () => {
  test("label per kind", () => {
    expect(Object.fromEntries(Object.entries(envelopes).map(([name, envelope]) => [name, renderClaimLabel(envelope).line]))).toEqual({
      synthetic: "Claim: Synthetic example (not evidence) · Result: not evaluated (synthetic example values are not evidence) · Evidence: incomplete · Enforcement: none · Review: pending · Applicability: applicable",
      selfReported: "Claim: Self-reported · Result: not evaluated (self-reported answers cannot pass a regulated control) · Evidence: incomplete · Enforcement: none · Review: pending · Applicability: unresolved",
      observed: "Claim: Observed · Result: pass · Evidence: sufficient · Enforcement: enforced at gateway · Review: pending · Applicability: applicable",
      reviewed: "Claim: Independently reviewed · Result: pass · Evidence: sufficient · Enforcement: none · Review: approved · Applicability: applicable",
      legacy: "Claim: Legacy (1.x), self-reported · Result: pass · Evidence: sufficient · Enforcement: none · Review: pending · Applicability: applicable"
    });
  });

  test("every reason code has one fixed sentence", () => {
    for (const text of Object.values(REASON_TEXT)) expect(text).toMatch(/^[a-z].+[^.]$/);
  });

  test("the five surface formats carry the same words", () => {
    for (const envelope of Object.values(envelopes)) {
      const label = renderClaimLabel(envelope);
      for (const surface of ["cli", "mcp", "api", "studio", "report"] as const) {
        expect(stripMarkup(formatClaimLabel(label, surface)), surface).toBe(label.line);
      }
    }
  });

  test("studio output escapes HTML", () => {
    const envelope = evaluateClaimEligibility({ ...base, enforcement: { state: "enforced", boundary: "<gateway>" } });
    expect(formatClaimLabel(renderClaimLabel(envelope), "studio")).toContain("&lt;gateway&gt;");
  });

  test("the legend explains every kind, dimension and not evaluated in each format", () => {
    for (const format of ["text", "markdown", "html"] as const) {
      const legend = stripMarkup(renderClaimLegend(format));
      for (const term of ["Synthetic example (not evidence)", "Self-reported", "Observed", "Independently reviewed",
        "Result", "Evidence", "Enforcement", "Review", "Applicability", "Not evaluated"]) {
        expect(legend, `${format}: ${term}`).toContain(term);
      }
    }
  });
});

describe("schemas", () => {
  test("every envelope round-trips", () => {
    for (const envelope of Object.values(envelopes)) {
      const json = JSON.parse(JSON.stringify(envelope)) as unknown;
      expect(claimEnvelopeSchema.parse(json)).toEqual(envelope);
    }
  });

  test("unknown keys and invalid kinds are rejected", () => {
    const envelope = envelopes.observed;
    expect(claimEnvelopeSchema.safeParse({ ...envelope, extra: true }).success).toBe(false);
    expect(claimEnvelopeSchema.safeParse({ ...envelope, claimKind: "certified" }).success).toBe(false);
    expect(statusDimensionsSchema.safeParse({ ...envelope.statusDimensions, score: 5 }).success).toBe(false);
    expect(claimKindSchema.safeParse("compliant").success).toBe(false);
  });
});
