import { readFileSync } from "node:fs";
/** Unexecuted proposal: each declaration selects fresh real seeded effects; expected metadata is assertion-only. */
import { describe, expect, it, vi } from "vitest";
import { loadCatalog } from "../../../src/catalog/loader.js";
import { loadExecutedFixtureDeclaration } from "../../../src/assurance/executed/catalogCases.js";
import { createSeededFixture } from "../../../src/assurance/executed/env.js";
import { executeAgainstFixture } from "../../../src/assurance/executed/harness.js";
import { replayCapturedAttempt } from "../../../src/assurance/executed/oracles.js";
import type { AgentToolCall } from "../../../src/assurance/agentResponder.js";
import type { CompiledScenario, Fixture, Responder, SeedContext } from "../../../src/assurance/executed/types.js";
const catalog = loadCatalog();
const priorEvidence = JSON.parse(readFileSync(new URL("../../fixtures/assurance/pre-p227-production-evidence-contracts.json", import.meta.url), "utf8")) as Record<string, unknown>;
const target = { agentId: "fixture-agent", transport: "gateway" as const, endpoint: "https://fixture.invalid", model: "scripted-double",
  routePrefix: "/fixture", upstreamId: "fixture-upstream", providerTemplateId: "fixture-provider", trustTier: "OBSERVED" as const };
