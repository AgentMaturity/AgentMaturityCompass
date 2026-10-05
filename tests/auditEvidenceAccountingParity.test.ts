import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import * as sampling from "../src/audit/posthocAuditSampling.js";
import * as reviewer from "../src/audit/reviewerIndependence.js";
import * as exceptions from "../src/compliance/exceptionLifecycle.js";
import * as drift from "../src/compliance/policyDrift.js";
import * as provider from "../src/compliance/providerRisk.js";
import * as gate from "../src/ci/gate.js";
import * as publicApi from "../src/index.js";
import { canonicalize } from "../src/utils/json.js";
import { sha256Hex } from "../src/utils/hash.js";
import { landedText } from "./helpers/landedSource.js";

const archive = "unused-code/2026-10-02-native/audit-evidence-accounting";
const generatedAt = "2026-10-02T08:00:00.000Z";
const hash = "a".repeat(64);
const signed = { signedEvidenceRef: "fixture-reference-only", signatureSha256: hash };
const citations = [{ sourceId: "source-one", title: "Fixture source", url: "https://example.invalid/reference", retrievedAt: generatedAt }];
const evidence = () => [{ eventId: "event-one", eventHash: hash, eventType: "audit", signedEvidenceRef: "fixture-event-reference-only" }];
// These are syntactic evidence-reference fixtures, never claims of crypto verification.
const fixtures = {
  sampling: () => ({ samplePlans: [{ samplePlanId: "plan-one", owner: "owner", populationId: "population", populationSize: 10, sampleSize: 1, samplingMethod: "random", riskTier: "high", plannedAt: generatedAt, ...signed }], reviewedActions: [{ actionId: "action-one", samplePlanId: "plan-one", agentId: "agent-one", policyId: "policy-one", completedAt: generatedAt, sampledAt: generatedAt, reviewerId: "reviewer", reviewDecision: "pass", reviewSignedEvidenceRef: signed.signedEvidenceRef, reviewSignatureSha256: hash, evidenceRefs: evidence() }], findings: [], correctiveActions: [], scoreImpacts: [{ scoreImpactId: "impact-one", actionId: "action-one", dimensionId: "dimension-one", questionId: "question-one", beforeScore: 0.5, afterScore: 0.4, impact: -0.1, reason: "review result", ...signed }] }),
  reviewer: () => ({ approvals: [{ approvalId: "approval-one", actionId: "action-one", controlId: "control-one", riskTier: "high", requesterId: "requester", requesterRole: "owner", requesterOrgUnit: "operations", reviewerId: "reviewer", reviewerRole: "auditor", reviewerOrgUnit: "security", separationRuleId: "separate-review", decision: "approved", decidedAt: generatedAt, approvalReceiptRef: "approval-receipt", approvalSignatureSha256: hash, conflictCheck: { checkedAt: generatedAt, flags: [], ...signed }, secondReview: { required: true, reviewerId: "second-reviewer", reviewerRole: "auditor", decision: "approved", decidedAt: generatedAt, approvalReceiptRef: "second-approval", ...signed }, evidenceRefs: evidence() }] }),
  exceptions: () => ({ exceptions: [{ exceptionId: "exception-one", policyId: "policy-one", controlId: "control-one", owner: "owner", requesterId: "requester", requestReason: "temporary exception", requestedAt: generatedAt, requestSignedEvidenceRef: signed.signedEvidenceRef, requestSignatureSha256: hash, approverId: "approver", approvalDecision: "approved", approvedAt: generatedAt, approvalSignedEvidenceRef: signed.signedEvidenceRef, approvalSignatureSha256: hash, expiresAt: generatedAt, expiryCheckedAt: generatedAt, expirySignedEvidenceRef: signed.signedEvidenceRef, expirySignatureSha256: hash, compensatingControls: [{ controlId: "compensating-control", owner: "owner", description: "additional review", ...signed }], renewalDecision: { decision: "not_requested", decidedAt: generatedAt, approverId: "approver", reason: "no renewal", ...signed }, evidenceRefs: evidence() }] }),
  drift: () => ({ changes: [{ changeId: "change-one", policyId: "policy-one", previousPolicyVersion: "v1", nextPolicyVersion: "v2", previousPolicyHash: hash, nextPolicyHash: "b".repeat(64), changeOwner: "owner", changedAt: generatedAt, rationale: "review policy", diffSummary: "require second review", ...signed, affectedAgents: [{ agentId: "agent-one", environment: "production", currentPolicyVersion: "v1", requiredPolicyVersion: "v2", impactLevel: "high", reason: "approval change", ...signed }], affectedControls: [{ controlId: "control-one", framework: "fixture", owner: "owner", changeType: "strengthened", ...signed }], affectedTests: [{ testId: "test-one", command: "fixture test", owner: "owner", reason: "policy change", ...signed }], priorDecisions: [{ decisionId: "decision-one", agentId: "agent-one", decisionType: "approval", decidedAt: generatedAt, invalidated: true, reason: "policy change", ...signed }], recheckItems: [{ recheckId: "recheck-one", owner: "owner", dueAt: generatedAt, action: "repeat approval", status: "open", ...signed }], rolloutReceipt: { rolloutId: "rollout-one", approvedBy: "approver", approvedAt: generatedAt, rolloutWindowId: "window-one", rollbackPlanRef: "rollback", ...signed }, evidenceRefs: evidence() }] }),
  provider: () => ({ providers: [{ providerId: "provider-one", providerName: "Fixture provider", providerType: "model", owner: "owner", reviewDate: generatedAt, dataProcessingPosture: "restricted_customer_data", allowedUseCases: ["summarization"], modelRestrictions: ["no autonomous payments"], attestations: [{ attestationId: "attestation-one", attestationType: "custom", issuedAt: generatedAt, expiresAt: generatedAt, ...signed }], dataBoundary: { boundaryId: "boundary-one", dataClasses: ["redacted"], allowedRegions: ["region-one"], subprocessors: [], retentionDays: 30, transferMechanism: "fixture-agreement", ...signed }, contractualControls: [{ controlId: "contract-one", obligation: "no training", status: "active", owner: "owner", reviewDate: generatedAt, ...signed }], evidenceRefs: evidence() }] }),
  gate: () => ({ gates: [{ gateId: "gate-one", agentId: "agent-one", environment: "production", gateConfig: gate.defaultGatePolicy(), evaluatedAt: generatedAt, passed: true, failureReasons: [], runReceiptRef: "fixture-run-reference", runReceiptHash: hash, evidenceRefs: evidence(), controlEvidence: ["score", "security", "compliance", "cost", "observability"].map(control => ({ control, passed: true, evidenceRef: `fixture-${control}`, reason: "fixture result" })) }] })
};
type Fixture = { receiptId: string; generatedAt?: string; sourceCitations: typeof citations } & Record<string, unknown>;
type Receipt = { receiptId: string; generatedAt: string; sourceCitations: unknown[]; rows: Array<Record<string, unknown>>; failClosed: boolean; failClosedReasons: string[]; receiptHash: string };
type WorkflowModule = Record<string, (input: unknown) => unknown>;
const definitions = [
  ["sampling", "src/audit/posthocAuditSampling.ts", sampling, "buildPosthocAuditSamplingReceipt", "verifyPosthocAuditSamplingReceipt", "renderPosthocAuditSamplingAuditExport", "reviewedActions"],
  ["reviewer", "src/audit/reviewerIndependence.ts", reviewer, "buildReviewerIndependenceReceipt", "verifyReviewerIndependenceReceipt", "renderReviewerIndependenceAuditExport", "approvals"],
  ["exceptions", "src/compliance/exceptionLifecycle.ts", exceptions, "buildGovernanceExceptionLifecycleReceipt", "verifyGovernanceExceptionLifecycleReceipt", "renderGovernanceExceptionLifecycleAuditExport", "exceptions"],
  ["drift", "src/compliance/policyDrift.ts", drift, "buildPolicyDriftImpactReceipt", "verifyPolicyDriftImpactReceipt", "renderPolicyDriftImpactAuditExport", "changes"],
  ["provider", "src/compliance/providerRisk.ts", provider, "buildThirdPartyProviderRiskReceipt", "verifyThirdPartyProviderRiskReceipt", "renderThirdPartyProviderRiskAuditExport", "providers"],
  ["gate", "src/ci/gate.ts", gate, "buildReleaseGateReceipt", "verifyReleaseGateReceipt", "renderReleaseGateAuditExport", "gates"]
] as const;
const originals = new Map<string, WorkflowModule>();
const manifest = JSON.parse(readFileSync(resolve(archive, "restoration-map.json"), "utf8")) as {
  baseCommit: string; files: Array<{ sourcePath: string; archivePath: string; sha256: string; gitBlob: string }>;
};

