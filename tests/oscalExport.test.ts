import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { CompiledPlan, RequirementDecision } from "../src/catalog/compiler/types.js";
import { digestOf } from "../src/catalog/digest.js";
import type { ControlResult } from "../src/catalog/evidence/types.js";
import { loadCatalog, type LoadedCatalog } from "../src/catalog/loader.js";
import { validateCatalog } from "../src/catalog/validate.js";
import type { ControlRecord } from "../src/catalog/types.js";
import { parseControlResults, toOscalAssessmentResults } from "../src/exports/oscal/oscalAssessmentResults.js";
import { AMC_OSCAL_NS, oscalJson, oscalUuid, uuidV5 } from "../src/exports/oscal/oscalIds.js";
import { buildLossReport, type OscalLoss, type OscalLossReport } from "../src/exports/oscal/oscalLoss.js";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { toOscalCatalog } from "../src/exports/oscal/oscalCatalog.js";
import { AS_OF, createCompilerFixture, makeProfile } from "./catalog/compiler/helpers.js";
import { tmpdir } from "node:os";
import { compilePlan } from "../src/catalog/compiler/compile.js";
import { assertSignedPlan, signPlan } from "../src/catalog/compiler/sign.js";
import { signingRoute } from "../src/crypto/signing/signer.js";
import { toOscalProfile } from "../src/exports/oscal/oscalProfile.js";
import { lockVault, vaultStatus } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";
import { Ajv, type ValidateFunction } from "ajv";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runCatalogCompile } from "../src/catalog/catalogCli.js";
import { evaluateControl } from "../src/catalog/evidence/evaluate.js";
import { writeSignedControlResults } from "../src/catalog/evidence/signedResults.js";

const addFormats: import("ajv-formats").FormatsPlugin = createRequire(import.meta.url)("ajv-formats");

