import type { ClaimEnvelope, ClaimKind, ClaimReasonCode, StatusDimensions } from "./types.js";

/** Public output: text parsers depend on these words. JSON consumers read `claimKind`, not the label. */
const KIND_LABELS: Record<ClaimKind, string> = {
  synthetic_example: "Synthetic example (not evidence)",
  self_reported: "Self-reported",
  observed: "Observed",
  independently_reviewed: "Independently reviewed"
};
// A legacy result is never observed or reviewed (rule 2); labels cite the notice it is read under (P1-35).
const LEGACY_LABELS: Partial<Record<ClaimKind, string>> = {
  self_reported: "Legacy (1.x), self-reported",
  synthetic_example: "Legacy (1.x), synthetic example"
};

export function claimKindLabel(kind: ClaimKind): string {
  return KIND_LABELS[kind];
}

export const REASON_TEXT: Record<ClaimReasonCode, string> = {
  SYNTHETIC_VALUES: "synthetic example values are not evidence",
  SELF_REPORTED_NO_POSITIVE_STATUS: "self-reported answers cannot pass a regulated control",
  SELF_REPORTED_LEVEL_CAP: "self-reported answers cannot support a level above 1",
  WEAK_METHOD: "keyword matches, unkeyed checksums and path checks cannot pass a regulated control or support a level above 1",
  EMPTY_EVIDENCE: "no evidence events were recorded",
  UNBOUND_EVIDENCE: "the evidence is not bound to this control",
  STALE_EVIDENCE: "the newest evidence is older than the allowed age",
  CONTRADICTORY_EVIDENCE: "the evidence contradicts itself",
  CROSS_SCOPE_EVIDENCE: "the evidence belongs to another tenant or scope",
  SIGNATURE_INVALID: "the signature does not verify",
  ISSUER_NOT_PINNED: "the reviewer's key is not pinned",
  REVIEW_NOT_INDEPENDENT: "the review is not independent of the producer",
  LEGACY_1X_UNVERIFIED: "results stored by AMC 1.x were never verified",
  NOT_APPLICABLE: "the control does not apply",
  APPLICABILITY_UNRESOLVED: "no applicability decision is recorded",
  EVIDENCE_NOT_CLAIM_READY: "the run did not meet AMC's evidence-readiness gate for claims",
  RESULT_NOT_BOUND: "this result is not yet bound to claim-eligible evidence"
};

// These explain the kind or the level, never why a result was withheld.
const NON_RESULT_REASONS: ReadonlySet<ClaimReasonCode> = new Set([
  "LEGACY_1X_UNVERIFIED", "SELF_REPORTED_LEVEL_CAP", "ISSUER_NOT_PINNED", "REVIEW_NOT_INDEPENDENT"
]);

type DimensionName = "result" | "evidence" | "enforcement" | "review" | "applicability";
export interface ClaimLabel { kindLabel: string; line: string; dimensions: Record<DimensionName, string> }
export type ClaimLabelSurface = "cli" | "mcp" | "api" | "studio" | "report";

function resultText(dimensions: StatusDimensions, reasons: readonly ClaimReasonCode[]): string {
  if (dimensions.result !== "not_evaluated") return dimensions.result;
  const why = reasons.find((code) => !NON_RESULT_REASONS.has(code));
  return why ? `not evaluated (${REASON_TEXT[why]})` : "not evaluated";
}

function fields(label: ClaimLabel): [string, string][] {
  const d = label.dimensions;
  return [["Claim", label.kindLabel], ["Result", d.result], ["Evidence", d.evidence], ["Enforcement", d.enforcement],
    ["Review", d.review], ["Applicability", d.applicability]];
}

export function renderClaimLabel(envelope: ClaimEnvelope): ClaimLabel {
  const { statusDimensions: s } = envelope;
  const legacy = envelope.provenance.legacy;
  const legacyLabel = legacy ? LEGACY_LABELS[envelope.claimKind] : undefined;
  const kindLabel = legacyLabel === undefined ? KIND_LABELS[envelope.claimKind]
    : legacy?.notice ? `${legacyLabel} (notice ${legacy.notice})` : legacyLabel;
  const dimensions: ClaimLabel["dimensions"] = {
    result: resultText(s, envelope.reasons),
    evidence: s.evidence,
    enforcement: s.enforcement.state === "enforced" ? `enforced at ${s.enforcement.boundary}` : s.enforcement.state,
    review: s.review,
    applicability: s.applicability.state === "not_applicable" ? `not applicable (${s.applicability.rationale})`
      : s.applicability.state
  };
  const label = { kindLabel, line: "", dimensions };
  return { ...label, line: fields(label).map(([name, value]) => `${name}: ${value}`).join(" · ") };
}

/** What MCP, API and Studio attach to a result: the kind, the five dimensions and the label line. */
export interface ClaimFields { claimKind: ClaimKind; statusDimensions: StatusDimensions; claimLabel: string }

export function claimFields(envelope: ClaimEnvelope): ClaimFields {
  return { claimKind: envelope.claimKind, statusDimensions: envelope.statusDimensions,
    claimLabel: renderClaimLabel(envelope).line };
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Changes markup only, never words: every surface prints the same label. */
export function formatClaimLabel(label: ClaimLabel, surface: ClaimLabelSurface): string {
  if (surface === "report") return fields(label).map(([name, value]) => `**${name}:** ${value}`).join(" · ");
  if (surface === "studio") {
    const parts = fields(label).map(([name, value]) => `<strong>${name}:</strong> ${escapeHtml(value)}`);
    return `<span class="amc-claim-label">${parts.join(" · ")}</span>`;
  }
  return label.line;
}

const LEGEND: [string, [string, string][]][] = [
  ["Claim kinds", [
    [KIND_LABELS.synthetic_example, "example values from a labelled example mode; never evidence, never a level"],
    [KIND_LABELS.self_reported, "stated by the agent or its operator, or not backed by observed evidence, including results "
      + "stored by AMC 1.x; numeric self-answers reach at most level 1 and never pass a regulated control"],
    [KIND_LABELS.observed, "AMC observed the behaviour at runtime or in an executed test"],
    [KIND_LABELS.independently_reviewed, "approved by an independent reviewer whose key is pinned"]
  ]],
  ["Status dimensions", [
    ["Result", "pass, fail or not evaluated"],
    ["Evidence", "sufficient, incomplete, stale, contradictory or untrusted"],
    ["Enforcement", "none, advisory, observed or enforced at a named boundary"],
    ["Review", "pending, approved, rejected or expired"],
    ["Applicability", "applicable, not applicable with a rationale, or unresolved"]
  ]],
  ["Results", [
    ["Not evaluated", "AMC could not decide from trustworthy evidence; it is never a pass, a partial result or a default score"]
  ]]
];

export function renderClaimLegend(format: "text" | "markdown" | "html"): string {
  return LEGEND.map(([heading, entries]) => {
    if (format === "html") {
      const items = entries.map(([term, text]) => `<li><strong>${escapeHtml(term)}</strong>: ${escapeHtml(text)}</li>`);
      return `<h3>${heading}</h3><ul>${items.join("")}</ul>`;
    }
    if (format === "markdown") {
      return [`### ${heading}`, "", ...entries.map(([term, text]) => `- **${term}**: ${text}`)].join("\n");
    }
    return [heading, ...entries.map(([term, text]) => `- ${term}: ${text}`)].join("\n");
  }).join(format === "html" ? "\n" : "\n\n");
}
