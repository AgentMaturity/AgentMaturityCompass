/**
 * P0-55 case 7 (P0-22): evaluateControl passes claimKind observed only when its own evidence decision is sufficient.
 * Every admitted item below is OBSERVED, yet an incomplete, stale or contradictory set reads self_reported.
 */
import { expect, test } from "vitest";
import { evaluateControl } from "../../src/catalog/evidence/evaluate.js";
import type { EvaluableControl, EvaluationContext, EvidenceItem } from "../../src/catalog/evidence/types.js";
import type { ProducerRecord } from "../../src/catalog/types.js";

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

const second = (overrides: Partial<EvidenceItem> = {}) => item({ ref: { ...item().ref, id: "unit-event-b" }, ...overrides });
function twoItems(): EvaluableControl {
  const record = control();
  record.evidence[0]!.sampling.minItems = 2;
  return record;
}

test("the control: two fresh OBSERVED items meeting minItems read observed", () => {
  const result = evaluateControl(twoItems(), [item(), second()], context());
  expect(result.dimensions.evidence).toBe("sufficient");
  expect(result.claimKind).toBe("observed");
});

test("fewer than minItems (incomplete) reads self_reported", () => {
  const result = evaluateControl(twoItems(), [item()], context());
  expect(result.admitted.map((row) => row.trustTier)).toEqual(["OBSERVED"]);
  expect(result.dimensions.evidence).toBe("incomplete");
  expect(result.claimKind).toBe("self_reported");
});

test("short with a stale record (stale) reads self_reported", () => {
  const result = evaluateControl(twoItems(), [item(), second({ recordedAt: "2026-10-01T00:00:00.000Z", claimedAt: "2026-11-01T00:00:00.000Z" })], context());
  expect(result.admitted.map((row) => row.trustTier)).toEqual(["OBSERVED"]);
  expect(result.dimensions.evidence).toBe("stale");
  expect(result.claimKind).toBe("self_reported");
});

test("contradictory observations read self_reported", () => {
  const result = evaluateControl(control(), [item({ attributes: { decision: "allow", observationKey: "k", observation: "allow" } }),
    second({ attributes: { decision: "allow", observationKey: "k", observation: "deny" } })], context());
  expect(result.admitted.map((row) => row.trustTier)).toEqual(["OBSERVED", "OBSERVED"]);
  expect(result.dimensions.evidence).toBe("contradictory");
  expect(result.claimKind).toBe("self_reported");
});
