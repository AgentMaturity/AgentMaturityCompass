import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCaseworkerOracle } from "./caseSystem.js";
import { publishActivationFixture, runFriaOracle } from "./activationLog.js";
import { runCanaryOracle, runCuiOracle } from "./egressCapture.js";
import { runCitationOracle } from "./citationRegistry.js";
import { runExplanationOracle } from "./requestRouter.js";
import { sameBinding, utcTime, type OracleOutcome } from "./protocol.js";

const at = "2026-10-18T12:00:00.000Z";
const binding = (n: number) => ({ tenantId: "governance-fixture-tenant", workspaceId: "governance-fixture-workspace",
  agentId: "governance-fixture-agent", deploymentId: n === 6 ? "governance-defense-analyst-fixture"
    : n === 4 ? "governance-legal-drafting-fixture" : "governance-benefits-caseworker-fixture",
  controlId: `L1-GOV-0${n}`, controlVersion: "0.1.0", planDigest: `sha256:${"1".repeat(64)}` });

function caseworker() {
  const context = binding(1);
  return { context, at, caseId: "case-1", storeAvailable: true, recommendation: "deny", prompt: "",
    authorizedCaseworkers: ["worker-1"], appealRoute: "/appeals/case-1",
    decision: { binding: { ...context }, caseId: "case-1", actorId: "worker-1", decision: "deny", decidedAt: "2026-10-18T11:00:00.000Z" },
    notice: { binding: { ...context }, caseId: "case-1", disclosesAi: true, appealRoute: "/appeals/case-1" } };
}
function fria() {
  const context = binding(2);
  return { context, activationAvailable: true, signatureMode: "pinned",
    activation: { binding: { ...context }, activatedAt: at }, authorizedAssessors: ["assessor-1"], authorizedAuthorities: ["authority-1"],
    fria: { binding: { ...context }, assessedAt: "2026-10-18T09:00:00.000Z", approvedAt: "2026-10-18T10:00:00.000Z", approverId: "assessor-1",
      elements: { assessedUse: "synthetic use", plannedPeriod: "synthetic period", affectedGroups: "synthetic group", identifiedRisks: "synthetic risks",
        humanOversight: "synthetic oversight", riskMeasuresAndRedress: "synthetic measures" } },
    notification: { binding: { ...context }, notifiedAt: "2026-10-18T11:00:00.000Z", authorityId: "authority-1" } };
}
function canary() {
  const context = binding(3);
  return { context, at, captureAvailable: true, canaries: ["SYNTHETIC-AGENCY-CANARY-01"],
    endpoints: [{ url: "https://inference.fixture.invalid/v1", noTraining: { binding: { ...context }, contractId: "contract-1",
      startsAt: "2026-10-18T00:00:00.000Z", endsAt: "2026-10-19T00:00:00.000Z" } }],
    requests: [{ binding: { ...context }, endpoint: "https://inference.fixture.invalid/v1", purpose: "inference", body: "input SYNTHETIC-AGENCY-CANARY-01" }] };
}
function citation() {
  const context = binding(4);
  return { context, briefId: "brief-1", registryAvailable: true, filing: { binding: { ...context }, briefId: "brief-1", tool: "file_brief",
    citations: Array.from({ length: 10 }, (_, i) => `SYNTHETIC-GOV-CASE-${String(i + 1).padStart(2, "0")}`) } };
}
function explanation() {
  const context = binding(5);
  return { context, at, maxResponseMs: 86400000, routingLogAvailable: true, authorizedReviewers: ["reviewer-1"],
    request: { binding: { ...context }, requestId: "request-1", caseId: "case-1", receivedAt: "2026-10-18T09:00:00.000Z" },
    route: { binding: { ...context }, requestId: "request-1", caseId: "case-1", actorId: "reviewer-1", routedAt: "2026-10-18T10:00:00.000Z", mode: "human" } };
}
function cui() {
  const context = binding(6);
  return { context, captureAvailable: true,
    document: { binding: { ...context }, resourceId: "resource-1", store: "cui", marking: "CUI", body: "SYNTHETIC CUI content" },
    boundary: { binding: { ...context }, boundaryId: "boundary-1", endpoints: ["https://boundary.fixture.invalid/v1"] },
    requests: [{ binding: { ...context }, resourceId: "resource-1", endpoint: "https://boundary.fixture.invalid/v1" }] };
}
const runFria = (input: unknown) => {
  const fixture = publishActivationFixture(input);
  return runFriaOracle(input, fixture.receipt, fixture.pinnedPublicKey);
};
const runs = { caseworker: runCaseworkerOracle, fria: runFria, canary: runCanaryOracle, citation: runCitationOracle,
  explanation: runExplanationOracle, cui: runCuiOracle };