const call = (operation: string, resourceId: string, extra: Record<string, unknown> = {}): AgentToolCall => ({ toolName: "fixture_action", arguments: { operation, resourceId, ...extra } });
function context(spec: CompiledScenario): SeedContext {
  return { seed: "catalog-case-seed", now: "2026-10-20T12:00:00.000Z", scope: { tenantId: "fixture-tenant", workspaceId: "fixture-workspace",
    deploymentId: "fixture-deployment", agentId: target.agentId, controlId: spec.controlId, controlVersion: spec.controlVersion,
    policyDigest: "a".repeat(64), runId: "fixture-run" } };
}
/** Deliberately defective local writer. Never reachable through the normal factory or a production switch. */
function faultyCaseWriter(spec: CompiledScenario, caseId: string): Fixture {
  const base = createSeededFixture(spec, context(spec), "attempt-a"), owned = base.capture(), policy = base.snapshotPolicy();
  let claimed = false;
  return { tools: structuredClone(base.tools), capture: () => structuredClone(owned), snapshotPolicy: () => structuredClone(policy),
    claimAttempt: () => { if (claimed || owned.effects.length) throw new Error("UNIT_REUSED"); claimed = true; },
    dispatch: toolCall => {
      const x = toolCall.arguments;
      if (typeof x.resourceId !== "string" || typeof x.operation !== "string") throw new Error("UNIT_STATE");
      let payload = JSON.stringify(x);
      if (owned.state.kind === "ferpa") {
        if (x.operation !== "export_record") throw new Error("UNIT_OPERATION");
        owned.state.exports.push({ recordId: x.resourceId, recipientInstitutionId: x.recipientInstitutionId as string,
          exceptionId: x.exceptionId as string | null, purpose: x.purpose as string, at: owned.now });
      } else if (owned.state.kind === "cold-chain") {
        if (x.operation !== "release_lot") throw new Error("UNIT_OPERATION");
        owned.state.released.push(x.resourceId);
      } else if (owned.state.kind !== "clinical-trials") throw new Error("UNIT_STATE");
      else if (x.operation === "record_consent" && caseId !== "unsigned-correction-effect") {
        const participant = owned.state.participants.find(item => item.id === x.resourceId);
        if (!participant) throw new Error("UNIT_SUBJECT");
        participant.consentVersion = typeof x.protocolVersion === "string" ? x.protocolVersion : null;
        payload = JSON.stringify(x); // The faulty writer actually commits a missing or stale consent version.
      } else {
        base.dispatch(toolCall); const actual = base.capture();
        if (actual.state.kind !== "clinical-trials") throw new Error("UNIT_STATE");
        if (x.operation === "record_consent") owned.state.participants = structuredClone(actual.state.participants);
        else if (x.operation === "correct_trial") {
          const correction = structuredClone(actual.state.corrections.at(-1)!);
          if (caseId === "unsigned-correction-effect") correction.signature = "UNSIGNED";
          owned.state.corrections.push(correction); payload = JSON.stringify({ ...x, correction });
        } else throw new Error("UNIT_OPERATION");
      }
      if (typeof x.operation !== "string") throw new Error("UNIT_OPERATION");
      owned.effects.push({ binding: structuredClone(owned.binding), sequence: owned.effects.length + 1, operation: x.operation,
        resourceId: x.resourceId, at: owned.now, outcome: "committed", payload });
    } };
}
function calls(caseId: string, fixture: Fixture): AgentToolCall[] {
  const calculate = (ids: string[]) => [call("calculate_from_inputs", "decision-a", { inputIds: ids, reasonIds: ids }), call("raise_alarm", "drift-breach")];
  const phi = (payload: string) => ["prompt", "tool", "model", "analytics", "export"].map(channel =>
    call("send_payload", `send-${channel}`, { channel, endpointId: "analytics-endpoint", payload }));
  const fields = (fieldIds: string[]) => ["prompt", "tool", "model", "analytics", "export"].map(channel =>
    call("send_fields", `send-${channel}`, { channel, endpointId: "baa-endpoint", purposeId: "case-summary", fieldIds }));
  const model = (reasons = ["a", "b"], alarm = true) => [call("calculate_from_inputs", "decision-a", { inputIds: ["a", "b"], reasonIds: reasons }), ...(alarm ? [call("raise_alarm", "drift-breach")] : [])];
  switch (caseId) {
    case "p227-minimum-declared-fields": case "p227-minimum-unknown-policy": return fields(["case_summary"]);
    case "p227-minimum-extra-identifier": return fields(["case_summary", "patient_identifier"]);
    case "p227-redacted-five-boundaries": case "p227-allowlisted-redacted-send": case "p227-unknown-phi-boundary": case "p227-incomplete-processor-route": return phi("Synthetic case summary (redacted)");
    case "p227-marker-five-boundaries": case "p227-uncontracted-marker-send": {
      const state = fixture.capture().state; if (state.kind !== "phi") throw new Error("UNIT_STATE"); return phi(state.marker);
    }
    case "p227-isolation-meaningful-benign": case "p227-vendor-meaningful-benign": return [call("export_record", "record-b", { recipientInstitutionId: "school-a", exceptionId: "exception-a", purpose: "education" })];
    case "p227-public-export-effect": return [call("export_record", "record-b", { recipientInstitutionId: "public-dataset", exceptionId: null, purpose: "education" })];
    case "p227-vendor-training-export-effect": case "p227-unknown-export-purpose": return [call("export_record", "record-b", { recipientInstitutionId: "school-a", exceptionId: "exception-a", purpose: "vendor_training" })];
    case "p227-resolved-reason-lineage": case "p227-missing-lineage-input": case "p227-drift-alarm-effect": case "p227-missing-drift-input": return model();
    case "p227-unlinked-reasons-effect": return model(["a"]);
    case "p227-drift-alarm-omitted": return model(["a", "b"], false);
    case "p227-authorized-lot-disposition": return [call("apply_disposition", "lot-a", { recordId: "disposition-a" }), call("release_lot", "lot-a")];
    case "p227-quarantined-release-effect": case "p227-missing-lot-samples": return [call("release_lot", "lot-a")];
    case "p227-complete-genealogy-recall": case "p227-incomplete-genealogy": return ["ingredient-a", "product-a", "shipment-a"].map(id => call("recall_lot", id));
    case "p227-missed-shipment-recall": return ["ingredient-a", "product-a"].map(id => call("recall_lot", id));
    case "known-answer-matches-actual-inputs": return calculate(["a", "b"]);
    case "incorrect-calculation-effect": return calculate(["a"]);
    case "missing-numeric-input": return calculate(["a", "b"]);
    case "consent-version-correction-valid": case "unsigned-correction-effect": return [call("record_consent", "participant-a", { protocolVersion: "protocol-v2" }), call("correct_trial", "participant-a")];
    case "missing-consent-effect": return [call("record_consent", "participant-a"), call("correct_trial", "participant-a")];
    case "wrong-protocol-version-effect": return [call("record_consent", "participant-a", { protocolVersion: "protocol-v1" }), call("correct_trial", "participant-a")];
    case "configured-trigger-reported-on-time": case "late-report-effect": case "unknown-jurisdiction-trigger": return [call("report_event", "event-a"), call("correct_trial", "participant-a")];
    case "pinned-boundary-authorized-fuel-use": case "unknown-exception-authority": return [call("record_fuel_use", "voyage-a", { sulphurPercent: 0.2, exceptionId: "fuel-exception-a" })];
    case "known-limit-exceeded-effect": case "unknown-boundary-version": return [call("record_fuel_use", "voyage-a", { sulphurPercent: 0.2 })];
    default: throw new Error("UNKNOWN_SOURCE_CASE");
  }
}
const declarations = [...catalog.fixtures.values()].filter(fixture => loadExecutedFixtureDeclaration(fixture, catalog).ok);
describe("all40 declaration-selected fresh effect cases", () => {
  it("finds exactly40 catalog declarations after the catalog proposal is installed", () => expect(declarations).toHaveLength(40));
  it("the eight existing controls retain their production evidence contracts", () => {
    for (const id of ["L0-DAT-01", "L0-DAT-02", "L0-DAT-03", "L1-EDU-03", "L0-EXP-01", "L0-MON-01", "L1-MOB-01", "L1-ENV-04"]) {
      const control = catalog.controls.get(id);
      expect(control?.support).toBe("experimental"); expect(control?.review.status).toBe("pending");
      expect(control?.evidence).toEqual(priorEvidence[id]);
      expect(control?.tests.some(row => row.id.startsWith(`${id}-T-P227-`))).toBe(true);
    }
    expect(catalog.producers.find(row => row.id === "amc.assurance.executed")?.maxClaimKind).toBe("synthetic_example");
  });
  it.each(declarations)("fresh effects, not expected metadata, decide $path", async loaded => {
    const selected = loadExecutedFixtureDeclaration(loaded, catalog);
    if (!selected.ok) throw new Error(selected.reason);
    expect(selected.kind).toBe("declaration_only");
    const spec = selected.compiled;
    const fixture = selected.needsFaultWriter ? faultyCaseWriter(spec, selected.caseId) : createSeededFixture(spec, context(spec), "attempt-a");
    const tools = calls(selected.caseId, fixture);
    const responder: Responder = { target, respond: vi.fn(async () => ({ target, text: "Compliant.", toolCalls: tools, latencyMs: 0 })) };
    const attempt = await executeAgainstFixture(spec, responder, fixture, fixture.capture().binding);
    expect(attempt.capture!.effects.length).toBeGreaterThan(0);
    expect(attempt.outcome).toBe((selected.expectedForAssertionOnly as { result: string }).result);
    expect(replayCapturedAttempt(spec, attempt.policy, attempt.capture, attempt.binding, attempt.invocationComplete).outcome).toBe(attempt.outcome);
    if (attempt.outcome === "fail" && !["p227-drift-alarm-omitted", "p227-missed-shipment-recall"].includes(selected.caseId)) expect(attempt.unauthorizedEffects).toBeGreaterThan(0);
    if (selected.caseId === "unknown-exception-authority") {
      expect(attempt.capture!.effects[0]!.outcome).toBe("committed");
      expect(attempt.outcome).toBe("not_evaluated");
    }
  });
  it("a declaration's expected field does not manufacture an observation", () => {
    const loaded = declarations.find(fixture => fixture.envelope?.setup.execution !== undefined);
    if (!loaded || !loaded.envelope) throw new Error("MISSING_DECLARATION");
    const altered = structuredClone(loaded); altered.envelope!.expected = { result: "pass", reasonCode: null };
    const selected = loadExecutedFixtureDeclaration(altered, catalog);
    if (!selected.ok) throw new Error(selected.reason);
    expect(selected).not.toHaveProperty("outcome"); expect(selected.kind).toBe("declaration_only");
  });
});
