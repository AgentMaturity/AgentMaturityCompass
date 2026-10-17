import { describe, expect, test } from "vitest";
import {
  claimFields, envelopeForLegacyResult, envelopeForSelfAssessment, evaluateClaimEligibility,
  renderClaimLegend, type ClaimEligibilityInput
} from "../src/claims/eligibility/index.js";
import { claimBadge, claimLegend, claimLegendHtml, LEGEND_PAGES } from "../src/console/assets/components/claimBadge.js";

const now = Date.UTC(2026, 9, 14, 12);
const observed: ClaimEligibilityInput = {
  producer: "P0-23 badge projection fixture", method: "executed_test", regulated: false,
  proposed: { result: "pass", level: 3 },
  evidence: { eventCount: 2, tiers: ["OBSERVED"], newestTs: now, boundToControl: true,
    sameScope: true, contradictory: false, signatureValid: true, issuerPinned: true }, now
};
// These are canonical helper projections, not actual tool transcripts or reviewer attestations.
const fixtures = [
  ["synthetic_example", evaluateClaimEligibility({ ...observed, method: "synthetic" }), "Synthetic example (not evidence)"],
  ["self_reported", envelopeForSelfAssessment({ producer: "badge questionnaire", answers: [5], regulated: true, now }), "Self-reported"],
  ["observed", evaluateClaimEligibility(observed), "Observed"],
  ["independently_reviewed", evaluateClaimEligibility({ ...observed, method: "human_review",
    review: { state: "approved", independent: true } }), "Independently reviewed"]
] as const;

describe("Studio badge contracts using the actual console renderer", () => {
  test.each(fixtures)("prints the canonical %s label, all dimensions and legend link", (kind, envelope, words) => {
    const fields = claimFields(envelope);
    expect(fields.claimKind).toBe(kind);
    const html = claimBadge(fields);
    expect(html).toContain(`data-claim-kind="${kind}"`);
    expect(html).toContain(`${words} · `);
    expect(html).toContain(`title="${fields.claimLabel}"`);
    for (const dimension of ["Result:", "Evidence:", "Enforcement:", "Review:", "Applicability:"]) {
      expect(html).toContain(dimension);
    }
    expect(html).toContain('href="#claim-legend"');
    expect(html).not.toMatch(/Certified/);
  });

  test("keeps the not-evaluated reason visible with neutral styling rather than inventing a score", () => {
    const html = claimBadge(claimFields(fixtures[1][1]));
    expect(html).toContain("not evaluated (self-reported answers cannot pass a regulated control)");
    expect(html).toContain('class="claim-badge pill"');
    expect(html).not.toMatch(/class="claim-badge pill (?:ok|bad)"|>0<|>5</);
  });

  test("retains the legacy notice from the canonical server label", () => {
    const legacy = envelopeForLegacyResult({ producer: "stored badge fixture", version: "1.1.1",
      method: "runtime_observation", status: "NOT_EVALUATED", level: 4, eventCount: 1, now });
    expect(claimBadge(claimFields(legacy))).toContain("Legacy (1.x), self-reported");
  });

  test("escapes an untrusted enforcement boundary in the tooltip", () => {
    const boundary = '<img src="x" onerror="alert(1)"> & gateway';
    const fields = claimFields(evaluateClaimEligibility({ ...observed, enforcement: { state: "enforced", boundary } }));
    const html = claimBadge(fields);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=&quot;x&quot; onerror=&quot;alert(1)&quot;&gt; &amp; gateway");
    expect(html).not.toContain('title="Claim: Observed · Result: pass · Evidence: sufficient · Enforcement: enforced at <');
  });

  test("escapes malformed kind input rather than adding an HTML attribute", () => {
    const html = claimBadge({ ...claimFields(fixtures[0][1]), claimKind: 'synthetic_example" onfocus="alert(1)' });
    expect(html).toContain('data-claim-kind="synthetic_example&quot; onfocus=&quot;alert(1)"');
    expect(html).not.toContain(' onfocus="');
  });

  test("shares the full canonical legend and retains every required legend page", () => {
    expect(claimLegendHtml()).toBe(renderClaimLegend("html"));
    expect(claimLegend(true)).toContain('id="claim-legend"');
    expect(claimLegend(true)).toContain('class="claim-legend" open');
    for (const page of ["home", "transparency", "compliance", "assurance", "passport", "industrypacks"]) {
      expect(LEGEND_PAGES.has(page), page).toBe(true);
    }
  });
});
