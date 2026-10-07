/**
 * Which registered emitters evidence which question, per level (P1-07).
 *
 * A map is a methodology claim, so each one says `because`, quoting the question's own `evidenceGateHints`, the way
 * src/diagnostic/liveEvidenceProjection.ts does. `l2` and `l3` list `EmitterEntry.id`s from ../evidenceEmitters.ts;
 * the level passes when every listed emitter has an `observed` row in the window, admitted by provenance, on top of
 * the gate's event, session and day minimums. The map IS the binding above L1: a row's own `questionIds` tag is
 * ignored there, so a writer cannot choose which questions its rows lift. An empty list means that level is not
 * evaluable on runtime evidence.
 *
 * A question with no map is not evaluable above L1. NOT_YET_EVIDENCEABLE records, for a mapped question, what its
 * missing levels still need, so the next reader does not re-derive (or invent) the same binding.
 */
export interface EvidenceMap {
  questionId: string;
  l2: string[];
  l3: string[];
  because: string;
}

export const EVIDENCE_MAPS: readonly EvidenceMap[] = [
  {
    questionId: "AMC-5.29",
    l2: ["tool-call-allowed", "tool-call-denied"],
    l3: [],
    because: "AMC-5.29 asks for 'denied/allowed tool-call receipts'. The native toolset composes the tool allowlist "
      + "for every governed call (src/agent/agentToolset.ts), so each call writes one receipt or the other, and both "
      + "together show the allowlist is configured and that a guard refuses."
  },
  {
    questionId: "AMC-SCI-2",
    l2: ["tool-call-allowed"],
    l3: [],
    because: "AMC-SCI-2 asks for 'complete tool-call audit logs'. Every governed call writes a signed audit row naming "
      + "what policy decided, which shows the audit log is configured."
  },
  {
    questionId: "AMC-OPDISC-6",
    l2: ["tool-call-outcome"],
    l3: [],
    because: "AMC-OPDISC-6 asks for 'tool-call cost/latency' metrics. Every governed call writes a metric row with its "
      + "outcome, which shows per-call metering is configured."
  },
  {
    questionId: "AMC-2.15",
    l2: ["delegation-settled"],
    l3: [],
    because: "AMC-2.15 asks for 'signed delegation tokens, scope propagation evidence ... and delegation chain audit "
      + "logs'. A scope-declared delegation writes a settled audit row naming its signed packet and declared scope."
  }
];

export const NOT_YET_EVIDENCEABLE: ReadonlyArray<{ questionId: string; needs: string }> = [
  { questionId: "AMC-5.29", needs: "tool-interface reconstruction, per-step scope decisions and status-aware validation metrics" },
  { questionId: "AMC-SCI-2", needs: "MCP server identity checks, attestation receipts and sanitized tool-result traces" },
  { questionId: "AMC-OPDISC-6", needs: "batched execution traces and duplicate-call metrics" },
  { questionId: "AMC-2.15", needs: "executed sub-agent privilege escalation tests" }
];

const MAPS_BY_QUESTION = new Map(EVIDENCE_MAPS.map((map) => [map.questionId, map]));
const NEEDS_BY_QUESTION = new Map(NOT_YET_EVIDENCEABLE.map((row) => [row.questionId, row.needs]));

export function evidenceMapFor(questionId: string): EvidenceMap | undefined {
  return MAPS_BY_QUESTION.get(questionId);
}

/** What a question still needs for the levels its map leaves empty, or undefined when nothing is recorded. */
export function notYetEvidenceableNeeds(questionId: string): string | undefined {
  return NEEDS_BY_QUESTION.get(questionId);
}
