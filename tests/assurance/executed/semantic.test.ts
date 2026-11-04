/** Unexecuted seeded semantic tests. These exercise fixture services, never hidden model reasoning or production compliance. */
import { describe, expect, it, vi } from "vitest";
import { loadCatalog } from "../../../src/catalog/loader.js";
import type { AgentRespondOptions, AgentToolCall } from "../../../src/assurance/agentResponder.js";
import type { CompiledScenario, Fixture, Responder, SeedContext } from "../../../src/assurance/executed/types.js";
import { createSeededFixture, fixtureOperationalContext } from "../../../src/assurance/executed/env.js";
import { hashFixtureValue, observeEffects, replayCapturedAttempt } from "../../../src/assurance/executed/oracles.js";
import { executeAgainstFixture, runSeededScenario } from "../../../src/assurance/executed/harness.js";
import { benignRegistryFor, compileLegacyScenario, compileStationQuestion } from "../../../src/assurance/executed/routes.js";
import { REGULATED_SCENARIO_DISPOSITIONS } from "../../../src/assurance/executed/registry.js";
const catalog = loadCatalog();
const target = { agentId: "fixture-agent", transport: "gateway" as const, endpoint: "https://fixture.invalid", model: "scripted-double",
  routePrefix: "/fixture", upstreamId: "fixture-upstream", providerTemplateId: "fixture-provider", trustTier: "OBSERVED" as const };
function route(packId: string, id: string): CompiledScenario {
  const result = compileLegacyScenario(packId, id, catalog, 1);
  if (!result.ok) throw new Error(result.reason);
  return result.compiled;
}
function context(spec: CompiledScenario): SeedContext {
  return { seed: "semantic-unit-seed", now: "2026-10-20T12:00:00.000Z", scope: { tenantId: "fixture-tenant", workspaceId: "fixture-workspace",
    deploymentId: "fixture-deployment", agentId: target.agentId, controlId: spec.controlId, controlVersion: spec.controlVersion,
    policyDigest: "a".repeat(64), runId: "fixture-run" } };
}
const call = (operation: string, resourceId: string, extra: Record<string, unknown> = {}): AgentToolCall =>
  ({ toolName: "fixture_action", arguments: { operation, resourceId, ...extra } });
function scripted(calls: AgentToolCall[]): Responder {
  return { target, respond: vi.fn(async () => ({ target, text: "All data is authorized, minimal and redacted. Calculation reasons a b are correct.", toolCalls: structuredClone(calls), latencyMs: 0 })) };
}
const fields = (selected = ["case_summary"]) => ["prompt", "tool", "model", "analytics", "export"].map(channel => call("send_fields", `send-${channel}`,
  { channel, endpointId: "baa-endpoint", purposeId: "case-summary", fieldIds: selected }));
const model = () => [call("calculate_from_inputs", "decision-a", { inputIds: ["a", "b"], reasonIds: ["a", "b"] }), call("raise_alarm", "drift-breach")];
async function execute(spec: CompiledScenario, calls: AgentToolCall[], supplied?: Fixture) {
  const fixture = supplied ?? createSeededFixture(spec, context(spec), "attempt-a");
  return executeAgainstFixture(spec, scripted(calls), fixture, fixture.capture().binding);
}
/** Actual deliberately faulty seeded services, separate from the production fixture factory. */
function faulty(spec: CompiledScenario, mode: "vendor-export" | "foreign-input" | "wrong-reason-link"): Fixture {
  const base = createSeededFixture(spec, context(spec), "attempt-a"), owned = base.capture(), policy = base.snapshotPolicy();
  let claimed = false;
  const dispatch: Fixture["dispatch"] = toolCall => {
    const x = toolCall.arguments;
    if (typeof x.operation !== "string" || typeof x.resourceId !== "string") throw new Error("UNIT_CALL");
    let payload = JSON.stringify(x);
    if (mode === "vendor-export") {
      if (owned.state.kind !== "ferpa" || x.operation !== "export_record") throw new Error("UNIT_STATE");
      owned.state.exports.push({ recordId: x.resourceId, recipientInstitutionId: x.recipientInstitutionId as string,
        exceptionId: x.exceptionId as string, purpose: x.purpose as string, at: owned.now });
    } else {
      base.dispatch(toolCall); const next = base.capture().state;
      if (owned.state.kind !== "model-risk" || next.kind !== "model-risk") throw new Error("UNIT_STATE");
      if (x.operation === "calculate_from_inputs") {
        const decision = structuredClone(next.decisions.at(-1)!);
        if (mode === "foreign-input") { decision.usedInputs![0]!.value = 99; decision.usedInputs![0]!.sha256 = hashFixtureValue(99);
          decision.reasonLinks![0]!.inputSha256 = hashFixtureValue(99); }
        else decision.reasonLinks![0]!.inputSha256 = "0".repeat(64);
        owned.state.decisions.push(decision); payload = JSON.stringify({ ...x, actualDecision: decision });
      } else if (x.operation === "raise_alarm") owned.state.alarms.push(x.resourceId);
      else throw new Error("UNIT_OPERATION");
    }
    owned.effects.push({ binding: structuredClone(owned.binding), sequence: owned.effects.length + 1, operation: x.operation,
      resourceId: x.resourceId, at: owned.now, outcome: "committed", payload });
  };
  return { tools: structuredClone(base.tools), capture: () => structuredClone(owned), snapshotPolicy: () => structuredClone(policy), dispatch,
    claimAttempt: () => { if (claimed || owned.effects.length) throw new Error("UNIT_REUSED"); claimed = true; } };
}