async function loadOriginal(path: string): Promise<WorkflowModule> {
  const entry = manifest.files.find(row => row.sourcePath === path)!;
  const bytes = readFileSync(resolve(entry.archivePath));
  expect(sha256Hex(bytes)).toBe(entry.sha256);
  const ast = ts.createSourceFile(path, bytes.toString("utf8"), ts.ScriptTarget.ES2022, true);
  const dependencies = new Map<string, unknown>();
  for (const node of ast.statements) {
    if (!ts.isImportDeclaration(node) || node.importClause?.isTypeOnly || !ts.isStringLiteral(node.moduleSpecifier)) continue;
    const specifier = node.moduleSpecifier.text;
    dependencies.set(specifier, await vi.importActual(specifier.startsWith(".") ? resolve(dirname(path), specifier).replace(/\.js$/, ".ts") : specifier));
  }
  const compiled = ts.transpileModule(bytes.toString("utf8"), { fileName: path, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, reportDiagnostics: true });
  expect(compiled.diagnostics?.filter(row => row.category === ts.DiagnosticCategory.Error)).toEqual([]);
  const exports = {};
  runInNewContext(compiled.outputText, { exports, Buffer, Date, require: (specifier: string) => {
    if (!dependencies.has(specifier)) throw new Error(`Unmapped actual dependency: ${specifier}`);
    return dependencies.get(specifier);
  } }, { filename: `${path}.original.cjs` });
  return exports as WorkflowModule;
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(generatedAt);
  for (const [, path] of definitions) originals.set(path, await loadOriginal(path));
});
afterAll(() => vi.useRealTimers());
function outcome(fn: () => unknown) {
  try { return { value: fn() }; }
  catch (error) { return { error: String(error) }; }
}
function input(name: keyof typeof fixtures): Fixture { return { receiptId: "fixture-receipt", generatedAt, sourceCitations: structuredClone(citations), ...fixtures[name]() }; }
function record(value: Fixture, key: string): Record<string, unknown> { return (value[key] as Array<Record<string, unknown>>)[0]!; }
function tracked(value: unknown, trace: string[], path = "input"): unknown {
  if (!value || typeof value !== "object") return value;
  return new Proxy(value, { get(target, property, receiver) {
    if (typeof property === "string" && property !== "constructor") trace.push(`${path}.${property}`);
    return tracked(Reflect.get(target, property, receiver), trace, `${path}.${String(property)}`);
  } });
}
function rehash(receipt: Receipt): void { const { receiptHash: _, ...rest } = receipt; receipt.receiptHash = sha256Hex(canonicalize(rest)); }

