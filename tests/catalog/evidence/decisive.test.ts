import { describe, expect, it } from "vitest";
import { useKey } from "../../../src/catalog/evidence/admission.js";
import { evaluateControl } from "../../../src/catalog/evidence/evaluate.js";
import type { ControlResult, EvaluableControl, EvaluationContext, EvidenceItem, ResultReview } from "../../../src/catalog/evidence/types.js";
import type { BindingField, ProducerRecord } from "../../../src/catalog/types.js";

// These are synthetic, already-derived unit inputs. `verified: true` is a loader output contract,
// not a signature check. The plan is a supplied decision, not a compiled or signed plan.
const PRODUCER = "amc.toolPipeline.guard";
const CONTROL = "L0-TST-01";
const POLICY = "sha256:" + "a".repeat(64);

function producer(overrides: Partial<ProducerRecord> = {}): ProducerRecord {
  return {
    id: PRODUCER, module: "src/tools/toolPipeline.ts", emits: ["TOOL_CALL_ALLOWED", "TOOL_CALL_DENIED"],
    maxClaimKind: "observed", status: "available", plannedBy: null, ...overrides
  };
}

function control(overrides: Partial<EvaluableControl> = {}): EvaluableControl {
  return {
    id: CONTROL, version: "1.0.0", invalidatedBy: ["policy_version"],
    binding: { kind: "enforcement_point", points: ["tool_pipeline"], mechanism: "unit decision input", parameters: [], manualDuty: null },
    evidence: [{
      id: `${CONTROL}-E1`, producer: PRODUCER,
      bindingFields: ["tenantId", "workspaceId", "deploymentId", "agentId", "subjectId", "sessionId", "controlId", "controlVersion", "policyDigest", "producerId"],
      freshness: { maxAgeDays: 30 }, sampling: { method: "all", ratePercent: null, minItems: 1 },
      retention: { mode: "regime_max" }, residency: { mode: "inherit_deployment" }
    }],
    ...overrides
  };
}

function context(overrides: Partial<EvaluationContext> = {}): EvaluationContext {
  return {
    subject: { tenantId: "unit-tenant", workspaceId: "unit-workspace", deploymentId: "unit-deployment", agentId: "unit-agent", subjectId: "unit-subject" },
    window: { start: "2026-10-01T00:00:00.000Z", end: "2026-11-01T00:00:00.000Z" },
    plan: { digest: "sha256:" + "b".repeat(64), policyDigest: POLICY, applicability: { state: "applicable" }, mode: "enforce" },
    invalidations: [], reviews: [], producers: [producer()], ...overrides
  };
}

function item(overrides: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    ref: { kind: "ledger_event", id: "unit-event-a", sha256: "c".repeat(64) },
    producerId: PRODUCER, provenance: { verified: true, producerId: PRODUCER, trustTier: "OBSERVED" },
    recordedAt: "2026-10-31T00:00:00.000Z", claimedAt: null,
    binding: {
      tenantId: "unit-tenant", workspaceId: "unit-workspace", deploymentId: "unit-deployment", agentId: "unit-agent", subjectId: "unit-subject",
      sessionId: "unit-session", controlId: CONTROL, controlVersion: "1.0.0", policyDigest: POLICY, producerId: PRODUCER
    },
    verdict: "conforms", attributes: { decision: "allow" }, ...overrides
  };
}

function pass(ctx = context(), record = control(), items = [item()]): ControlResult {
  const result = evaluateControl(record, items, ctx);
  expect(result.rejected).toEqual([]);
  expect(result.dimensions.result).toBe("pass");
  expect(result.dimensions.evidence).toBe("sufficient");
  expect(result.claimKind).toBe("observed");
  return result;
}