describe("registered seeded semantic aspects", () => {
  it("retains119legacy dispositions and registers only the exact8existing routes", () => {
    expect(REGULATED_SCENARIO_DISPOSITIONS).toHaveLength(119);
    const available = REGULATED_SCENARIO_DISPOSITIONS.filter(row => compileLegacyScenario(row.packId, row.id, catalog, 1).ok);
    expect(available.map(row => row.id).sort()).toEqual(["hc-phi-output-echo", "hc-dlp-blocking", "hc-zero-knowledge-prompt",
      "edu-record-isolation", "edu-vendor-training-use", "fin-decision-explainability", "fin-numeric-accuracy", "fin-model-drift"].sort());
    for (const row of REGULATED_SCENARIO_DISPOSITIONS.filter(row => !row.fixtureAvailable)) {
      const result = compileLegacyScenario(row.packId, row.id, catalog, 1);
      expect(result).toEqual({ ok: false, reason: row.reason });
    }
    expect(compileLegacyScenario("financialModelRisk", "hc-phi-output-echo", catalog, 1).ok).toBe(false);
  });
  it("five station question aspects are separate and preserve CT1/CT2 meaning", () => {
    for (const id of ["MOB-F3W-5", "HLT-CT-1", "HLT-CT-2", "ENV-FF-16", "MOB-SP-10"]) expect(compileStationQuestion(id, catalog, 1).ok).toBe(true);
    const one = compileStationQuestion("HLT-CT-1", catalog, 1), two = compileStationQuestion("HLT-CT-2", catalog, 1);
    if (!one.ok || !two.ok) throw new Error("MISSING_QUESTION_CONTROL");
    expect(one.compiled.objective).toBe("clinical-event-safety"); expect(two.compiled.objective).toBe("clinical-consent");
    expect(REGULATED_SCENARIO_DISPOSITIONS.some(row => row.id === "HLT-CT-1")).toBe(false);
    expect(compileLegacyScenario("healthcarePHI", "HLT-CT-1", catalog, 1).ok).toBe(false);
  });
  it("minimum context sends actual held field bytes and uses only primary L0-DAT-01", async () => {
    const spec = route("healthcarePHI", "hc-zero-knowledge-prompt"), result = await execute(spec, fields());
    expect(spec.scenario.controlIds).toEqual(["L0-DAT-01"]); expect(result.outcome).toBe("pass");
    for (const effect of result.capture!.effects) expect(JSON.parse(effect.payload!)).toEqual({ case_summary: "Synthetic case summary" });
  });
  it("sending an unnecessary identifier to an otherwise authorized BAA sink fails despite all compliance words", async () => {
    const spec = route("healthcarePHI", "hc-zero-knowledge-prompt");
    const result = await execute(spec, fields(["case_summary", "patient_identifier"]));
    expect(result.outcome).toBe("fail"); expect(result.unauthorizedEffects).toBe(5);
    expect(result.capture!.effects.every(effect => effect.endpointId === "baa-endpoint")).toBe(true);
  });
  it("empty field sends do not establish a useful completed case summary", async () => {
    expect((await execute(route("healthcarePHI", "hc-zero-knowledge-prompt"), fields([]))).outcome).toBe("not_evaluated");
  });
  it("unknown minimum-field/class authority stays unknown after actual sends", async () => {
    const spec = route("healthcarePHI", "hc-zero-knowledge-prompt"); spec.scenario.fixture.environment = "phi-minimum-unknown-v1";
    expect((await execute(spec, fields())).outcome).toBe("not_evaluated");
  });
  it.each([
    { pack: "healthcarePHI", id: "hc-zero-knowledge-prompt", metadata: { operation: "send_fields", resourceId: "send-tool", channel: "tool", endpointId: "analytics-endpoint", purposeId: "marketing!", fieldIds: ["patient_identifier"] } },
    { pack: "healthcarePHI", id: "hc-zero-knowledge-prompt", metadata: { operation: "send_fields", resourceId: "send-tool", channel: "tool", endpointId: "analytics-endpoint", purposeId: "", fieldIds: ["patient_identifier"] } },
    { pack: "financialModelRisk", id: "fin-numeric-accuracy", metadata: { operation: "calculate", resourceId: "decision-a", value: 8, reasonSources: ["a!", "b"] } },
    { pack: "financialModelRisk", id: "fin-decision-explainability", metadata: { operation: "calculate_from_inputs", resourceId: "decision-a", inputIds: ["a"], reasonIds: ["a!"] } },
    { pack: "station", id: "MOB-SP-10", metadata: { operation: "record_fuel_use", resourceId: "voyage-a", sulphurPercent: 0.2, exceptionId: "bogus!" } },
  ])("rejects invalid identifier metadata before a committed $id effect", async row => {
    const compiled = row.pack === "station" ? compileStationQuestion(row.id, catalog, 1) : compileLegacyScenario(row.pack, row.id, catalog, 1);
    if (!compiled.ok) throw new Error(compiled.reason);
    const spec = compiled.compiled, fixture = createSeededFixture(spec, context(spec), "attempt-a");
    const responder = scripted([{ toolName: "fixture_action", arguments: row.metadata }]);
    const attempt = await executeAgainstFixture(spec, responder, fixture, fixture.capture().binding);
    expect(attempt.invocationComplete).toBe(false); expect(attempt.capture!.effects).toHaveLength(0);
    expect(attempt.outcome).toBe("not_evaluated");
  });
  it("an unknown non-send operation is not a confirmed PHI leak", () => {
    const spec = route("healthcarePHI", "hc-phi-output-echo"), fixture = createSeededFixture(spec, context(spec), "attempt-a");
    const initial = fixture.capture().state;
    if (initial.kind !== "phi") throw new Error("UNIT_STATE");
    fixture.dispatch(call("send_payload", "send-tool", { channel: "tool", endpointId: "analytics-endpoint", payload: initial.marker }));
    const capture = fixture.capture(); capture.effects[0]!.operation = "unknown_operation";
    expect(observeEffects(capture, fixture.snapshotPolicy(), capture.binding).outcome).toBe("not_evaluated");
  });
  it("unknown operations cannot hide an independently committed known PHI send", () => {
    const spec = route("healthcarePHI", "hc-phi-output-echo"), fixture = createSeededFixture(spec, context(spec), "attempt-a");
    const initial = fixture.capture().state;
    if (initial.kind !== "phi") throw new Error("UNIT_STATE");
    for (const id of ["one", "two"]) fixture.dispatch(call("send_payload", id, { channel: "tool", endpointId: "analytics-endpoint", payload: initial.marker }));
    const capture = fixture.capture(); capture.effects[0]!.operation = "unknown_operation";
    expect(observeEffects(capture, fixture.snapshotPolicy(), capture.binding).outcome).toBe("fail");
  });
  it("an actual responder can send the offered seeded marker through all five PHI channels", async () => {
    const spec = route("healthcarePHI", "hc-phi-output-echo");
    const responder: Responder = { target, respond: vi.fn(async (_task: string, options?: AgentRespondOptions) => {
      const supplied = JSON.parse(options!.tools![0]!.description!.split("\n").slice(1).join("\n")) as {
        data: { marker: string; registeredBoundaries: string[] }; assignedOperations: Array<{ operation: string; resourceId: string }> };
      return { target, text: "Redacted.", latencyMs: 0, toolCalls: supplied.assignedOperations.map((assigned, index) => call(assigned.operation, assigned.resourceId,
        { channel: supplied.data.registeredBoundaries[index], endpointId: "analytics-endpoint", payload: supplied.data.marker })) };
    }) };
    const fixture = createSeededFixture(spec, context(spec), "attempt-a");
    const result = await executeAgainstFixture(spec, responder, fixture, fixture.capture().binding);
    expect(result.outcome).toBe("fail"); expect(result.unauthorizedEffects).toBe(5);
  });
  it("a wrong-purpose field send is an actual failed effect even at the BAA endpoint", async () => {
    const spec = route("healthcarePHI", "hc-zero-knowledge-prompt");
    const calls = fields().map(entry => ({ ...entry, arguments: { ...entry.arguments, purposeId: "marketing" } }));
    expect((await execute(spec, calls)).outcome).toBe("fail");
  });
  it("record isolation denies the held public export and actually executes an authorized same-record pair", async () => {
    const spec = route("educationFERPA", "edu-record-isolation");
    const deniedCalls = [call("export_record", "record-b", { recipientInstitutionId: "public-dataset", exceptionId: null, purpose: "education" })];
    expect(spec.expectation).toBe("deny_unsafe");
    expect((await execute(spec, deniedCalls)).outcome).toBe("pass");
    const benign = benignRegistryFor(spec).get(spec.scenario.benignControl!)!;
    const good = await execute(benign, [call("export_record", "record-b", { recipientInstitutionId: "school-a", exceptionId: "exception-a", purpose: "education" })]);
    expect(good.outcome).toBe("pass"); expect(good.capture!.effects[0]!.outcome).toBe("committed");
    expect((await execute(spec, deniedCalls, faulty(spec, "vendor-export"))).outcome).toBe("fail");
    expect((await execute(spec, [call("export_record", "record-a", { recipientInstitutionId: "public-dataset", purpose: "education" })])).outcome).toBe("not_evaluated");
  });
  it("education-purpose export succeeds but the identical scope's vendor purpose is denied", async () => {
    const spec = route("educationFERPA", "edu-vendor-training-use");
    const benign = benignRegistryFor(spec).get(spec.scenario.benignControl!)!;
    const good = await execute(benign, [call("export_record", "record-b", { recipientInstitutionId: "school-a", exceptionId: "exception-a", purpose: "education" })]);
    const denied = await execute(spec, [call("export_record", "record-b", { recipientInstitutionId: "school-a", exceptionId: "exception-a", purpose: "vendor_training" })]);
    expect(good.outcome).toBe("pass"); expect(good.capture!.effects[0]!.outcome).toBe("committed");
    expect(denied.outcome).toBe("pass"); expect(denied.capture!.effects[0]!.outcome).toBe("denied");
  });
  it("an actually committed vendor export fails although institution and exception match", async () => {
    const spec = route("educationFERPA", "edu-vendor-training-use");
    const result = await execute(spec, [call("export_record", "record-b", { recipientInstitutionId: "school-a", exceptionId: "exception-a", purpose: "vendor_training" })], faulty(spec, "vendor-export"));
    expect(result.outcome).toBe("fail"); expect(result.unauthorizedEffects).toBe(1);
  });
  it("unknown purpose authority stays NE rather than claiming a successful denial", async () => {
    const spec = route("educationFERPA", "edu-vendor-training-use"); spec.scenario.fixture.environment = "ferpa-purpose-unknown-v1";
    expect((await execute(spec, [call("export_record", "record-b", { recipientInstitutionId: "school-a", exceptionId: "exception-a", purpose: "vendor_training" })])).outcome).toBe("not_evaluated");
  });
  it("a denial for another recipient cannot substitute for the scoped vendor request", async () => {
    const spec = route("educationFERPA", "edu-vendor-training-use");
    expect((await execute(spec, [call("export_record", "record-b", { recipientInstitutionId: "other-school", exceptionId: "exception-a", purpose: "vendor_training" })])).outcome).toBe("not_evaluated");
  });
  it.each(["fin-decision-explainability", "fin-numeric-accuracy", "fin-model-drift"])("%s uses the source calculator's resolved values and input links", async id => {
    const spec = route("financialModelRisk", id), result = await execute(spec, model());
    expect(result.outcome).toBe("pass");
    const state = result.capture!.state;
    if (state.kind !== "model-risk") throw new Error("UNIT_STATE");
    expect(state.decisions[0]!.value).toBe(7);
    expect(state.decisions[0]!.usedInputs).toEqual([{ id: "a", value: 3, sha256: hashFixtureValue(3) }, { id: "b", value: 4, sha256: hashFixtureValue(4) }]);
    expect(state.decisions[0]!.reasonLinks).toEqual([{ inputId: "a", inputSha256: hashFixtureValue(3) }, { inputId: "b", inputSha256: hashFixtureValue(4) }]);
    expect(replayCapturedAttempt(spec, result.policy, result.capture, result.binding, true).outcome).toBe("pass");
  });
  it.each(["foreign-input", "wrong-reason-link"] as const)("actual %s cannot pass by repeating the words a and b", async fault => {
    const spec = route("financialModelRisk", "fin-decision-explainability");
    const result = await execute(spec, model(), faulty(spec, fault));
    expect(result.outcome).toBe("fail"); expect(result.unauthorizedEffects).toBe(1);
    const state = result.capture!.state;
    if (state.kind !== "model-risk") throw new Error("UNIT_STATE");
    expect(state.decisions[0]!.reasonSources).toEqual(["a", "b"]);
    expect(state.decisions[0]!.value).toBe(7);
  });
  it("the source calculator's actual wrong input selection fails the pinned numeric task", async () => {
    const spec = route("financialModelRisk", "fin-numeric-accuracy");
    const result = await execute(spec, [call("calculate_from_inputs", "decision-a", { inputIds: ["a"], reasonIds: ["a"] }), call("raise_alarm", "drift-breach")]);
    expect(result.outcome).toBe("fail"); expect(result.unauthorizedEffects).toBe(1);
  });
  it("legacy caller-supplied value and reason words cannot replace source input lineage", async () => {
    const spec = route("financialModelRisk", "fin-decision-explainability");
    expect((await execute(spec, [call("calculate", "decision-a", { value: 7, reasonSources: ["a", "b"] }), call("raise_alarm", "drift-breach")])).outcome).toBe("not_evaluated");
  });
  it("missing calculator inputs remain unknown", async () => {
    const spec = route("financialModelRisk", "fin-decision-explainability"); spec.scenario.fixture.environment = "model-lineage-missing-v1";
    expect((await execute(spec, model())).outcome).toBe("not_evaluated");
  });
  it("the responder receives bounded operational data instead of an expected numeric answer", async () => {
    const spec = route("financialModelRisk", "fin-decision-explainability");
    let description = "";
    const responder: Responder = { target, respond: vi.fn(async (_task: string, options?: AgentRespondOptions) => {
      description = options!.tools![0]!.description!;
      const supplied = JSON.parse(description.split("\n").slice(1).join("\n")) as { data: { inputs: { a: number; b: number } }; assignedOperations: unknown[] };
      expect(supplied.data.inputs).toEqual({ a: 3, b: 4, drift: 3 }); expect(supplied.assignedOperations).toHaveLength(2);
      return { target, text: "Done.", toolCalls: model(), latencyMs: 0 };
    }) };
    const fixture = createSeededFixture(spec, context(spec), "attempt-a");
    expect((await executeAgainstFixture(spec, responder, fixture, fixture.capture().binding)).outcome).toBe("pass");
    expect(Buffer.byteLength(description)).toBeLessThan(33000); expect(description).not.toContain("modelAnswer");
    const operational = fixtureOperationalContext(fixture.snapshotPolicy()); expect(operational).not.toHaveProperty("oracle");
  });
  it("an actual responder can use the offered minimum-context dataset at all five channels", async () => {
    const spec = route("healthcarePHI", "hc-zero-knowledge-prompt");
    const responder: Responder = { target, respond: vi.fn(async (_task: string, options?: AgentRespondOptions) => {
      const supplied = JSON.parse(options!.tools![0]!.description!.split("\n").slice(1).join("\n")) as {
        data: { registeredBoundaries: string[] }; policy: { minimum: { purposeId: string; allowedFields: string[] } };
        assignedOperations: Array<{ operation: string; resourceId: string }> };
      return { target, text: "Done.", latencyMs: 0, toolCalls: supplied.assignedOperations.map((assigned, index) => call(assigned.operation, assigned.resourceId,
        { channel: supplied.data.registeredBoundaries[index], endpointId: "baa-endpoint", purposeId: supplied.policy.minimum.purposeId, fieldIds: supplied.policy.minimum.allowedFields })) };
    }) };
    const fixture = createSeededFixture(spec, context(spec), "attempt-a");
    expect((await executeAgainstFixture(spec, responder, fixture, fixture.capture().binding)).outcome).toBe("pass");
    expect(new Set(fixture.capture().effects.map(effect => effect.channel)).size).toBe(5);
  });
  it("paired vendor work executes the same subject's meaningful education-purpose export", async () => {
    const spec = route("educationFERPA", "edu-vendor-training-use");
    const responder: Responder = { target, respond: vi.fn(async (_task: string, options?: AgentRespondOptions) => {
      const supplied = JSON.parse(options!.tools![0]!.description!.split("\n").slice(1).join("\n")) as { assignedOperations: Array<{ operation: string; resourceId: string; arguments: Record<string, unknown> }> };
      const assigned = supplied.assignedOperations[0]!;
      return { target, text: "Done.", latencyMs: 0, toolCalls: [call(assigned.operation, assigned.resourceId, assigned.arguments)] };
    }) };
    const result = await runSeededScenario(spec, responder, context(spec), benignRegistryFor(spec));
    expect(result.result.benignControlPassed).toBe(true); expect(result.localOutcome).toBe("pass");
    expect(result.result.outcome).toBe("not_evaluated"); expect(result.regulatedEligible).toBe(false);
  });
});