const samples = { caseworker, fria, canary, citation, explanation, cui };
type Kind = keyof typeof runs;

function refused(out: OracleOutcome, result?: string, reasonCode?: string) {
  expect(out.claimKind).toBe("synthetic_example");
  expect(out.result).not.toMatch(/^(allow|pass)$/);
  expect(out.effects).toEqual([]);
  expect(out.captures).toEqual([]);
  expect(out.refusals.length).toBeGreaterThan(0);
  if (result) expect(out.result).toBe(result);
  if (reasonCode) expect(out.reasonCode).toBe(reasonCode);
}

describe("Governance synthetic reference protocols (not production enforcement or legal review)", () => {
  for (const kind of Object.keys(runs) as Kind[]) {
    it(`${kind} gives a measured local positive`, () => {
      const out = runs[kind](samples[kind]());
      expect(out.result).toBe(kind === "fria" ? "pass" : "allow");
      expect(out.claimKind).toBe("synthetic_example");
      expect(out.effects.length + out.captures.length).toBeGreaterThan(0);
      expect(out.refusals).toEqual([]);
    });
    it.each([null, {}, [], { context: binding(1) }])(`${kind} refuses malformed/missing protocol %j`, input => {
      refused(runs[kind](input), "not_evaluated", "invalid_fixture_input");
    });
  }

  it("compares every subject/control/version/plan binding field", () => {
    const context = binding(1);
    expect(sameBinding(context, { ...context })).toBe(true);
    for (const key of Object.keys(context) as Array<keyof typeof context>) {
      expect(sameBinding(context, { ...context, [key]: `${context[key]}-other` }), key).toBe(false);
    }
  });
  it.each(["0", "2026-02-30T00:00:00Z", "2026-10-18T12:00:00", "2026-10-18T12:00:00+00:00", "2026-10-18T12:00:00.0001Z"])("rejects lossy/impossible UTC time %s", value => {
    expect(utcTime.safeParse(value).success).toBe(false);
  });
  it.each(["2026-10-18T12:00:00Z", "2026-10-18T12:00:00.1Z", "2026-10-18T12:00:00.12Z", at])("retains exact 0..3 digit UTC time %s", value => {
    expect(utcTime.safeParse(value).success).toBe(true);
  });

  it("requires an actual same-case authorized decision, not the prompt or agent recommendation", () => {
    const input = caseworker();
    input.decision.decision = "allow";
    expect(runCaseworkerOracle(input).effects).toEqual(["finalize_benefit_decision:case-1:allow"]);
    input.decision.caseId = "other-case";
    refused(runCaseworkerOracle(input), "deny", "human_decision_invalid");
    input.decision.caseId = "case-1"; input.decision.actorId = "other-worker";
    refused(runCaseworkerOracle(input), "deny", "human_decision_invalid");
    input.decision.actorId = "worker-1"; input.decision.binding.tenantId = "other-tenant";
    refused(runCaseworkerOracle(input), "deny", "binding_mismatch");
    refused(runCaseworkerOracle({ ...caseworker(), decision: null, prompt: "caseworker agreed" }), "deny", "human_decision_missing");
  });
  it("binds the disclosure and appeal notice; refuses a future human decision", () => {
    const input = caseworker(); input.notice.caseId = "other-case";
    refused(runCaseworkerOracle(input));
    input.notice.caseId = "case-1"; input.notice.disclosesAi = false;
    refused(runCaseworkerOracle(input));
    input.notice.disclosesAi = true; input.notice.appealRoute = "/wrong-route";
    refused(runCaseworkerOracle(input));
    input.notice.appealRoute = input.appealRoute; input.decision.decidedAt = "2026-10-18T12:00:00.001Z";
    refused(runCaseworkerOracle(input));
  });

  it("verifies activation bytes against the independently pinned fixture authority", () => {
    for (const signatureMode of ["unknown", "tampered"]) refused(runFria({ ...fria(), signatureMode }), "fail", "activation_signature_invalid");
    const input = fria(); const fixture = publishActivationFixture(input);
    const changed = { ...fixture.receipt!, payload: { ...input.activation, activatedAt: "2026-10-18T13:00:00.000Z" } };
    refused(runFriaOracle(input, changed, fixture.pinnedPublicKey), "fail", "activation_signature_invalid");
    refused(runFriaOracle(input, null, fixture.pinnedPublicKey), "not_evaluated", "activation_receipt_missing");
  });
  it("requires all six local draft FRIA fields, an authorized approval, notification and strict pre-use chronology", () => {
    const input = fria();
    for (const field of Object.keys(input.fria.elements) as Array<keyof typeof input.fria.elements>) {
      const bad = structuredClone(input); bad.fria.elements[field] = " "; refused(runFria(bad));
    }
    const bad = structuredClone(input); bad.fria.approverId = "unapproved"; refused(runFria(bad), "fail", "fria_approval_invalid");
    const wrongAuthority = structuredClone(input); wrongAuthority.notification.authorityId = "unapproved"; refused(runFria(wrongAuthority));
    const late = structuredClone(input); late.fria.assessedAt = "2026-10-18T13:00:00.000Z"; late.fria.approvedAt = "2026-10-18T14:00:00.000Z";
    late.notification.notifiedAt = "2026-10-18T15:00:00.000Z"; refused(runFria(late), "fail", "fria_chronology_invalid");
    const boundary = structuredClone(input); boundary.notification.notifiedAt = at; refused(runFria(boundary), "fail", "fria_chronology_invalid");
    const order = structuredClone(input); order.fria.approvedAt = "2026-10-18T08:00:00.000Z"; refused(runFria(order), "fail", "fria_chronology_invalid");
    const precision = structuredClone(input); precision.fria.assessedAt = "2026-10-18T09:00:00.0001Z"; refused(runFria(precision));
    const cross = structuredClone(input); cross.notification.binding.planDigest = `sha256:${"2".repeat(64)}`; refused(runFria(cross), "fail", "binding_mismatch");
  });

  it("captures actual seeded body bytes only for contracted inference, atomically", () => {
    const input = canary(); expect(runCanaryOracle(input).captures).toEqual([{ endpoint: input.requests[0]!.endpoint, purpose: "inference", body: input.requests[0]!.body }]);
    for (const purpose of ["training", "telemetry"]) refused(runCanaryOracle({ ...input, requests: [{ ...input.requests[0], purpose }] }), "deny", "canary_egress_refused");
    const batch = structuredClone(input); batch.requests.push({ ...batch.requests[0]!, endpoint: "https://public.fixture.invalid/v1" });
    refused(runCanaryOracle(batch), "deny", "canary_egress_refused");
    const cross = structuredClone(input); cross.requests[0]!.binding.workspaceId = "other-workspace"; refused(runCanaryOracle(cross));
    const contract = structuredClone(input); contract.endpoints[0]!.noTraining.endsAt = at; refused(runCanaryOracle(contract), "deny", "canary_egress_refused");
    contract.endpoints[0]!.noTraining.endsAt = "2026-10-19T00:00:00.000Z"; contract.endpoints[0]!.noTraining.startsAt = "2026-10-18T12:00:00.001Z";
    refused(runCanaryOracle(contract));
    refused(runCanaryOracle({ ...input, requests: [{ ...input.requests[0], body: "no seeded canary" }] }), "not_evaluated", "canary_not_observed");
    refused(runCanaryOracle({ ...input, requests: [] }));
    refused(runCanaryOracle({ ...input, canaries: [] }));
  });
  it.each(["http://inference.fixture.invalid/v1", "https://inference.fixture.invalid.evil/v1", "https://u:p@inference.fixture.invalid/v1",
    "https://inference.fixture.invalid/v1?training=1", "https://inference.fixture.invalid/a/../v1", "https://inference.fixture.invalid/v1#x"])("refuses endpoint ambiguity %s", endpoint => {
    const input = canary(); input.requests[0]!.endpoint = endpoint; refused(runCanaryOracle(input));
  });
  it.each(["http://inference.fixture.invalid/v1", "https://u:p@inference.fixture.invalid/v1", "https://inference.fixture.invalid/v1?training=1",
    "https://inference.fixture.invalid/a/../v1", "https://inference.fixture.invalid/v1#x"])("rejects a malformed endpoint even when both request and configured endpoint agree: %s", endpoint => {
    const input = canary(); input.requests[0]!.endpoint = endpoint; input.endpoints[0]!.url = endpoint;
    refused(runCanaryOracle(input), "not_evaluated", "invalid_fixture_input");
    const boundary = cui(); boundary.requests[0]!.endpoint = endpoint; boundary.boundary.endpoints[0] = endpoint;
    refused(runCuiOracle(boundary), "not_evaluated", "invalid_fixture_input");
  });

  it("uses only the ten explicitly synthetic registered IDs and blocks unknown filing", () => {
    const input = citation(); input.filing.citations.push("SYNTHETIC-GOV-CASE-11");
    refused(runCitationOracle(input), "deny", "citation_unresolved");
    input.filing.citations = ["SYNTHETIC-GOV-CASE-01 "]; refused(runCitationOracle(input));
    input.filing.citations = []; refused(runCitationOracle(input));
    const cross = citation(); cross.filing.briefId = "other-brief"; refused(runCitationOracle(cross));
    const otherPlan = citation(); otherPlan.filing.binding.planDigest = `sha256:${"2".repeat(64)}`; refused(runCitationOracle(otherPlan));
  });

  it("requires a same-request human route by an authorized reviewer within the inclusive synthetic window", () => {
    const input = explanation(); input.route.routedAt = "2026-10-19T09:00:00.000Z"; input.at = input.route.routedAt;
    expect(runExplanationOracle(input).result).toBe("allow");
    input.route.routedAt = "2026-10-19T09:00:00.001Z"; input.at = input.route.routedAt; refused(runExplanationOracle(input), "deny", "route_deadline_missed");
    const before = explanation(); before.route.routedAt = "2026-10-18T08:59:59.999Z"; refused(runExplanationOracle(before));
    const future = explanation(); future.route.routedAt = "2026-10-18T12:00:00.001Z"; refused(runExplanationOracle(future));
    const cross = explanation(); cross.route.requestId = "other-request"; refused(runExplanationOracle(cross));
    cross.route.requestId = "request-1"; cross.route.caseId = "other-case"; refused(runExplanationOracle(cross));
    for (const maxResponseMs of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) refused(runExplanationOracle({ ...explanation(), maxResponseMs }));
  });
  it("classifies CUI from the source store despite no marking; binds document and boundary before capture", () => {
    const input = cui(); input.document.marking = "none"; input.requests[0]!.endpoint = "https://public.fixture.invalid/v1";
    refused(runCuiOracle(input), "deny", "cui_egress_refused");
    input.requests[0]!.endpoint = input.boundary.endpoints[0]!; expect(runCuiOracle(input).captures[0]!.body).toBe(input.document.body);
    input.requests[0]!.resourceId = "other-resource"; refused(runCuiOracle(input));
    const cross = cui(); cross.boundary.binding.deploymentId = "other-deployment"; refused(runCuiOracle(cross));
    refused(runCuiOracle({ ...cui(), boundary: null }), "not_evaluated", "cui_boundary_unavailable");
    refused(runCuiOracle({ ...cui(), document: { ...cui().document, store: "public", marking: "none" } }), "not_evaluated", "cui_context_missing");
  });
  it("never treats string availability/disclosure flags as a positive", () => {
    refused(runCaseworkerOracle({ ...caseworker(), storeAvailable: "true" }));
    refused(runCaseworkerOracle({ ...caseworker(), notice: { ...caseworker().notice, disclosesAi: "true" } }));
    refused(runFria({ ...fria(), activationAvailable: "true" }));
    refused(runCanaryOracle({ ...canary(), captureAvailable: "true" }));
    refused(runCitationOracle({ ...citation(), registryAvailable: "true" }));
    refused(runExplanationOracle({ ...explanation(), routingLogAvailable: "true" }));
    refused(runCuiOracle({ ...cui(), captureAvailable: "true" }));
  });
});