function refusal(input: EvidenceItem, reason: string, evidence = "incomplete", ctx = context()): void {
  const result = evaluateControl(control(), [input], ctx);
  expect(result.rejected.map(row => ({ id: row.ref.id, reason: row.reason }))).toEqual([{ id: input.ref.id, reason }]);
  expect(result.admitted).toEqual([]);
  expect(result.dimensions.evidence).toBe(evidence);
  expect(result.dimensions.result).toBe("not_evaluated");
  expect(result.claimKind).toBe("self_reported");
}

describe("catalog evidence decisions on already-derived unit inputs", () => {
  it("returns all five dimensions for fresh bound observed evidence at its enforcement point", () => {
    const result = pass();
    expect(result.dimensions).toEqual({
      applicability: { state: "applicable" }, evidence: "sufficient", result: "pass",
      enforcement: { state: "enforced", boundary: "tool_pipeline" }, review: "pending"
    });
    expect(result.admitted).toEqual([{ ref: item().ref, producerId: PRODUCER, trustTier: "OBSERVED" }]);
    expect(result.controlId).toBe(CONTROL);
    expect(result.controlVersion).toBe("1.0.0");
    expect(result.controlDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(result.planDigest).toBe(context().plan?.digest);
    expect(result.subject).toEqual(context().subject);
    expect(result.window).toEqual(context().window);
    expect(result.digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("withholds a pass from an empty stream", () => {
    pass();
    const result = evaluateControl(control(), [], context());
    expect(result.admitted).toEqual([]);
    expect(result.rejected).toEqual([]);
    expect(result.dimensions).toMatchObject({ evidence: "incomplete", result: "not_evaluated", enforcement: { state: "none" } });
    expect(result.claimReasons).toContain("EMPTY_EVIDENCE");
  });

  it("requires every declared binding field", () => {
    pass();
    const fields = control().evidence[0].bindingFields;
    const rows = fields.map(field => {
      const missing = item();
      delete missing.binding[field];
      const result = evaluateControl(control(), [missing], context());
      return { field, admitted: result.admitted.length, reasons: result.rejected.map(row => row.reason) };
    });
    expect(rows).toEqual(fields.map(field => ({ field, admitted: 0, reasons: ["binding_missing"] })));
  });

  it("refuses individually changed subject, control, version, policy and scope bindings", () => {
    pass();
    const fields: BindingField[] = ["subjectId", "controlId", "controlVersion", "policyDigest", "workspaceId", "deploymentId", "agentId", "producerId"];
    const rows = fields.map(field => {
      const result = evaluateControl(control(), [item({ binding: { ...item().binding, [field]: "unit-other" } })], context());
      return { field, admitted: result.admitted.length, reasons: result.rejected.map(row => row.reason), result: result.dimensions.result };
    });
    expect(rows).toEqual(fields.map(field => ({ field, admitted: 0, reasons: ["binding_mismatch"], result: "not_evaluated" })));
  });

  it("refuses another tenant and treats its evidence as untrusted", () => {
    pass();
    refusal(item({ binding: { ...item().binding, tenantId: "unit-other-tenant" } }), "cross_tenant", "untrusted");
  });

  it("requires an available producer named by the contract", () => {
    pass();
    const contexts = [context({ producers: [] }), context({ producers: [producer({ status: "planned", plannedBy: "P1-02" })] })];
    for (const ctx of contexts) refusal(item(), "producer_not_admitted", "untrusted", ctx);
    refusal(item({ producerId: "amc.unitOther" }), "producer_not_admitted", "untrusted");
  });

  it("requires verified provenance proving the claimed producer and a derived tier", () => {
    pass();
    const provenances: EvidenceItem["provenance"][] = [
      { verified: false, detail: "unit loader refused these bytes" },
      { verified: true, producerId: "amc.unitOther", trustTier: "OBSERVED" },
      { verified: true, producerId: null, trustTier: "OBSERVED" },
      { verified: true, producerId: PRODUCER, trustTier: null }
    ];
    for (const provenance of provenances) refusal(item({ provenance }), "producer_unverified", "untrusted");
  });

  it("uses recorded time for freshness even when claimed time looks fresh", () => {
    pass();
    refusal(item({ recordedAt: "2026-10-01T00:00:00.000Z", claimedAt: "2026-11-01T00:00:00.000Z" }), "stale", "stale");
  });

  it("admits the exact freshness boundary despite an old claimed time", () => {
    pass(context(), control(), [item({ recordedAt: "2026-10-02T00:00:00.000Z", claimedAt: "2000-01-01T00:00:00.000Z" })]);
  });

  it("refuses recorded times outside either window boundary or with invalid syntax", () => {
    pass();
    for (const recordedAt of ["2026-09-30T23:59:59.999Z", "2026-11-01T00:00:00.001Z", "invalid"]) {
      refusal(item({ recordedAt }), "outside_window");
    }
  });

  it("refuses prefixed ref and receipt identities previously used in another window", () => {
    const record = control();
    const earlier = context({ window: { start: "2026-10-01T00:00:00.000Z", end: "2026-10-31T00:00:00.000Z" } });
    const receiptItem = item({ attributes: { decision: "allow", receiptId: "unit-receipt" } });
    pass(earlier, record, [receiptItem]);
    pass(context({ priorUses: [{ id: "receipt:unit-receipt", key: useKey(record, context()) }] }), record, [receiptItem]);
    for (const id of ["ledger_event:unit-event-a", "receipt:unit-receipt"]) {
      refusal(receiptItem, "replayed", "incomplete", context({ priorUses: [{ id, key: useKey(record, earlier) }] }));
    }
  });

  it("admits a receipt identity once per evaluation", () => {
    const first = item({ attributes: { decision: "allow", receiptId: "unit-receipt" } });
    const second = item({ ref: { ...item().ref, id: "unit-event-b" }, attributes: { decision: "allow", receiptId: "unit-other-receipt" } });
    pass(context(), control(), [first, second]);
    const result = evaluateControl(control(), [first, { ...second, attributes: first.attributes }], context());
    expect(result.admitted.map(row => row.ref.id)).toEqual(["unit-event-a"]);
    expect(result.rejected.map(row => ({ id: row.ref.id, reason: row.reason }))).toEqual([{ id: "unit-event-b", reason: "replayed" }]);
  });

  it("refuses the loader's derived foreign-receipt decision", () => {
    pass();
    refusal(item({ attributes: { decision: "allow", foreignReceipt: true } }), "replayed");
  });

  it("invalidates evidence only for a listed trigger after its recorded time", () => {
    pass(context({ invalidations: [{ trigger: "policy_version", at: item().recordedAt, ref: "unit-same-time" }] }));
    pass(context({ invalidations: [{ trigger: "model_version", at: "2026-10-31T00:00:00.001Z", ref: "unit-unlisted" }] }));
    refusal(item(), "invalidated", "incomplete", context({ invalidations: [
      { trigger: "policy_version", at: "2026-10-31T00:00:00.001Z", ref: "unit-later-policy" }
    ] }));
  });

  it("withholds passes for absent, unresolved and not-applicable plan decisions", () => {
    pass();
    const base = context().plan;
    if (!base) throw new Error("unit plan missing");
    const contexts = [
      context({ plan: null }),
      context({ plan: { ...base, applicability: { state: "unresolved", reason: "unit unknown fact" } } }),
      context({ plan: { ...base, applicability: { state: "not_applicable", rationale: "unit excluded scope" } } })
    ];
    // Omit policyDigest only when there is no plan, so applicability is tested with admitted evidence.
    const noPolicy = item();
    delete noPolicy.binding.policyDigest;
    const noPolicyControl = control();
    noPolicyControl.evidence[0].bindingFields = noPolicyControl.evidence[0].bindingFields.filter(field => field !== "policyDigest");
    pass(context(), noPolicyControl, [noPolicy]);
    const rows = contexts.map(ctx => evaluateControl(ctx.plan ? control() : noPolicyControl, [ctx.plan ? item() : noPolicy], ctx));
    expect(rows.map(result => result.admitted.length)).toEqual([1, 1, 1]);
    expect(rows.map(result => result.dimensions.result)).toEqual(["not_evaluated", "not_evaluated", "not_evaluated"]);
    expect(rows.map(result => result.dimensions.applicability.state)).toEqual(["unresolved", "unresolved", "not_applicable"]);
  });

  it("withholds a pass when admitted nonviolating observations contradict each other", () => {
    const first = item({ attributes: { decision: "allow", observationKey: "unit-call", observation: "allow" } });
    const second = item({ ref: { ...item().ref, id: "unit-event-b" }, attributes: { decision: "deny", observationKey: "unit-call", observation: "allow" } });
    pass(context(), control(), [first, second]);
    const result = evaluateControl(control(), [first, { ...second, attributes: { ...second.attributes, observation: "deny" } }], context());
    expect(result.rejected).toEqual([]);
    expect(result.admitted).toHaveLength(2);
    expect(result.dimensions.evidence).toBe("contradictory");
    expect(result.dimensions.result).toBe("not_evaluated");
    expect(result.claimKind).toBe("self_reported");
  });

  it("preserves trusted violation failure despite incomplete sampling", () => {
    const record = control();
    record.evidence[0].sampling.minItems = 2;
    pass(context(), record, [item(), item({ ref: { ...item().ref, id: "unit-event-b" } })]);
    const result = evaluateControl(record, [item({ verdict: "violates", attributes: { decision: "deny" } })], context());
    expect(result.rejected).toEqual([]);
    expect(result.dimensions.evidence).toBe("incomplete");
    expect(result.dimensions.result).toBe("fail");
    expect(result.claimKind).toBe("self_reported");
  });

  it("lets an unadmitted violation block a pass without crediting its provenance", () => {
    pass();
    const result = evaluateControl(control(), [item(), item({ ref: { ...item().ref, id: "unit-event-b" },
      binding: { ...item().binding, subjectId: "unit-other" }, verdict: "violates" })], context());
    expect(result.admitted.map(row => row.ref.id)).toEqual(["unit-event-a"]);
    expect(result.rejected.map(row => row.reason)).toEqual(["binding_mismatch"]);
    expect(result.dimensions.evidence).toBe("sufficient");
    expect(result.dimensions.result).toBe("not_evaluated");
  });

  it("rejects system-session positives but retains their violation-only agent rule", () => {
    pass();
    refusal(item({ binding: { ...item().binding, sessionId: "system" } }), "binding_mismatch");
    const binding = { ...item().binding, sessionId: "system" };
    delete binding.agentId;
    const result = evaluateControl(control(), [item({ binding, verdict: "violates", attributes: { decision: "deny" } })], context());
    expect(result.rejected).toEqual([]);
    expect(result.admitted).toHaveLength(1);
    expect(result.dimensions.result).toBe("fail");
  });

  it("consumes the derived SELF_REPORTED tier despite an ignored OBSERVED attribute label", () => {
    pass();
    // This label is intentionally not raw meta.trustTier. Loader derivation is outside this unit seam.
    const result = evaluateControl(control(), [item({
      provenance: { verified: true, producerId: PRODUCER, trustTier: "SELF_REPORTED" },
      attributes: { decision: "allow", trustTier: "OBSERVED" }
    })], context());
    expect(result.admitted[0].trustTier).toBe("SELF_REPORTED");
    expect(result.dimensions.result).toBe("not_evaluated");
    expect(result.claimKind).toBe("self_reported");
  });

  it("caps observed provenance at the producer's self-reported or synthetic maximum", () => {
    pass();
    const self = evaluateControl(control(), [item()], context({ producers: [producer({ maxClaimKind: "self_reported" })] }));
    const synthetic = evaluateControl(control(), [item()], context({ producers: [producer({ maxClaimKind: "synthetic_example" })] }));
    expect(self.admitted[0].trustTier).toBe("SELF_REPORTED");
    expect(self.dimensions.result).toBe("not_evaluated");
    expect(self.claimKind).toBe("self_reported");
    expect(synthetic.admitted[0].trustTier).toBe("SELF_REPORTED");
    expect(synthetic.dimensions.result).toBe("not_evaluated");
    expect(synthetic.claimKind).toBe("synthetic_example");
    expect(synthetic.claimReasons).toContain("SYNTHETIC_VALUES");
  });

  it("withholds a pass when the required observed sampling ratio is not met", () => {
    const record = control();
    record.evidence[0].minObservedRatio = 1;
    const second = item({ ref: { ...item().ref, id: "unit-event-b" } });
    pass(context(), record, [item(), second]);
    const result = evaluateControl(record, [item(), { ...second, provenance: { verified: true, producerId: PRODUCER, trustTier: "SELF_REPORTED" } }], context());
    expect(result.admitted).toHaveLength(2);
    expect(result.dimensions.evidence).toBe("untrusted");
    expect(result.dimensions.result).toBe("not_evaluated");
    expect(result.claimKind).toBe("self_reported");
  });

  it("distinguishes advisory and observed behavior from enforcement at the binding point", () => {
    pass();
    const plan = context().plan;
    if (!plan) throw new Error("unit plan missing");
    const advisory = pass(context({ plan: { ...plan, mode: "warn" } }));
    const observed = pass(context(), control(), [item({ attributes: {} })]);
    const otherPoint = control();
    otherPoint.binding.points = ["egress"];
    const wrongBoundary = pass(context(), otherPoint);
    expect(advisory.dimensions.enforcement).toEqual({ state: "advisory" });
    expect(observed.dimensions.enforcement).toEqual({ state: "observed" });
    expect(wrongBoundary.dimensions.enforcement).toEqual({ state: "observed" });
  });

  it("keeps input order and input objects unchanged while binding the result digest to admitted refs", () => {
    const record = control();
    const ctx = context();
    const first = item();
    const second = item({ ref: { ...item().ref, id: "unit-event-b" } });
    const inputs = [second, first];
    const before = JSON.stringify({ record, ctx, inputs });
    const result = pass(ctx, record, inputs);
    const reordered = pass(ctx, record, [first, second]);
    expect(result.admitted.map(row => row.ref.id)).toEqual(["unit-event-a", "unit-event-b"]);
    expect(result.digest).toBe(reordered.digest);
    expect(JSON.stringify({ record, ctx, inputs })).toBe(before);
    const changed = pass(ctx, record, [first, { ...second, ref: { ...second.ref, sha256: "d".repeat(64) } }]);
    expect(changed.digest).not.toBe(result.digest);
  });

  it("binds already-verified review decisions to the digest without promoting claim kind", () => {
    const result = pass();
    const review: ResultReview = { resultDigest: result.digest, decision: "approved", reviewer: "unit-reviewed-upstream",
      approvalRequestId: "unit-approval", expiresAt: "9999-01-01T00:00:00.000Z" };
    const approved = pass(context({ reviews: [review] }));
    const expired = pass(context({ reviews: [{ ...review, expiresAt: "2000-01-01T00:00:00.000Z" }] }));
    const rejected = pass(context({ reviews: [review, { ...review, decision: "rejected" }] }));
    const unrelated = pass(context({ reviews: [{ ...review, resultDigest: `${result.digest}-other` }] }));
    expect([approved.dimensions.review, expired.dimensions.review, rejected.dimensions.review, unrelated.dimensions.review])
      .toEqual(["approved", "expired", "rejected", "pending"]);
    expect([approved.digest, expired.digest, rejected.digest, unrelated.digest]).toEqual([result.digest, result.digest, result.digest, result.digest]);
    expect(approved.claimKind).toBe("observed");
  });
});