for (const [name, path, currentNamespace, buildName, verifyName, renderName, rowInput] of definitions) {
  const current = currentNamespace as unknown as WorkflowModule;
  const old = () => originals.get(path)!;
  const build = (value: Fixture) => current[buildName]!(value) as Receipt;
  function parity(value: Fixture): Receipt {
    const actual = build(value), expected = old()[buildName]!(value) as Receipt;
    expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
    expect(current[verifyName]!(actual)).toEqual(old()[verifyName]!(expected));
    expect(current[renderName]!(actual)).toBe(old()[renderName]!(expected));
    return actual;
  }
  describe(`${name} complete original workflow`, () => {
    test("preserves complete module exports, root public consumers and unchanged domain source bytes", () => {
      expect(Object.keys(currentNamespace).sort()).toEqual(Object.keys(old()).sort());
      for (const exported of [buildName, verifyName, renderName]) expect((publicApi as unknown as Record<string, unknown>)[exported]).toBe(current[exported]);
      const inverses = JSON.parse(readFileSync(resolve(archive, "inverse-text.json"), "utf8")) as Record<string, Array<{ position: number; before: string; after: string }>>;
      let restored = landedText(path);
      for (const operation of [...inverses[path]!].reverse()) {
        expect(restored.slice(operation.position, operation.position + operation.after.length)).toBe(operation.after);
        restored = restored.slice(0, operation.position) + operation.before + restored.slice(operation.position + operation.after.length);
      }
      expect(restored).toBe(readFileSync(resolve(archive, "originals", path), "utf8"));
    });
    test("matches every receipt/row/hash/export byte and succeeds for valid references", () => {
      const receipt = parity(input(name));
      expect(receipt.failClosed).toBe(false);
      expect((current[verifyName]!(receipt) as { valid: boolean }).valid).toBe(true);
      rehash(receipt); expect(receipt.receiptHash).toBe(build(input(name)).receiptHash);
    });
    test.each(["missing citations", "empty record citations", "unknown citations", "empty rows"])("preserves ordered refusal for %s", condition => {
      const value = input(name);
      if (condition === "missing citations") value.sourceCitations = [];
      else if (condition === "empty rows") value[rowInput] = [];
      else record(value, rowInput).sourceCitationIds = condition === "unknown citations" ? ["unknown"] : [];
      const receipt = parity(value);
      expect(receipt.failClosed).toBe(true);
      expect((current[verifyName]!(receipt) as { valid: boolean }).valid).toBe(false);
    });
    test.each(["eventId", "eventType", "signedEvidenceRef", "eventHash"])("refuses missing evidence %s with original reasons", field => {
      const value = input(name), refs = record(value, rowInput).evidenceRefs as Array<Record<string, unknown>>;
      refs[0]![field] = "";
      const receipt = parity(value);
      expect(receipt.failClosed).toBe(true);
      expect(receipt.failClosedReasons.some(reason => reason.includes("evidenceChain"))).toBe(true);
    });
    test.each(["A".repeat(64), "a".repeat(63), "a".repeat(65), "g".repeat(64)])("refuses malformed evidence hash %s", eventHash => {
      const value = input(name), refs = record(value, rowInput).evidenceRefs as Array<Record<string, unknown>>;
      refs[0]!.eventHash = eventHash;
      expect(parity(value).failClosed).toBe(true);
    });
    test("preserves sparse evidence and native null/undefined behavior", () => {
      for (const refs of [new Array(1), [null], undefined, null]) {
        const value = input(name); record(value, rowInput).evidenceRefs = refs;
        const actual = outcome(() => build(value)), expected = outcome(() => old()[buildName]!(value));
        expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
      }
    });
    test("preserves getter and array operation order on success and refusal", () => {
      for (const failed of [false, true]) {
        const value = input(name);
        if (failed) ((record(value, rowInput).evidenceRefs as Array<Record<string, unknown>>)[0]!).eventId = "";
        const actualTrace: string[] = [], oldTrace: string[] = [];
        const actual = outcome(() => current[buildName]!(tracked(value, actualTrace))), expected = outcome(() => old()[buildName]!(tracked(value, oldTrace)));
        expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
        expect(actualTrace).toEqual(oldTrace);
      }
    });
    test("preserves generatedAt fallback and caller array identity", () => {
      const value = input(name); delete value.generatedAt;
      const receipt = parity(value);
      expect(receipt.generatedAt).toBe(generatedAt);
      expect(receipt.sourceCitations).toBe(value.sourceCitations);
      expect(receipt.rows[0]!.evidenceRefs).toBe(record(value, rowInput).evidenceRefs);
    });
    test("preserves rendered refusal footer bytes and getter order", () => {
      for (const failed of [false, true]) {
        const value = input(name);
        if (failed) record(value, rowInput).sourceCitationIds = ["unknown"];
        const receipt = build(value), actualTrace: string[] = [], oldTrace: string[] = [];
        expect(current[renderName]!(tracked(receipt, actualTrace))).toBe(old()[renderName]!(tracked(receipt, oldTrace)));
        expect(actualTrace).toEqual(oldTrace);
        const text = current[renderName]!(receipt) as string;
        expect(text.endsWith("\n")).toBe(true);
        if (failed) expect(text).toContain("## Fail-Closed Reasons\n- ");
      }
    });
    test.each(["empty citations", "empty rows", "row tamper", "receipt tamper"])("rejects independently rehashed/altered %s", condition => {
      const receipt = build(input(name));
      if (condition === "empty citations") receipt.sourceCitations = [];
      else if (condition === "empty rows") receipt.rows = [];
      else if (condition === "row tamper") receipt.rows[0]!.evidenceChainHash = "0".repeat(64);
      else receipt.receiptHash = "0".repeat(64);
      if (condition !== "receipt tamper") rehash(receipt);
      const actual = current[verifyName]!(receipt) as { valid: boolean; reasons: string[] };
      expect(actual).toEqual(old()[verifyName]!(receipt)); expect(actual.valid).toBe(false);
      if (condition === "empty citations") expect(actual.reasons).toContain("sourceCitations:missing");
      if (condition === "empty rows") expect(actual.reasons.some(reason => reason.endsWith(":missing"))).toBe(true);
    });
    test("deduplicates refusal reasons in original first-occurrence order", () => {
      const value = input(name), first = record(value, rowInput);
      first.sourceCitationIds = ["unknown"];
      first.evidenceRefs = [];
      (value[rowInput] as unknown[]).push(structuredClone(first));
      const receipt = parity(value);
      expect(new Set(receipt.failClosedReasons).size).toBe(receipt.failClosedReasons.length);
      expect(receipt.failClosedReasons[0]).toContain("sourceCitation:unknown");
    });
  });
}