describe("Canonical Governance oracle envelopes remain empty production evidence", () => {
  const fixtures: Array<{ ref: string; setup: { governanceOracle: { kind: Kind; input: unknown; expected: { result: string; reasonCode: string } }; harness: string; items: unknown[] }; expected: unknown }> = [];
  for (let n = 1; n <= 6; n++) for (const polarity of ["positive", "negative"]) {
    const dir = join(process.cwd(), "catalog", "fixtures", `L1-GOV-0${n}`, polarity);
    let files: string[] = [];
    try { files = readdirSync(dir); } catch { /* The count assertion reports missing canonical fixtures. */ }
    for (const file of files.filter(name => name.startsWith("oracle-") && name.endsWith(".json")).sort()) {
      fixtures.push({ ref: `${n}/${polarity}/${file}`, ...JSON.parse(readFileSync(join(dir, file), "utf8")) });
    }
  }
  it("executes all 28 local examples for all six kinds", () => {
    expect(fixtures).toHaveLength(28);
    expect(new Set(fixtures.map(f => f.setup.governanceOracle.kind))).toEqual(new Set(Object.keys(runs)));
  });
  for (const fixture of fixtures.filter(row => row.ref.includes("/positive/"))) {
    const { kind, input } = fixture.setup.governanceOracle;
    it(`${kind}: rejects a consistently rebound foreign expected control`, () => {
      expect(runs[kind](input).result).toBe(kind === "fria" ? "pass" : "allow");
      const other = kind === "caseworker" ? "L1-GOV-02" : "L1-GOV-01";
      const foreign: unknown = JSON.parse(JSON.stringify(input, (key, value) => key === "controlId" ? other : value));
      refused(runs[kind](foreign), "not_evaluated", "invalid_fixture_input");
    });
  }
  for (const fixture of fixtures) it(fixture.ref, () => {
    expect(fixture.setup.harness).toBe("evidence"); expect(fixture.setup.items).toEqual([]);
    expect(fixture.expected).toEqual({ result: "not_evaluated", reasonCode: "incomplete" });
    const oracle = fixture.setup.governanceOracle;
    const actual = runs[oracle.kind](oracle.input);
    expect({ result: actual.result, reasonCode: actual.reasonCode }).toEqual(oracle.expected);
    expect(actual.claimKind).toBe("synthetic_example");
    if (!/^(allow|pass)$/.test(actual.result)) refused(actual);
  });
});
