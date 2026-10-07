/**
 * The evidence plan of the controls that apply or are unresolved (P1-10): one entry per control test (run at
 * activation and on each `invalidatedBy` trigger; drills and document reviews on the manual duty's cadence), one
 * request per evidence contract, the manual duties, and release gates for runtime-enforced, configuration-check and
 * adversarial tests (blocking when the control is mandatory). Planning only: P1-11 evaluates evidence.
 */
import type { ControlRecord, EvidenceContract, ProducerRecord, TestType } from "../types.js";
import type { EvidencePlan, UnsupportedControl } from "./types.js";

const GATED: ReadonlySet<TestType> = new Set(["runtime_enforced", "configuration_check", "executed_adversarial"]);
const SCHEDULED: ReadonlySet<TestType> = new Set(["drill", "document_review"]);

function sampling(s: EvidenceContract["sampling"]): string {
  return `${s.method}${s.ratePercent === null ? "" : ` ${s.ratePercent}%`}${s.minItems === null ? "" : `, at least ${s.minItems}`}`;
}

/** `controls` sorted by id; rows keep that order. */
export function buildEvidencePlan(controls: ControlRecord[]): EvidencePlan {
  const plan: EvidencePlan = { tests: [], evidenceRequests: [], manualDuties: [], releaseGates: [] };
  for (const c of controls) {
    const duty = c.binding.manualDuty;
    for (const t of c.tests) {
      plan.tests.push({
        controlId: c.id, testId: t.id, type: t.type, attempts: t.attempts,
        fixtures: [...t.fixtures.positive, ...t.fixtures.negative].sort(),
        runOn: SCHEDULED.has(t.type) && duty ? [duty.cadence] : ["activation", ...[...c.invalidatedBy].sort()]
      });
      if (GATED.has(t.type)) plan.releaseGates.push({ controlId: c.id, testId: t.id, blocking: c.mandatory });
    }
    for (const e of c.evidence) {
      plan.evidenceRequests.push({
        controlId: c.id, contractId: e.id, producer: e.producer, bindingFields: e.bindingFields,
        maxAgeDays: e.freshness.maxAgeDays, sampling: sampling(e.sampling)
      });
    }
    if (duty) plan.manualDuties.push({ controlId: c.id, ...duty });
  }
  return plan;
}

/** Evidence contracts whose producer has not shipped: such a control cannot be evidenced yet. */
export function plannedProducers(controls: ControlRecord[], producers: ProducerRecord[]): UnsupportedControl[] {
  return controls.flatMap((c) => c.evidence.flatMap((e) => {
    const producer = producers.find((p) => p.id === e.producer);
    return producer?.status === "planned"
      ? [{ controlId: c.id, reason: "producer_planned" as const, detail: `${e.id}: producer ${producer.id} is planned (${producer.plannedBy ?? "no plan key"})` }]
      : [];
  }));
}