test("keeps reviewer role separation, high-risk second review and conflict refusal distinct", () => {
  const old = originals.get("src/audit/reviewerIndependence.ts")!;
  for (const change of ["same reviewer", "missing second", "conflict", "missing signature"] as const) {
    const value = input("reviewer"), approval = record(value, "approvals");
    if (change === "same reviewer") approval.reviewerId = approval.requesterId;
    else if (change === "missing second") approval.secondReview = undefined;
    else if (change === "conflict") (approval.conflictCheck as { flags: string[] }).flags = ["conflict"];
    else approval.approvalSignatureSha256 = "A".repeat(64);
    const receipt = reviewer.buildReviewerIndependenceReceipt(value as unknown as Parameters<typeof reviewer.buildReviewerIndependenceReceipt>[0]);
    expect(receipt).toEqual(old.buildReviewerIndependenceReceipt!(value)); expect(receipt.failClosed).toBe(true);
  }
});

test("keeps timestamp and signed-reference refusals at their domain boundaries", () => {
  for (const [name, path, module, buildName] of definitions) {
    const value = input(name), row = record(value, definitions.find(definition => definition[0] === name)![6]);
    if (name === "sampling") (value.samplePlans as Array<Record<string, unknown>>)[0]!.signatureSha256 = "A".repeat(64);
    else if (name === "exceptions") row.requestSignatureSha256 = "A".repeat(64);
    else if (name === "drift") row.signatureSha256 = "A".repeat(64);
    else if (name === "provider") (row.attestations as Array<Record<string, unknown>>)[0]!.signatureSha256 = "A".repeat(64);
    else if (name === "gate") row.evaluatedAt = "invalid timestamp";
    else row.approvalSignatureSha256 = "A".repeat(64);
    const receipt = (module as unknown as WorkflowModule)[buildName]!(value) as Receipt;
    expect(receipt).toEqual(originals.get(path)![buildName]!(value)); expect(receipt.failClosed).toBe(true);
  }
});