// This is the actual built command, not a direct runOscalExportCli call.
// Reuse the repo's spawnSync/process.execPath pattern with a portable module-relative entrypoint.
// Inherit the unchanged environment and harness deadline; do not override mode, signing or trust.
function runOscalCommand(workspace: string, args: string[]) {
  const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
  expect(existsSync(cli), "Build the candidate before exercising its real CLI.").toBe(true);
  const result = spawnSync(process.execPath, [cli, "export", "oscal", ...args], { cwd: workspace, encoding: "utf8" });
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

// OSCAL 1.2.3 schemas: pinned stored whitespace-only bytes; raw published hashes remain in the vendor README.
// Schema conformance checks structure only; it does not establish claim truth or signature integrity.
function compileOfficialOscalSchema(file: string, sha256: string): ValidateFunction {
  const bytes = readFileSync(new URL("../spec/vendor/oscal/1.2.3/" + file, import.meta.url));
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(sha256);
  const ajv = new Ajv({ allErrors: true, unicodeRegExp: true, validateFormats: true, validateSchema: true });
  addFormats(ajv, { mode: "full", keywords: true });
  return ajv.compile(JSON.parse(bytes.toString("utf8")));
}

// Compile all three pinned schemas once, with unchanged AJV strict defaults and no document normalization.
const officialOscalValidators = {
  catalog: compileOfficialOscalSchema("oscal_catalog_schema.json",
    "56289f43910d0a9ddf3eab24c7f206492cb7b041b8cb3caff6ac52d89c58f7ff"),
  profile: compileOfficialOscalSchema("oscal_profile_schema.json",
    "0e7b06623f8f4a0e64142fe7af4364a8d27c383e1db1281c7d538e3a7e454d6a"),
  assessment: compileOfficialOscalSchema("oscal_assessment-results_schema.json",
    "671524c85034f53d107dcc5125a7d66b8d4529caaec051f788817c0551b93cc5")
};
type OscalSchemaModel = keyof typeof officialOscalValidators;

function assertOfficialOscalSchema(model: OscalSchemaModel, document: unknown): void {
  const validate = officialOscalValidators[model];
  expect(validate(document), JSON.stringify(validate.errors)).toBe(true);
}

function expectOfficialOscalSchemaError(model: OscalSchemaModel, document: unknown, instancePath: string, keyword: string): void {
  const validate = officialOscalValidators[model];
  expect(validate(document)).toBe(false);
  expect(validate.errors).toEqual(expect.arrayContaining([expect.objectContaining({ instancePath, keyword })]));
}

// This helper-only section is separate from the loader-backed catalog group below.
// Complete in-memory algorithm fixtures only. No catalog loader, compiler, signature, producer admission,
// schema validator, CLI, evidence execution or legal review is exercised. Claim/status strings are supplied inputs.
// Converter remarks describe its real CLI caller contract; they are not a signature receipt for these unit inputs.
const IDS = ["L1-UNIT-01", "L1-UNIT-02", "L1-UNIT-03"] as const;
const WINDOW = { start: "2026-10-01T00:00:00.000Z", end: "2026-10-31T23:59:59.000Z" };
const FILE_DIGEST_INPUT = "f".repeat(64); // Opaque caller-supplied unit value, not a signed-file digest witness.

function unitControl(id: string): ControlRecord {
  return {
    id, version: "1.0.0", support: "experimental", layer: 1, family: null, stations: ["technology"],
    title: "Unit transform input", statement: "A labelled unit input retains its claim.",
    riskRationale: "Algorithm fixture only.", mandatory: false,
    applicability: { predicate: { always: true }, reasons: ["unit input"], exclusions: [] }, citations: [],
    binding: { kind: "manual", points: [], mechanism: "unit input only", parameters: [],
      manualDuty: { duty: "unit input", ownerRole: "head_of_qa", cadence: "unit", evidenceOfPerformance: "unit reference" } },
    tests: [], evidence: [], invalidatedBy: [], owner: { role: "head_of_qa" }, clock: null, levels: ["L1"],
    crosswalk: [], review: { status: "pending", expert: null, credential: null, reviewedAt: null, nextReview: null },
    provenance: { draftedBy: "ai", draftedAt: "2026-10-01", approvedBy: null }
  };
}

function unitCatalog(): LoadedCatalog {
  return {
    root: "unit-memory-only", manifest: null, vocabulary: null, producers: [], publisherHosts: [],
    packs: new Map(), controls: new Map(IDS.map(id => [id, unitControl(id)])),
    controlFiles: new Map(), fixtures: new Map(), issues: [], crossStationProfiles: []
  };
}

function unitPlan(cat: LoadedCatalog): CompiledPlan {
  const controls = [...cat.controls.values()];
  const plan: CompiledPlan = {
    planVersion: 1, compiler: { name: "amc-catalog-compiler", version: "unit-input" },
    profile: { profileId: "p128-unit-input", sha256: "a".repeat(64), factProvenance: {
      stations: "asserted", primaryStation: "asserted", domains: "asserted", jurisdictions: "asserted", roles: "asserted",
      entityTypes: "asserted", riskClass: "asserted", useCases: "asserted", dataClasses: "asserted"
    } },
    lock: {
      lockfileVersion: 1, generatedBy: { tool: "agent-maturity-compass", version: "unit-input" },
      catalog: { id: "p128-unit-input", version: "1.0.0", digest: digestOf({ unit: "catalog" }) }, packs: [],
      controls: controls.map(control => ({ id: control.id, version: control.version, pack: "unit", digest: digestOf(control) })),
      sources: [], register: { path: "src/compliance/regulatory/register.json", schemaVersion: 1, digest: digestOf({ unit: "register" }) },
      producers: { digest: digestOf([]) }, vocabulary: { digest: digestOf(null) }
    },
    status: "blocked", requirements: controls.map((control): RequirementDecision => ({
      controlId: control.id, controlVersion: control.version, controlDigest: digestOf(control), layer: control.layer,
      applicability: "applicable", reasons: ["supplied unit decision"], missingFacts: [], exclusion: null,
      citationsInScope: [], mandatory: false, support: "experimental", pulledInBy: []
    })),
    conflicts: [], unsupported: [], crosswalkLinks: [],
    runtimePolicy: {
      toolPipeline: { visibleTools: [], approvalRequiredFor: [], guards: [] }, approvals: {},
      egress: { mode: "deny_by_default", allowHosts: [], processorAllowlist: [], controlIds: [] },
      deletion: { unknownHold: "deny", retentionDays: {}, controlIds: [] },
      proposedSignedConfigs: { approvalPolicy: null, budgets: null, tools: null, actionPolicy: null, firewall: null, opsPolicy: null },
      policyDigest: digestOf({ unit: "policy" })
    },
    evidencePlan: { tests: [], evidenceRequests: [], manualDuties: [], releaseGates: [] }, digest: ""
  };
  const { digest: _digest, ...payload } = plan;
  return { ...plan, digest: digestOf(payload) };
}

// Fixture preparation, not an independent producer check: the public digest helper is tested against literal JSON below.
function withOwnDigest(result: ControlResult): ControlResult {
  const { evaluatedAt: _at, digest: _digest, ...payload } = result;
  return { ...result, digest: digestOf({ ...payload, dimensions: { ...payload.dimensions, review: "pending" } }).slice(7) };
}

function unitResult(plan: CompiledPlan, overrides: Partial<ControlResult> = {}): ControlResult {
  const control = unitControl(overrides.controlId ?? IDS[0]);
  return withOwnDigest({
    resultVersion: 1, controlId: control.id, controlVersion: control.version, controlDigest: digestOf(control), planDigest: plan.digest,
    subject: { tenantId: "unit-tenant", workspaceId: "unit-workspace", deploymentId: null, agentId: null, subjectId: "unit-subject" },
    window: { ...WINDOW }, dimensions: { applicability: { state: "applicable" }, evidence: "sufficient", result: "pass",
      enforcement: { state: "observed" }, review: "pending" },
    claimKind: "observed", claimReasons: [],
    admitted: [{ ref: { kind: "ledger_event", id: "unit-reference", sha256: "c".repeat(64) }, producerId: "unit-input", trustTier: "OBSERVED" }],
    rejected: [{ ref: { kind: "external", id: "unit-rejected", sha256: "d".repeat(64) }, reason: "binding_missing", detail: "unit missing binding" }],
    reasons: ["supplied unit transform input"], evaluatedAt: "2026-10-30T00:00:00.000Z",
    evaluator: { name: "amc", version: "unit-input" }, digest: "", ...overrides
  });
}

interface Prop { name: string; ns: string; value: string }
interface Observation {
  uuid: string; props: Prop[]; collected: string;
  "relevant-evidence": Array<{ props: Prop[]; remarks?: string }>;
}
interface AssessmentDocument {
  "assessment-results": {
    metadata: { "last-modified": string; props: Prop[] };
    results: Array<{
      start: string; end: string; observations: Observation[];
      findings?: Array<{ props: Prop[]; target: { type: string; "target-id": string; status: { state: string; reason: string } } }>;
      "reviewed-controls": { "control-selections": Array<{ "include-controls": Array<{ "control-id": string }> }> };
    }>;
    "import-ap": { href: string };
    "back-matter": { resources: Array<{ uuid: string; props: Prop[] }> };
  };
}

function assessmentRows(results: readonly ControlResult[], plan: CompiledPlan) {
  const output = toOscalAssessmentResults(results, plan, FILE_DIGEST_INPUT);
  if (output.document === null) throw new Error("unit nonempty results unexpectedly have no document");
  // Projection of asserted output fields only; no fixture is cast to a verified catalog, result or SignedPlan.
  const document = output.document as AssessmentDocument;
  return { output, document, rows: document["assessment-results"].results };
}

const uuidBindings = [
  { kind: "control", id: "L1-UNIT-01", literalName: "control:L1-UNIT-01" },
  { kind: "observation", id: "L1-UNIT-01", literalName: "observation:L1-UNIT-01" },
  { kind: "control", id: "L1-UNIT-02", literalName: "control:L1-UNIT-02" }
] as const;

describe("OSCAL offline identity and JSON contracts", () => {
  it("matches a fixed UUIDv5 algorithm vector", () => {
    expect(uuidV5("6ba7b810-9dad-11d1-80b4-00c04fd430c8", "www.example.com"))
      .toBe("2ed6657d-e927-568b-95e1-2665a8aea6a2");
  });

  it.each(uuidBindings)("binds the fixed namespace and $literalName", ({ kind, id, literalName }) => {
    // Independent fixed namespace/name preimage, never copied from an AMC helper return.
    const hex = createHash("sha1").update(Buffer.from("502e72b214be45078154dcf6aa03f245", "hex"))
      .update(literalName, "utf8").digest("hex");
    const expected = hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-5" + hex.slice(13, 16) + "-"
      + ((Number.parseInt(hex[16]!, 16) & 3) | 8).toString(16) + hex.slice(17, 20) + "-" + hex.slice(20, 32);
    expect(oscalUuid(kind, id)).toBe(expected);
    expect(oscalUuid(kind, id)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(oscalUuid(kind, id)).toBe(oscalUuid(kind, id));
  });

  it("uses literal sorted-key JSON, keeps array order and hashes that exact semantic input", () => {
    const input = { z: [3, 2, 1], a: { z: 1, a: "x" } };
    const literalCanonical = '{"a":{"a":"x","z":1},"z":[3,2,1]}';
    const literalIndented = '{\n  "a": {\n    "a": "x",\n    "z": 1\n  },\n  "z": [\n    3,\n    2,\n    1\n  ]\n}\n';
    const before = JSON.stringify(input);
    expect(oscalJson(input)).toBe(literalIndented);
    expect(oscalJson({ a: { a: "x", z: 1 }, z: [3, 2, 1] })).toBe(literalIndented);
    expect(oscalJson({ a: { a: "x", z: 1 }, z: [1, 2, 3] })).not.toBe(literalIndented);
    expect(digestOf(input)).toBe("sha256:" + createHash("sha256").update(literalCanonical, "utf8").digest("hex"));
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe("OSCAL loss report on unit inputs", () => {
  it("preserves positive loss facts, drops zero rows and orders models then fields without changing inputs", () => {
    const inputs: OscalLossReport["inputs"] = [{ kind: "plan", digest: "unit-plan-digest" }];
    const catalogA: OscalLoss = { model: "catalog", amcField: "a", count: 2, disposition: "prop", note: "unit opaque field" };
    const catalogZ: OscalLoss = { model: "catalog", amcField: "z", count: 1, disposition: "omitted", note: "unit omitted field" };
    const profile: OscalLoss = { model: "profile", amcField: "a", count: 3, disposition: "remarks", note: "unit decision reason" };
    const assessment: OscalLoss = { model: "assessment-results", amcField: "a", count: 4, disposition: "prop", note: "unit claim field" };
    const zero: OscalLoss = { model: "catalog", amcField: "zero", count: 0, disposition: "omitted", note: "unit no values" };
    const losses = Object.freeze([assessment, catalogZ, zero, profile, catalogA]);
    const before = JSON.stringify({ inputs, losses });
    const report = buildLossReport(inputs, losses);
    expect(report).toEqual({ schemaVersion: "amc.oscal-loss/1", oscalVersion: "1.2.3", inputs,
      losses: [catalogA, catalogZ, profile, assessment] });
    expect(report.inputs).not.toBe(inputs);
    expect(report.losses).not.toBe(losses);
    expect(JSON.stringify({ inputs, losses })).toBe(before);
  });
});

const mappingCases: ReadonlyArray<{
  name: string; claimKind: "observed" | "self_reported" | "synthetic_example";
  result: ControlResult["dimensions"]["result"]; finding: "satisfied" | "not-satisfied" | null;
}> = [
  { name: "observed pass", claimKind: "observed", result: "pass", finding: "satisfied" },
  { name: "observed fail", claimKind: "observed", result: "fail", finding: "not-satisfied" },
  { name: "self-reported fail", claimKind: "self_reported", result: "fail", finding: "not-satisfied" },
  { name: "observed not evaluated", claimKind: "observed", result: "not_evaluated", finding: null },
  { name: "self-reported not evaluated", claimKind: "self_reported", result: "not_evaluated", finding: null },
  { name: "synthetic not evaluated", claimKind: "synthetic_example", result: "not_evaluated", finding: null },
  { name: "self-reported pass", claimKind: "self_reported", result: "pass", finding: null }
];

describe("OSCAL assessment conversion on supplied unit claims", () => {
  it.each(mappingCases)("keeps $name without upgrading it", row => {
    const catalog = unitCatalog(), plan = unitPlan(catalog);
    const base = unitResult(plan);
    const input = unitResult(plan, { claimKind: row.claimKind, claimReasons: row.claimKind === "synthetic_example" ? ["SYNTHETIC_VALUES"] : [],
      dimensions: { ...base.dimensions, result: row.result, evidence: row.result === "not_evaluated" ? "incomplete" : "sufficient" } });
    const before = JSON.stringify({ input, plan });
    const { output, rows } = assessmentRows([input], plan);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.observations).toHaveLength(1);
    const observation = rows[0]!.observations[0]!;
    expect(observation.props).toEqual(expect.arrayContaining([
      { name: "result", ns: AMC_OSCAL_NS, value: row.result }, { name: "claim-kind", ns: AMC_OSCAL_NS, value: row.claimKind },
      { name: "applicability", ns: AMC_OSCAL_NS, value: "applicable" },
      { name: "evidence", ns: AMC_OSCAL_NS, value: input.dimensions.evidence },
      { name: "enforcement", ns: AMC_OSCAL_NS, value: "observed" }, { name: "review", ns: AMC_OSCAL_NS, value: "pending" }
    ]));
    expect(observation.props.every(prop => prop.ns === AMC_OSCAL_NS)).toBe(true);
    expect(rows[0]!["reviewed-controls"]["control-selections"]).toEqual([{ "include-controls": [{ "control-id": IDS[0] }] }]);
    if (row.finding === null) expect(rows[0]!.findings).toBeUndefined();
    else {
      expect(rows[0]!.findings).toHaveLength(1);
      expect(rows[0]!.findings![0]!.target).toEqual({ type: "statement-id", "target-id": IDS[0] + "_smt",
        status: { state: row.finding, reason: row.result } });
    }
    expect(output.losses.find(loss => loss.amcField === "results[].dimensions.result=not_evaluated")?.count)
      .toBe(row.result === "not_evaluated" ? 1 : 0);
    expect(output.losses.find(loss => loss.amcField === "results[].dimensions.result=pass (self_reported)")?.count)
      .toBe(row.result === "pass" && row.claimKind === "self_reported" ? 1 : 0);
    if (row.claimKind === "synthetic_example") expect(observation.props).toContainEqual({ name: "claim-reason", ns: AMC_OSCAL_NS, value: "SYNTHETIC_VALUES" });
    expect(JSON.stringify({ input, plan })).toBe(before);
  });

  it("carries reference identities and rejection facts without raw evidence content", () => {
    const plan = unitPlan(unitCatalog()), input = unitResult(plan);
    const { document, rows } = assessmentRows([input], plan);
    const evidence = rows[0]!.observations[0]!["relevant-evidence"];
    expect(evidence).toHaveLength(2);
    expect(evidence[0]!.props).toEqual(expect.arrayContaining([
      { name: "evidence-id", ns: AMC_OSCAL_NS, value: "unit-reference" },
      { name: "evidence-sha256", ns: AMC_OSCAL_NS, value: "c".repeat(64) },
      { name: "admission", ns: AMC_OSCAL_NS, value: "admitted" }
    ]));
    expect(evidence[1]!.props).toContainEqual({ name: "rejection-reason", ns: AMC_OSCAL_NS, value: "binding_missing" });
    expect(evidence[1]!.remarks).toBe("unit missing binding");
    const assessment = document["assessment-results"], resource = assessment["back-matter"].resources[0]!;
    expect(assessment["import-ap"].href).toBe("#" + resource.uuid);
    expect(resource.props).toContainEqual({ name: "plan-digest", ns: AMC_OSCAL_NS, value: plan.digest });
    expect(oscalJson(document)).not.toContain('"content":');
  });

  it("returns no document or losses for empty results", () => {
    expect(toOscalAssessmentResults([], unitPlan(unitCatalog()), FILE_DIGEST_INPUT)).toEqual({ document: null, losses: [] });
  });

  it("groups normalized windows deterministically and takes metadata time from supplied results", () => {
    const plan = unitPlan(unitCatalog());
    const inputs = Object.freeze([
      unitResult(plan, { controlId: IDS[2], evaluatedAt: "2026-10-31T00:00:00.000Z" }),
      unitResult(plan, { controlId: IDS[1], window: { start: "2026-09-01T00:00:00+00:00", end: "2026-09-30T23:59:59+00:00" }, evaluatedAt: "2026-09-30T00:00:00.000Z" }),
      unitResult(plan, { controlId: IDS[0] })
    ]);
    const before = JSON.stringify({ inputs, plan });
    const first = assessmentRows(inputs, plan), second = assessmentRows([...inputs].reverse(), plan);
    expect(oscalJson(first.output)).toBe(oscalJson(second.output));
    expect(oscalJson(first.output)).toBe(oscalJson(assessmentRows(inputs, plan).output));
    expect(first.rows.map(row => [row.start, row.end])).toEqual([
      ["2026-09-01T00:00:00.000Z", "2026-09-30T23:59:59.000Z"], [WINDOW.start, WINDOW.end]
    ]);
    expect(first.rows.map(row => row.observations.length)).toEqual([1, 2]);
    expect(first.document["assessment-results"].metadata["last-modified"]).toBe("2026-10-31T00:00:00.000Z");
    expect(JSON.stringify({ inputs, plan })).toBe(before);
  });
});

const semanticEdits: ReadonlyArray<{ name: string; edit: (result: ControlResult) => ControlResult; error: RegExp }> = [
  { name: "unknown control", edit: row => ({ ...row, controlId: "L1-UNIT-99" }), error: /names no control in the shipped catalog/ },
  { name: "changed control version", edit: row => ({ ...row, controlVersion: "2.0.0" }), error: /is for another version/ },
  { name: "changed control digest", edit: row => ({ ...row, controlDigest: "sha256:" + "e".repeat(64) }), error: /is for another version/ },
  { name: "different plan", edit: row => ({ ...row, planDigest: "sha256:" + "f".repeat(64) }), error: /was evaluated under plan/ },
  { name: "different applicability", edit: row => ({ ...row, dimensions: { ...row.dimensions,
    applicability: { state: "not_applicable", rationale: "unit exclusion" }, result: "not_evaluated" } }), error: /says applicability not_applicable, the plan says applicable/ },
  { name: "synthetic pass", edit: row => ({ ...row, claimKind: "synthetic_example" }), error: /evaluateControl cannot produce/ },
  { name: "synthetic fail", edit: row => ({ ...row, claimKind: "synthetic_example", dimensions: { ...row.dimensions, result: "fail" } }), error: /evaluateControl cannot produce/ },
  { name: "pass with incomplete evidence", edit: row => ({ ...row, dimensions: { ...row.dimensions, evidence: "incomplete" } }), error: /evaluateControl cannot produce/ }
];

describe("OSCAL results parser on coherent unsigned unit inputs", () => {
  it("accepts shape and unkeyed coherence without proving a signature or producer", () => {
    const catalog = unitCatalog(), plan = unitPlan(catalog), result = unitResult(plan);
    expect(parseControlResults([result], plan, catalog)).toEqual([result]);
  });

  it("keeps evaluatedAt and review outside the own-result digest", () => {
    const catalog = unitCatalog(), plan = unitPlan(catalog), result = unitResult(plan);
    const changed: ControlResult = { ...result, evaluatedAt: "2026-10-31T00:00:00.000Z", dimensions: { ...result.dimensions, review: "approved" } };
    expect(withOwnDigest(changed).digest).toBe(result.digest);
    expect(parseControlResults([changed], plan, catalog)).toEqual([changed]);
    expect(() => parseControlResults([result, changed], plan, catalog)).toThrow(/appears twice/);
  });

  it("allows distinct result digests for one control in different windows", () => {
    const catalog = unitCatalog(), plan = unitPlan(catalog), first = unitResult(plan);
    const second = unitResult(plan, { window: { start: "2026-09-01T00:00:00.000Z", end: "2026-09-30T23:59:59.000Z" } });
    expect(second.controlId).toBe(first.controlId);
    expect(second.digest).not.toBe(first.digest);
    expect(parseControlResults([first, second], plan, catalog)).toEqual([first, second]);
  });

  it("refuses an edited value that retains its old own-result digest", () => {
    const catalog = unitCatalog(), plan = unitPlan(catalog), result = unitResult(plan);
    expect(() => parseControlResults([{ ...result, reasons: ["unit edit after digest"] }], plan, catalog))
      .toThrow(/does not match its digest \(edited after evaluation\)/);
  });

  it.each(semanticEdits)("reaches the $name semantic guard after recomputing the unit own digest", ({ edit, error }) => {
    const catalog = unitCatalog(), plan = unitPlan(catalog), result = unitResult(plan);
    expect(parseControlResults([result], plan, catalog)).toEqual([result]);
    const edited = withOwnDigest(edit(result));
    expect(() => parseControlResults([edited], plan, catalog)).toThrow(error);
  });

  it("refuses strict-shape edits and an independently-reviewed claim kind", () => {
    const catalog = unitCatalog(), plan = unitPlan(catalog), result = unitResult(plan);
    const malformed: unknown[] = [{ ...result, extraUnitField: true }, { ...result, claimKind: "independently_reviewed" },
      { ...result, window: { ...result.window, start: "not-an-ISO-time" } }];
    for (const raw of malformed) expect(() => parseControlResults([raw], plan, catalog)).toThrow(/not a list of version 1 control results/);
    expect(() => parseControlResults(result, plan, catalog)).toThrow(/not a list of version 1 control results/);
  });
});

// Additional catalog transforms use the existing explicitly synthetic loader/validator fixture.
// Its profile labels and citation text are supplied test data, not human review, evidence or schema conformance.
// No plan is compiled or signed, and the namespace is checked for consistency only, never approved here.
interface CatalogControlOutput {
  id: string;
  title: string;
  props: Prop[];
  parts: Array<{ id?: string; name: string; ns?: string; prose: string }>;
  links?: Array<{ href: string; rel: string; text: string }>;
}
interface CatalogOutputDocument {
  catalog: {
    uuid: string;
    metadata: { title: string; version: string; "last-modified": string; "oscal-version": string; props: Prop[] };
    groups: Array<{ id: string; title: string; props: Prop[]; controls: CatalogControlOutput[] }>;
    controls?: CatalogControlOutput[];
    "back-matter"?: { resources: Array<{
      uuid: string; title: string; props: Prop[];
      rlinks: Array<{ href: string; hashes?: Array<{ algorithm: string; value: string }> }>;
    }> };
  };
}

function catalogSnapshot(catalog: LoadedCatalog): string {
  return JSON.stringify(catalog, (_key, value: unknown) => value instanceof Map ? [...value] : value);
}

describe("OSCAL catalog transform on the real synthetic compiler fixture", () => {
  it("keeps literal controls, statements, structured fields, citation and informational crosswalk", () => {
    const fixture = createCompilerFixture();
    try {
      const output = toOscalCatalog(fixture.catalog);
      const document = output.document as CatalogOutputDocument;
      const catalog = document.catalog;
      expect(Object.keys(document)).toEqual(["catalog"]);
      expect(catalog.metadata).toMatchObject({
        title: "AMC Regulated Control Catalog (experimental)", version: "0.1.0",
        "last-modified": "2026-10-16T00:00:00.000Z", "oscal-version": "1.2.3"
      });
      expect(catalog.metadata.props).toContainEqual({ name: "catalog-id", ns: AMC_OSCAL_NS, value: "amc.fixture.compiler" });
      expect(catalog.groups.map(group => [group.id, group.title])).toEqual([
        ["amc.fixture.baseline", "Synthetic baseline compiler fixture"],
        ["amc.fixture.crosswalk-target", "Synthetic crosswalk-target compiler fixture"],
        ["amc.fixture.technology", "Synthetic technology compiler fixture"],
        ["amc.fixture.us", "Synthetic us compiler fixture"],
        ["amc.fixture.wealth", "Synthetic wealth compiler fixture"]
      ]);
      const controls = catalog.groups.flatMap(group => group.controls);
      expect(controls.map(control => control.id).sort()).toEqual([
        "L0-FIX-01", "L1-FIX-TEC-01", "L1-FIX-WLT-01", "L2-FIX-US-01", "L3-FIX-XB-01"
      ]);
      expect(catalog).not.toHaveProperty("controls");
      const baseline = controls.find(control => control.id === "L0-FIX-01");
      expect(baseline?.title).toBe("Synthetic baseline control");
      expect(baseline?.parts).toEqual([
        { id: "L0-FIX-01_smt", name: "statement", prose: "The compiler retains this explicitly synthetic planning requirement when its own predicate matches." },
        { name: "risk-rationale", ns: AMC_OSCAL_NS, prose: "Exercise planning branches without depending on unreviewed catalog content or claiming real enforcement." }
      ]);
      expect(baseline?.props).toEqual(expect.arrayContaining([
        { name: "version", ns: AMC_OSCAL_NS, value: "0.1.0" },
        { name: "support", ns: AMC_OSCAL_NS, value: "experimental" },
        { name: "applicability", ns: AMC_OSCAL_NS, value: '{"exclusions":[],"predicate":{"always":true},"reasons":["Synthetic compiler test data only."]}' },
        { name: "binding", ns: AMC_OSCAL_NS, value: '{"kind":"enforcement_point","manualDuty":null,"mechanism":"Synthetic planning binding only; no tool body or enforcement has run.","parameters":[{"name":"toolPipeline.requirePrincipal","strictness":"true_wins","value":true}],"points":["tool_pipeline"]}' }
      ]));
      expect(catalog.groups[0]?.props).toContainEqual({ name: "layer", ns: AMC_OSCAL_NS, value: "0" });
      expect(catalog.groups[0]?.props.filter(prop => prop.name === "station").map(prop => prop.value)).toEqual([
        "education", "environment", "health", "wealth", "technology", "mobility", "governance"
      ]);
      const resources = catalog["back-matter"]?.resources;
      expect(resources).toHaveLength(1);
      const citation = resources?.[0];
      expect(citation?.title).toBe("HIPAA Security Rule: synthetic compiler citation-scope fixture, 45 CFR 164.312(a)(1)");
      expect(citation?.rlinks).toEqual([
        { href: "https://www.govinfo.gov/content/pkg/CFR-2024-title45-vol2/xml/CFR-2024-title45-vol2-sec164-312.xml" }
      ]);
      expect(citation?.props).toContainEqual({ name: "control-id", ns: AMC_OSCAL_NS, value: "L0-FIX-01" });
      // This is a cross-reference relationship; the independent UUID vectors above test the identity algorithm.
      expect(baseline?.links).toEqual([
        { href: "#" + citation?.uuid, rel: "reference",
          text: "HIPAA Security Rule: synthetic compiler citation-scope fixture, 45 CFR 164.312(a)(1) (Unverified synthetic planning fixture; no legal approval)" }
      ]);
      const wealth = controls.find(control => control.id === "L1-FIX-WLT-01");
      expect(wealth?.props).toContainEqual({ name: "crosswalk", ns: AMC_OSCAL_NS,
        value: '{"clause":"L3-FIX-XB-01","framework":"fixture-controls","rationale":"Deliberately synthetic A-to-B link: never causes B to be selected.","relation":"equivalent"}' });
      expect(catalog).not.toHaveProperty("imports");
      expect(document).not.toHaveProperty("profile");
      expect(document).not.toHaveProperty("assessment-results");
      expect(oscalJson(document)).not.toContain('"satisfied"');

      // Literal counts come from the five authored controls/packs, ten fixture files and one unverified citation.
      const report = buildLossReport([{ kind: "catalog", digest: output.digest }], output.losses);
      expect(report.losses.map(row => [row.amcField, row.count, row.disposition])).toEqual([
        ["controls[].applicability", 5, "prop"], ["controls[].binding", 5, "prop"],
        ["controls[].citations", 1, "prop"], ["controls[].crosswalk", 1, "prop"],
        ["controls[].evidence", 5, "prop"], ["controls[].family", 5, "prop"],
        ["controls[].invalidatedBy", 10, "prop"], ["controls[].layer", 5, "prop"],
        ["controls[].levels", 5, "prop"], ["controls[].mandatory", 5, "prop"],
        ["controls[].owner", 5, "prop"], ["controls[].provenance", 5, "prop"],
        ["controls[].review", 5, "prop"], ["controls[].riskRationale", 5, "prop"],
        ["controls[].stations", 12, "prop"], ["controls[].support", 5, "prop"],
        ["controls[].tests", 5, "prop"], ["controls[].version", 5, "prop"],
        ["fixtures[]", 10, "omitted"], ["manifest", 1, "prop"], ["packs[]", 5, "prop"],
        ["producers[]", 1, "omitted"], ["vocabulary", 1, "omitted"]
      ]);
      expect(report.losses.every(row => row.model === "catalog")).toBe(true);
      expect(output.losses.find(row => row.amcField === "controls[].clock")).toMatchObject({ count: 0, disposition: "prop" });
      expect(output.losses.find(row => row.amcField === "controls[].merge")).toMatchObject({ count: 0, disposition: "prop" });
    } finally {
      fixture.cleanup();
    }
  });

  it("keeps bytes stable under map iteration changes without mutating the loaded input", () => {
    const fixture = createCompilerFixture();
    try {
      const before = catalogSnapshot(fixture.catalog);
      const reordered: LoadedCatalog = { ...fixture.catalog,
        controls: new Map([...fixture.catalog.controls].reverse()),
        packs: new Map([...fixture.catalog.packs].reverse()),
        fixtures: new Map([...fixture.catalog.fixtures].reverse()) };
      const first = toOscalCatalog(fixture.catalog);
      const second = toOscalCatalog(reordered);
      expect(oscalJson(second)).toBe(oscalJson(first));
      expect(oscalJson(toOscalCatalog(fixture.catalog))).toBe(oscalJson(first));
      expect(catalogSnapshot(fixture.catalog)).toBe(before);
    } finally {
      fixture.cleanup();
    }
  });

  it("refuses an actual invalid manifest and an explicit empty-controls input after a positive control", () => {
    const fixture = createCompilerFixture();
    try {
      expect((toOscalCatalog(fixture.catalog).document as CatalogOutputDocument).catalog.groups).toHaveLength(5);
      // This is an explicit invalid API input, not a claim that an empty catalog passed validation.
      const empty: LoadedCatalog = { ...fixture.catalog, controls: new Map<string, ControlRecord>() };
      expect(() => toOscalCatalog(empty)).toThrow("the catalog holds no controls to export");
      // Corrupt only the helper-owned temporary copy, then use the real loader on those bytes.
      writeFileSync(join(fixture.root, "catalog.yaml"), '{"unitInvalidManifest":true}\n', "utf8");
      const invalid = loadCatalog({ root: fixture.root });
      expect(invalid.manifest).toBeNull();
      expect(invalid.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "CAT_SCHEMA", severity: "error", file: "catalog.yaml" })
      ]));
      expect(() => toOscalCatalog(invalid)).toThrow(/did not load cleanly/);
    } finally {
      fixture.cleanup();
    }
  });
});

// These cases compile actual synthetic inputs, initialize an owned temporary workspace, sign through its
// unchanged LOCAL_VAULT policy and verify the returned real signature. Signing establishes local key integrity.
// The separate schema assertion checks output structure; neither establishes portable trust, human approval,
// a namespace decision or an evaluated effect.
interface ProfileOutputDocument {
  profile: {
    metadata: { version: string; "last-modified": string; props: Prop[] };
    imports: Array<{ href: string; "include-controls": Array<{ "with-ids": string[] }> }>;
    "back-matter": { resources: Array<{ uuid: string; props: Prop[] }> };
  };
}

describe("OSCAL profile transform of actually compiled and locally signed synthetic plans", () => {
  it("keeps applicable selection, predicate exclusion and informational crosswalk with real signature integrity", () => {
    const fixture = createCompilerFixture();
    let workspace: string | null = null;
    try {
      // Refuse an inherited no-sign mode rather than overriding it or using ephemeral fallback keys.
      expect(process.env.AMC_NO_SIGN).not.toBe("1");
      workspace = mkdtempSync(join(tmpdir(), "amc-p128-profile-"));
      initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
      expect(vaultStatus(workspace)).toMatchObject({ exists: true, unlocked: true });
      expect(signingRoute(workspace, "CONTROL_PLAN")).toBe("vault");
      const profile = makeProfile({ entityTypes: {
        value: ["hipaa_covered_entity"], provenance: "asserted", source: "fixture: synthetic OSCAL exclusion", reviewedBy: null
      } });
      const plan = compilePlan({ catalog: fixture.catalog, profile, asOf: AS_OF });
      expect(plan.status).toBe("ready");
      expect(plan.requirements.map(row => [row.controlId, row.applicability])).toEqual([
        ["L0-FIX-01", "applicable"], ["L1-FIX-TEC-01", "applicable"],
        ["L1-FIX-WLT-01", "applicable"], ["L2-FIX-US-01", "not_applicable"]
      ]);
      const signedResult = signPlan({ workspace, plan, previous: null });
      expect(signedResult.weakenings).toEqual([]);
      const signed = signedResult.signed;
      expect(signed.signature.digestSha256).toBe(plan.digest.slice(7));
      expect(signed.signature.envelope?.signer.type).toBe("VAULT");
      expect(() => assertSignedPlan(workspace!, signed)).not.toThrow();
      const before = JSON.stringify(signed);
      const output = toOscalProfile(signed, "catalog.json");
      expect(output.document).not.toBeNull();
      const document = output.document as ProfileOutputDocument;
      assertOfficialOscalSchema("profile", document);
      expect(document.profile.imports).toEqual([
        { href: "catalog.json", "include-controls": [{ "with-ids": ["L0-FIX-01", "L1-FIX-TEC-01", "L1-FIX-WLT-01"] }] }
      ]);
      expect(document.profile.metadata.version).toBe(plan.digest);
      // compiledAt is a real signing input, not a mocked clock, and the plan signature does not cover it.
      expect(document.profile.metadata["last-modified"]).toBe(new Date(signed.compiledAt).toISOString());
      const decisions = document.profile.metadata.props.filter(prop => prop.name === "requirement")
        .map(prop => JSON.parse(prop.value) as RequirementDecision);
      expect(decisions.find(row => row.controlId === "L2-FIX-US-01")).toMatchObject({
        applicability: "not_applicable", exclusion: {
          reason: "applicability predicate is false", source: "predicate", exceptionId: null
        }
      });
      expect(output.losses.find(row => row.amcField === "requirements[L2-FIX-US-01]")).toEqual({
        model: "profile", amcField: "requirements[L2-FIX-US-01]", count: 1, disposition: "prop",
        note: "not applicable, absent from include-controls; excluded by predicate: applicability predicate is false"
      });
      expect(plan.crosswalkLinks).toEqual([
        { controlId: "L1-FIX-WLT-01", framework: "fixture-controls", clause: "L3-FIX-XB-01", relation: "equivalent" }
      ]);
      expect(document.profile.metadata.props).toContainEqual({ name: "crosswalk-link", ns: AMC_OSCAL_NS,
        value: '{"clause":"L3-FIX-XB-01","controlId":"L1-FIX-WLT-01","framework":"fixture-controls","relation":"equivalent"}' });
      expect(decisions.some(row => row.controlId === "L3-FIX-XB-01")).toBe(false);
      expect(document.profile["back-matter"].resources).toHaveLength(2);
      expect(document.profile["back-matter"].resources[0]?.props).toContainEqual({ name: "plan-digest", ns: AMC_OSCAL_NS, value: plan.digest });
      expect(output.losses.find(row => row.amcField === "signature.signature")).toMatchObject({ count: 1, disposition: "omitted" });
      expect(oscalJson(toOscalProfile(signed, "catalog.json"))).toBe(oscalJson(output));
      expect(JSON.stringify(signed)).toBe(before);
      expect(() => assertSignedPlan(workspace!, signed)).not.toThrow();
    } finally {
      try {
        if (workspace !== null) {
          lockVault(workspace);
          rmSync(workspace, { recursive: true, force: true });
        }
      } finally { fixture.cleanup(); }
    }
  });

  it("returns no profile for an actual compiled and signed empty catalog instead of inventing a selector", () => {
    const fixture = createCompilerFixture();
    let workspace: string | null = null;
    try {
      expect(process.env.AMC_NO_SIGN).not.toBe("1");
      workspace = mkdtempSync(join(tmpdir(), "amc-p128-profile-empty-"));
      initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
      expect(vaultStatus(workspace)).toMatchObject({ exists: true, unlocked: true });
      expect(signingRoute(workspace, "CONTROL_PLAN")).toBe("vault");
      const emptyRoot = join(workspace, "empty-catalog");
      mkdirSync(emptyRoot);
      for (const name of ["catalog.yaml", "vocabulary.yaml", "producers.yaml", "publisher-hosts.yaml"]) {
        copyFileSync(join(fixture.root, name), join(emptyRoot, name));
      }
      const catalog = loadCatalog({ root: emptyRoot });
      expect(catalog.manifest).not.toBeNull();
      expect(catalog.vocabulary).not.toBeNull();
      expect(catalog.issues).toEqual([]);
      // compilePlan performs the real validator and lock checks on these actual files; no plan object is fabricated.
      const plan = compilePlan({ catalog, profile: fixture.profile, asOf: AS_OF });
      expect(plan.requirements).toEqual([]);
      const signedResult = signPlan({ workspace, plan, previous: null });
      expect(signedResult.weakenings).toEqual([]);
      expect(signedResult.signed.signature.envelope?.signer.type).toBe("VAULT");
      expect(() => assertSignedPlan(workspace!, signedResult.signed)).not.toThrow();
      expect(toOscalProfile(signedResult.signed, "catalog.json")).toEqual({
        document: null,
        losses: [{ model: "profile", amcField: "requirements[]", count: 1, disposition: "omitted",
          note: "the plan has no applicable control and OSCAL include-controls needs at least one id, so profile.json is not written" }]
      });
      // This is a converter API case, not CLI reachability: the CLI separately refuses an empty catalog export.
    } finally {
      try {
        if (workspace !== null) {
          lockVault(workspace);
          rmSync(workspace, { recursive: true, force: true });
        }
      } finally { fixture.cleanup(); }
    }
  });
});

describe("OSCAL exports against unchanged official 1.2.3 schemas", () => {
  it("validates the real catalog conversion and rejects unknown properties, invalid tokens and invalid calendar dates", () => {
    const fixture = createCompilerFixture();
    try {
      const document = toOscalCatalog(fixture.catalog).document as CatalogOutputDocument;
      const before = oscalJson(document);
      assertOfficialOscalSchema("catalog", document);

      const extra = structuredClone(document);
      expectOfficialOscalSchemaError("catalog", { ...extra, catalog: { ...extra.catalog, unitUnexpected: true } },
        "/catalog", "additionalProperties");
      const token = structuredClone(document);
      token.catalog.metadata.props[0]!.name = "not a token";
      expectOfficialOscalSchemaError("catalog", token, "/catalog/metadata/props/0/name", "pattern");
      const date = structuredClone(document);
      date.catalog.metadata["last-modified"] = "2026-02-30T00:00:00Z";
      expectOfficialOscalSchemaError("catalog", date, "/catalog/metadata/last-modified", "format");

      const unicode = structuredClone(document);
      unicode.catalog.metadata.props[0]!.name = "éclair_資格";
      assertOfficialOscalSchema("catalog", unicode);
      expect(oscalJson(document)).toBe(before);
    } finally { fixture.cleanup(); }
  });

  it("validates supplied assessment claims without treating schema conformance as claim truth", () => {
    const plan = unitPlan(unitCatalog()), base = unitResult(plan);
    const notEvaluated = unitResult(plan, { dimensions: { ...base.dimensions, result: "not_evaluated", evidence: "incomplete" } });
    const { document, rows } = assessmentRows([notEvaluated], plan);
    const before = oscalJson(document);
    assertOfficialOscalSchema("assessment", document);
    expect(rows[0]!.findings).toBeUndefined();
    expect(rows[0]!.observations[0]!.props).toContainEqual({ name: "result", ns: AMC_OSCAL_NS, value: "not_evaluated" });

    const extra = structuredClone(document);
    expectOfficialOscalSchemaError("assessment", { ...extra, "assessment-results": { ...extra["assessment-results"], unitUnexpected: true } },
      "/assessment-results", "additionalProperties");
    const token = structuredClone(document);
    token["assessment-results"].results[0]!.observations[0]!.props[0]!.name = "not a token";
    expectOfficialOscalSchemaError("assessment", token, "/assessment-results/results/0/observations/0/props/0/name", "pattern");
    const date = structuredClone(document);
    date["assessment-results"].results[0]!.observations[0]!.collected = "2026-02-30T00:00:00Z";
    expectOfficialOscalSchemaError("assessment", date, "/assessment-results/results/0/observations/0/collected", "format");

    // Deliberate test-owned corruption: OSCAL permits this structure even though AMC must not upgrade the claim.
    const originalResult = document["assessment-results"].results[0]!;
    const promotedResult = { ...structuredClone(originalResult), findings: [{
      uuid: "4fd5d923-7bb1-4b8f-a978-016dd404f441",
      title: "Deliberately false unit promotion",
      description: "Schema-valid shape only; the supplied result remains not evaluated.",
      props: structuredClone(originalResult.observations[0]!.props),
      target: { type: "statement-id", "target-id": IDS[0] + "_smt", status: { state: "satisfied", reason: "pass" } },
      "related-observations": [{ "observation-uuid": originalResult.observations[0]!.uuid }]
    }] };
    const promoted = { ...structuredClone(document), "assessment-results": {
      ...structuredClone(document["assessment-results"]), results: [promotedResult]
    } };
    assertOfficialOscalSchema("assessment", promoted);
    // AMC semantic protection is asserted on the actual converter output above.
    expect(oscalJson(document)).toBe(before);
  });
});

// One common synthetic dataset uses real loading, compilation and local plan signing.
// Result claim/status values below are supplied transform fixtures, not executed producer evidence,
// signed-result-file admission, human approval or portable trust. Schema checks establish structure only.
describe("OSCAL common three-control dataset", () => {
  it("keeps two selected controls, one exclusion and pass/fail/not-evaluated claims across all three models", () => {
    const fixture = createCompilerFixture();
    let workspace: string | null = null;
    try {
      // Change only this helper-owned catalog copy. Remove both full packs and their four fixture files.
      rmSync(join(fixture.root, "layers/technology"), { recursive: true });
      rmSync(join(fixture.root, "layers/crosswalk-target"), { recursive: true });
      for (const path of [
        "fixtures/L1-FIX-TEC-01/positive/valid.json", "fixtures/L1-FIX-TEC-01/negative/violation.json",
        "fixtures/L3-FIX-XB-01/positive/valid.json", "fixtures/L3-FIX-XB-01/negative/violation.json"
      ]) rmSync(join(fixture.root, path));
      const catalog = loadCatalog({ root: fixture.root });
      expect(validateCatalog(catalog, { asOf: new Date(AS_OF) })).toMatchObject({ ok: true, errors: [] });
      expect([...catalog.controls.keys()].sort()).toEqual(["L0-FIX-01", "L1-FIX-WLT-01", "L2-FIX-US-01"]);
      expect(catalog.packs.size).toBe(3);
      expect(catalog.fixtures.size).toBe(6);
      const catalogBefore = catalogSnapshot(catalog);

      expect(process.env.AMC_NO_SIGN).not.toBe("1");
      workspace = mkdtempSync(join(tmpdir(), "amc-p128-common-"));
      initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
      expect(vaultStatus(workspace)).toMatchObject({ exists: true, unlocked: true });
      expect(signingRoute(workspace, "CONTROL_PLAN")).toBe("vault");
      const profile = makeProfile({ entityTypes: {
        value: ["hipaa_covered_entity"], provenance: "asserted", source: "fixture: synthetic OSCAL common dataset", reviewedBy: null
      } });
      const plan = compilePlan({ catalog, profile, asOf: AS_OF });
      expect(plan.status).toBe("ready");
      expect(plan.requirements.map(row => [row.controlId, row.applicability])).toEqual([
        ["L0-FIX-01", "applicable"], ["L1-FIX-WLT-01", "applicable"], ["L2-FIX-US-01", "not_applicable"]
      ]);
      const signedResult = signPlan({ workspace, plan, previous: null });
      expect(signedResult.weakenings).toEqual([]);
      const signed = signedResult.signed;
      expect(signed.signature.envelope?.signer.type).toBe("VAULT");
      expect(() => assertSignedPlan(workspace!, signed)).not.toThrow();
      const signedBefore = JSON.stringify(signed);

      const suppliedResult = (id: string, dimensions: ControlResult["dimensions"], claimKind: ControlResult["claimKind"],
        claimReasons: ControlResult["claimReasons"]): ControlResult => {
        const control = catalog.controls.get(id);
        if (!control) throw new Error("missing common dataset control " + id);
        return withOwnDigest({
          resultVersion: 1, controlId: id, controlVersion: control.version, controlDigest: digestOf(control), planDigest: plan.digest,
          subject: { tenantId: "synthetic-common-tenant", workspaceId: "synthetic-common-workspace", deploymentId: null, agentId: null, subjectId: "synthetic-common-subject" },
          window: { ...WINDOW }, dimensions, claimKind, claimReasons, admitted: [], rejected: [],
          reasons: ["Supplied transform fixture only; no producer or evidence execution is asserted."],
          evaluatedAt: "2026-10-30T00:00:00.000Z", evaluator: { name: "amc", version: "synthetic-common-fixture" }, digest: ""
        });
      };
      const results = [
        suppliedResult("L0-FIX-01", { applicability: { state: "applicable" }, evidence: "sufficient", result: "pass",
          enforcement: { state: "observed" }, review: "pending" }, "observed", []),
        suppliedResult("L1-FIX-WLT-01", { applicability: { state: "applicable" }, evidence: "sufficient", result: "fail",
          enforcement: { state: "observed" }, review: "pending" }, "observed", []),
        suppliedResult("L2-FIX-US-01", { applicability: { state: "not_applicable", rationale: "applicability predicate is false" },
          evidence: "incomplete", result: "not_evaluated", enforcement: { state: "none" }, review: "pending" },
        "synthetic_example", ["SYNTHETIC_VALUES", "NOT_APPLICABLE", "EMPTY_EVIDENCE"])
      ];
      const resultBytes = oscalJson(results);
      // Real hash of these unsigned fixture bytes; this is not a CONTROL_RESULT signature witness.
      const resultsSha256 = createHash("sha256").update(resultBytes).digest("hex");
      const coherentResults = parseControlResults(JSON.parse(resultBytes), plan, catalog);
      expect(coherentResults).toEqual(results);
      const catalogOutput = toOscalCatalog(catalog);
      const profileOutput = toOscalProfile(signed, "catalog.json");
      const assessmentOutput = toOscalAssessmentResults(coherentResults, plan, resultsSha256);
      expect(profileOutput.document).not.toBeNull();
      expect(assessmentOutput.document).not.toBeNull();
      const catalogDocument = catalogOutput.document as CatalogOutputDocument;
      const profileDocument = profileOutput.document as ProfileOutputDocument;
      const assessmentDocument = assessmentOutput.document as AssessmentDocument;
      assertOfficialOscalSchema("catalog", catalogDocument);
      assertOfficialOscalSchema("profile", profileDocument);
      assertOfficialOscalSchema("assessment", assessmentDocument);
      expect(catalogDocument.catalog.groups.flatMap(group => group.controls).map(control => control.id).sort())
        .toEqual(["L0-FIX-01", "L1-FIX-WLT-01", "L2-FIX-US-01"]);
      expect(profileDocument.profile.imports).toEqual([
        { href: "catalog.json", "include-controls": [{ "with-ids": ["L0-FIX-01", "L1-FIX-WLT-01"] }] }
      ]);
      const decisions = profileDocument.profile.metadata.props.filter(prop => prop.name === "requirement")
        .map(prop => JSON.parse(prop.value) as RequirementDecision);
      expect(decisions.find(row => row.controlId === "L2-FIX-US-01")).toMatchObject({ applicability: "not_applicable",
        exclusion: { reason: "applicability predicate is false", source: "predicate", exceptionId: null } });
      expect(plan.crosswalkLinks).toEqual([
        { controlId: "L1-FIX-WLT-01", framework: "fixture-controls", clause: "L3-FIX-XB-01", relation: "equivalent" }
      ]);
      expect(profileDocument.profile.metadata.props).toContainEqual({ name: "crosswalk-link", ns: AMC_OSCAL_NS,
        value: '{"clause":"L3-FIX-XB-01","controlId":"L1-FIX-WLT-01","framework":"fixture-controls","relation":"equivalent"}' });
      expect(decisions.some(row => row.controlId === "L3-FIX-XB-01")).toBe(false);
      const windows = assessmentDocument["assessment-results"].results;
      expect(windows).toHaveLength(1);
      const window = windows[0]!;
      expect(window["reviewed-controls"]["control-selections"]).toEqual([
        { "include-controls": [{ "control-id": "L0-FIX-01" }, { "control-id": "L1-FIX-WLT-01" }, { "control-id": "L2-FIX-US-01" }] }
      ]);
      const value = (props: Prop[], name: string) => props.find(prop => prop.name === name)?.value;
      expect(window.observations.map(row => [value(row.props, "control-id"), value(row.props, "result"), value(row.props, "claim-kind"),
        value(row.props, "applicability"), value(row.props, "evidence"), value(row.props, "enforcement"), value(row.props, "review")])).toEqual([
        ["L0-FIX-01", "pass", "observed", "applicable", "sufficient", "observed", "pending"],
        ["L1-FIX-WLT-01", "fail", "observed", "applicable", "sufficient", "observed", "pending"],
        ["L2-FIX-US-01", "not_evaluated", "synthetic_example", "not_applicable", "incomplete", "none", "pending"]
      ]);
      for (const observation of window.observations) expect(observation.props.every(prop => prop.ns === AMC_OSCAL_NS)).toBe(true);
      expect(window.findings?.map(row => [row.target["target-id"], row.target.status.state, value(row.props, "claim-kind")])).toEqual([
        ["L0-FIX-01_smt", "satisfied", "observed"], ["L1-FIX-WLT-01_smt", "not-satisfied", "observed"]
      ]);
      expect(assessmentDocument["assessment-results"].metadata.props).toContainEqual({ name: "results-sha256", ns: AMC_OSCAL_NS, value: resultsSha256 });
      const inputs: OscalLossReport["inputs"] = [
        { kind: "catalog", digest: catalogOutput.digest }, { kind: "plan", digest: plan.digest }, { kind: "results", digest: "sha256:" + resultsSha256 }
      ];
      const lossReport = buildLossReport(inputs, [...catalogOutput.losses, ...profileOutput.losses, ...assessmentOutput.losses]);
      expect(lossReport.inputs).toEqual(inputs);
      expect(lossReport.losses.filter(row => row.model === "catalog").map(row => [row.amcField, row.count, row.disposition])).toEqual([
        ["controls[].applicability", 3, "prop"], ["controls[].binding", 3, "prop"], ["controls[].citations", 1, "prop"],
        ["controls[].crosswalk", 1, "prop"], ["controls[].evidence", 3, "prop"], ["controls[].family", 3, "prop"],
        ["controls[].invalidatedBy", 6, "prop"], ["controls[].layer", 3, "prop"], ["controls[].levels", 3, "prop"],
        ["controls[].mandatory", 3, "prop"], ["controls[].owner", 3, "prop"], ["controls[].provenance", 3, "prop"],
        ["controls[].review", 3, "prop"], ["controls[].riskRationale", 3, "prop"], ["controls[].stations", 10, "prop"],
        ["controls[].support", 3, "prop"], ["controls[].tests", 3, "prop"], ["controls[].version", 3, "prop"],
        ["fixtures[]", 6, "omitted"], ["manifest", 1, "prop"], ["packs[]", 3, "prop"], ["producers[]", 1, "omitted"], ["vocabulary", 1, "omitted"]
      ]);
      expect(lossReport.losses).toContainEqual({ model: "profile", amcField: "requirements[L2-FIX-US-01]", count: 1, disposition: "prop",
        note: "not applicable, absent from include-controls; excluded by predicate: applicability predicate is false" });
      expect(lossReport.losses).toContainEqual({ model: "assessment-results", amcField: "results[].dimensions.result=not_evaluated", count: 1, disposition: "prop",
        note: "OSCAL finding status is satisfied or not-satisfied only: no finding; an observation with AMC prop result=not_evaluated (L2-FIX-US-01)" });
      expect(lossReport.losses.filter(row => row.model === "assessment-results").map(row => [row.amcField, row.count, row.disposition])).toEqual([
        ["plan (as assessment plan)", 1, "remarks"], ["results[].claimKind", 3, "prop"], ["results[].claimReasons", 3, "prop"],
        ["results[].controlVersion, controlDigest, planDigest, digest", 3, "prop"], ["results[].dimensions", 3, "prop"],
        ["results[].dimensions.result=not_evaluated", 1, "prop"], ["results[].evaluator", 3, "prop"], ["results[].subject", 3, "prop"]
      ]);
      const secondCatalog = toOscalCatalog(catalog), secondProfile = toOscalProfile(signed, "catalog.json");
      const secondAssessment = toOscalAssessmentResults([...coherentResults].reverse(), plan, resultsSha256);
      const secondLoss = buildLossReport(inputs, [...secondCatalog.losses, ...secondProfile.losses, ...secondAssessment.losses]);
      expect(oscalJson({ catalog: secondCatalog.document, profile: secondProfile.document, assessment: secondAssessment.document, loss: secondLoss }))
        .toBe(oscalJson({ catalog: catalogOutput.document, profile: profileOutput.document, assessment: assessmentOutput.document, loss: lossReport }));
      expect(catalogSnapshot(catalog)).toBe(catalogBefore);
      expect(JSON.stringify(signed)).toBe(signedBefore);
      expect(oscalJson(results)).toBe(resultBytes);
      expect(() => assertSignedPlan(workspace!, signed)).not.toThrow();
    } finally {
      try {
        if (workspace !== null) {
          lockVault(workspace);
          rmSync(workspace, { recursive: true, force: true });
        }
      } finally { fixture.cleanup(); }
    }
  });
});

describe("OSCAL actual built CLI export boundaries", () => {
  it("exports only the shipped catalog and loss report while explicitly retaining not-evaluated status", () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-p128-cli-catalog-"));
    try {
      const result = runOscalCommand(workspace, ["--out", "export"]);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain("profile.json not written: no --plan");
      expect(result.stdout).toContain("not evaluated: no control results; assessment-results.json not written");
      const out = join(workspace, "export");
      expect(readdirSync(out).sort()).toEqual(["catalog.json", "oscal-loss-report.json"]);
      const document: unknown = JSON.parse(readFileSync(join(out, "catalog.json"), "utf8"));
      assertOfficialOscalSchema("catalog", document);
      expect(document).toHaveProperty("catalog.metadata.oscal-version", "1.2.3");
      const loss = JSON.parse(readFileSync(join(out, "oscal-loss-report.json"), "utf8")) as OscalLossReport;
      expect(loss.schemaVersion).toBe("amc.oscal-loss/1");
      expect(loss.inputs).toEqual([{ kind: "catalog", digest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/) }]);
      expect(existsSync(join(workspace, ".amc"))).toBe(false);
    } finally { rmSync(workspace, { recursive: true, force: true }); }
  });

  it("refuses stale optional documents before replacing any output bytes", () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-p128-cli-stale-"));
    try {
      const out = join(workspace, "export");
      mkdirSync(out);
      const originals = ["catalog.json", "oscal-loss-report.json", "profile.json", "assessment-results.json"]
        .map(name => ({ name, bytes: Buffer.from("owned prior output: " + name + "\n", "utf8") }));
      for (const original of originals) writeFileSync(join(out, original.name), original.bytes);
      const result = runOscalCommand(workspace, ["--out", "export"]);
      expect(result.status, result.stderr).toBe(1);
      expect(result.stderr).toContain("left from an earlier export and not replaced by this one");
      expect(result.stderr).toContain("profile.json");
      expect(result.stderr).toContain("assessment-results.json");
      expect(readdirSync(out).sort()).toEqual(originals.map(row => row.name).sort());
      for (const original of originals) expect(readFileSync(join(out, original.name))).toEqual(original.bytes);
    } finally { rmSync(workspace, { recursive: true, force: true }); }
  });

  it("refuses results without a plan and targets under .amc without creating output", () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-p128-cli-refusal-"));
    try {
      const missingPlan = runOscalCommand(workspace, ["--out", "export", "--results", "missing-results.json"]);
      expect(missingPlan.status, missingPlan.stderr).toBe(1);
      expect(missingPlan.stderr).toContain("--results needs --plan");
      expect(readdirSync(workspace)).toEqual([]);
      const signedTree = runOscalCommand(workspace, ["--out", ".amc/oscal"]);
      expect(signedTree.status, signedTree.stderr).toBe(1);
      expect(signedTree.stderr).toContain(".amc/** is reserved for signed configs");
      expect(readdirSync(workspace)).toEqual([]);
    } finally { rmSync(workspace, { recursive: true, force: true }); }
  });

  it("verifies normal locally signed shipped-catalog files and refuses independent byte edits", () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-p128-cli-signed-"));
    try {
      expect(process.env.AMC_NO_SIGN).not.toBe("1");
      initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
      expect(vaultStatus(workspace)).toMatchObject({ exists: true, unlocked: true });
      expect(signingRoute(workspace, "CONTROL_PLAN")).toBe("vault");
      expect(signingRoute(workspace, "CONTROL_RESULT")).toBe("vault");
      // The existing profile is explicitly synthetic input; its reviewed labels confer no human approval here.
      const profile = makeProfile();
      writeFileSync(join(workspace, "deployment-profile.json"), JSON.stringify(profile) + "\n", "utf8");
      const compileExit = runCatalogCompile(workspace, { profile: "deployment-profile.json", out: "plan" });
      // Both are documented writer outcomes: 2 remains a blocked signed plan, never a ready/activated plan.
      expect([0, 2]).toContain(compileExit);
      const planPath = join(workspace, "plan", "plan.json");
      const plan = JSON.parse(readFileSync(planPath, "utf8")) as CompiledPlan;
      expect(compileExit).toBe(plan.status === "ready" ? 0 : 2);
      const catalog = loadCatalog();
      const decision = plan.requirements.find(row => row.applicability === "applicable"
        && catalog.controls.get(row.controlId)?.evidence.some(contract => (contract.sampling.minItems ?? 1) > 0));
      if (!decision) throw new Error("The shipped plan exposes no applicable control with an evidence contract.");
      const control = catalog.controls.get(decision.controlId);
      if (!control) throw new Error("The compiled control is absent from the shipped catalog.");
      const now = Date.now();
      const evaluated = evaluateControl(control, [], {
        subject: { tenantId: profile.deployment.tenantId, workspaceId: profile.deployment.workspaceId,
          deploymentId: profile.deployment.deploymentId, agentId: profile.deployment.agentIds[0] ?? null, subjectId: null },
        window: { start: new Date(now - 60_000).toISOString(), end: new Date(now + 60_000).toISOString() },
        plan: { digest: plan.digest, policyDigest: plan.runtimePolicy.policyDigest, applicability: { state: "applicable" }, mode: "enforce" },
        invalidations: [], reviews: [], producers: catalog.producers
      });
      expect(evaluated.dimensions.result).toBe("not_evaluated");
      expect(evaluated.admitted).toEqual([]);
      const signedResults = writeSignedControlResults(workspace, "results.json", [evaluated]);
      expect(createHash("sha256").update(readFileSync(signedResults.path)).digest("hex")).toBe(signedResults.digestSha256);
      const exported = runOscalCommand(workspace, ["--out", "export", "--plan", "plan/plan.json", "--results", "results.json"]);
      expect(exported.status, exported.stderr).toBe(0);
      expect(exported.stdout).toContain("Plan signature checked against this workspace's auditor keys");
      expect(exported.stdout).toContain("Results signature (CONTROL_RESULT)");
      const out = join(workspace, "export");
      expect(readdirSync(out).sort()).toEqual(["assessment-results.json", "catalog.json", "oscal-loss-report.json", "profile.json"]);
      assertOfficialOscalSchema("catalog", JSON.parse(readFileSync(join(out, "catalog.json"), "utf8")));
      assertOfficialOscalSchema("profile", JSON.parse(readFileSync(join(out, "profile.json"), "utf8")));
      const assessment = JSON.parse(readFileSync(join(out, "assessment-results.json"), "utf8")) as AssessmentDocument;
      assertOfficialOscalSchema("assessment", assessment);
      expect(assessment["assessment-results"].metadata.props).toContainEqual({ name: "results-sha256", ns: AMC_OSCAL_NS, value: signedResults.digestSha256 });
      expect(assessment["assessment-results"].results).toHaveLength(1);
      expect(assessment["assessment-results"].results[0]!.observations).toHaveLength(1);
      expect(assessment["assessment-results"].results[0]!.observations[0]!.props).toContainEqual({ name: "result", ns: AMC_OSCAL_NS, value: "not_evaluated" });
      expect(assessment["assessment-results"].results[0]!.findings).toBeUndefined();

      // These are cryptographic refusal cases, separate from the later payload-digest edits.
      // Retain payload bytes, digest, public key, algorithm and metadata; flip only one signature byte.
      type PublicSignatureCopy = { digestSha256: string; signature: string; envelope?: { sigB64: string } };
      const corruptPublicSignature = (signature: PublicSignatureCopy): void => {
        const bytes = Buffer.from(signature.signature, "base64");
        expect(bytes.length).toBeGreaterThan(0);
        bytes[0] = bytes[0]! ^ 1;
        signature.signature = bytes.toString("base64");
        // Keep the legacy/envelope mirror coherent so its mismatch is not the only rejection oracle.
        if (signature.envelope) signature.envelope.sigB64 = signature.signature;
      };

      const badSignatureResults = join(workspace, "bad-signature-results.json");
      copyFileSync(signedResults.path, badSignatureResults);
      const resultSignatureCopy = JSON.parse(readFileSync(signedResults.sigPath, "utf8")) as PublicSignatureCopy;
      corruptPublicSignature(resultSignatureCopy);
      expect(resultSignatureCopy.digestSha256).toBe(signedResults.digestSha256);
      if (resultSignatureCopy.envelope) expect(resultSignatureCopy.envelope.sigB64).toBe(resultSignatureCopy.signature);
      writeFileSync(badSignatureResults + ".sig", JSON.stringify(resultSignatureCopy) + "\n", "utf8");
      expect(readFileSync(badSignatureResults)).toEqual(readFileSync(signedResults.path));
      const refusedResultSignature = runOscalCommand(workspace, ["--out", "bad-results-signature-export",
        "--plan", "plan/plan.json", "--results", "bad-signature-results.json"]);
      expect(refusedResultSignature.status, refusedResultSignature.stderr).toBe(1);
      expect(refusedResultSignature.stderr).toContain("signature does not verify against this workspace's auditor keys; nothing was exported");
      expect(existsSync(join(workspace, "bad-results-signature-export"))).toBe(false);

      const badSignaturePlanDir = join(workspace, "bad-signature-plan");
      mkdirSync(badSignaturePlanDir);
      copyFileSync(planPath, join(badSignaturePlanDir, "plan.json"));
      const planSignatureCopy = JSON.parse(
        readFileSync(join(workspace, "plan", "plan.sig.json"), "utf8")
      ) as { signature: PublicSignatureCopy };
      corruptPublicSignature(planSignatureCopy.signature);
      expect(planSignatureCopy.signature.digestSha256).toBe(plan.digest.slice(7));
      if (planSignatureCopy.signature.envelope) expect(planSignatureCopy.signature.envelope.sigB64).toBe(planSignatureCopy.signature.signature);
      writeFileSync(join(badSignaturePlanDir, "plan.sig.json"), JSON.stringify(planSignatureCopy) + "\n", "utf8");
      expect(readFileSync(join(badSignaturePlanDir, "plan.json"))).toEqual(readFileSync(planPath));
      const refusedPlanSignature = runOscalCommand(workspace, ["--out", "bad-plan-signature-export",
        "--plan", "bad-signature-plan/plan.json"]);
      expect(refusedPlanSignature.status, refusedPlanSignature.stderr).toBe(1);
      expect(refusedPlanSignature.stderr).toContain("signature does not verify against this workspace's auditor keys");
      expect(existsSync(join(workspace, "bad-plan-signature-export"))).toBe(false);

      // Keep the original signed files. Corrupt separate owned public copies, never keys or signature policy.
      const editedResults = join(workspace, "edited-results.json");
      copyFileSync(signedResults.path, editedResults);
      copyFileSync(signedResults.sigPath, editedResults + ".sig");
      writeFileSync(editedResults, readFileSync(editedResults, "utf8") + "\n", "utf8");
      const badResults = runOscalCommand(workspace, ["--out", "bad-results-export", "--plan", "plan/plan.json", "--results", "edited-results.json"]);
      expect(badResults.status, badResults.stderr).toBe(1);
      expect(badResults.stderr).toContain("changed after signing (digest mismatch)");
      expect(existsSync(join(workspace, "bad-results-export"))).toBe(false);

      const editedPlanDir = join(workspace, "edited-plan");
      mkdirSync(editedPlanDir);
      copyFileSync(join(workspace, "plan", "plan.sig.json"), join(editedPlanDir, "plan.sig.json"));
      const editedPlan = structuredClone(plan);
      editedPlan.profile.profileId += "-edited";
      writeFileSync(join(editedPlanDir, "plan.json"), JSON.stringify(editedPlan) + "\n", "utf8");
      const badPlan = runOscalCommand(workspace, ["--out", "bad-plan-export", "--plan", "edited-plan/plan.json"]);
      expect(badPlan.status, badPlan.stderr).toBe(1);
      expect(badPlan.stderr).toContain("does not match its digest (edited after compiling)");
      expect(existsSync(join(workspace, "bad-plan-export"))).toBe(false);
    } finally {
      try { lockVault(workspace); } finally { rmSync(workspace, { recursive: true, force: true }); }
    }
  });
});