test("archive originals are pinned to the expected base and Git blob bytes", () => {
  expect(manifest.baseCommit).toBe("3148d96edbe13324c9c4b58860976b6815cab595");
  for (const entry of manifest.files) {
    const data = readFileSync(resolve(entry.archivePath));
    const gitBlob = createHash("sha1").update(Buffer.from(`blob ${data.length}\0`)).update(data).digest("hex");
    expect(gitBlob).toBe(entry.gitBlob);
  }
});


test("unsigned CI initialization preserves real policy/workflow bytes and disclosed signing boundary", () => {
  const workspace = mkdtempSync(join(tmpdir(), "amc-ci-original-parity-"));
  try {
    const options = { workspace, agentId: "ci-parity-agent", signPolicy: false };
    const original = originals.get("src/ci/gate.ts")!;
    const expected = original.initCiForAgent!(options) as ReturnType<typeof gate.initCiForAgent>;
    const policy = readFileSync(expected.policyPath);
    const workflow = readFileSync(expected.workflowPath);
    const policyMode = statSync(expected.policyPath).mode & 0o777;
    const workflowMode = statSync(expected.workflowPath).mode & 0o777;

    const actual = gate.initCiForAgent(options);
    expect(actual).toEqual(expected);
    expect(readFileSync(actual.policyPath).equals(policy)).toBe(true);
    expect(readFileSync(actual.workflowPath).equals(workflow)).toBe(true);
    expect(statSync(actual.policyPath).mode & 0o777).toBe(policyMode);
    expect(statSync(actual.workflowPath).mode & 0o777).toBe(workflowMode);
    expect(policyMode).toBe(0o644);
    expect(workflowMode).toBe(0o644);
    expect(JSON.parse(policy.toString("utf8"))).toEqual(gate.defaultGatePolicy());
    expect(actual.policySigPath).toBeNull();
    expect(actual.signed).toBe(false);
    expect(actual.workflowPath).toBe(join(workspace, ".github", "workflows", "amc.yml"));
    expect(workflow.toString("utf8")).toContain("--no-sign");
    expect(workflow.toString("utf8")).toContain("UNSIGNED CI mode: maturity BOM signing skipped");
    expect(gate.printCiSteps(options)).toEqual(original.printCiSteps!(options));
    expect(gate.printCiSteps(options).join("\n")).toContain("amc bundle verify .amc/");
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
