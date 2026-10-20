import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { openLedger, type Ledger } from "../../../src/ledger/ledger.js";
import { initWorkspace } from "../../../src/workspace.js";
import { lockVault } from "../../../src/vault/vault.js";
import { startAssuranceSession } from "../../../src/assurance/evidenceWriters.js";
import { loadExecutedEvidence, writeExecutedEvidence, type ExecutedCaptureRecord } from "../../../src/assurance/executed/evidence.js";
import { evaluateControl } from "../../../src/catalog/evidence/evaluate.js";
import type { EvaluableControl, EvaluationContext } from "../../../src/catalog/evidence/types.js";

const digest = "a".repeat(64);
const record: ExecutedCaptureRecord = {
  v: 1, scenarioId: "synthetic-cold-release", packId: "synthetic-effects",
  fixture: { environment: "cold", seed: "synthetic-v1" },
  binding: { tenantId: "fixture-tenant", workspaceId: "fixture-workspace", deploymentId: "fixture-deployment",
    agentId: "default", controlId: "L1-MOB-01", controlVersion: "0.1.0", policyDigest: digest,
    runId: "fixture-run", attemptId: "fixture-attempt", fixtureDigest: digest },
  policy: { synthetic: true }, capture: { released: ["synthetic-lot"] }
};

describe("P2-27 sealed synthetic executed captures", () => {
  let root: string, workspace: string, ledger: Ledger;
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "amc-p227-effect-evidence-"));
    const home = join(root, "operator");
    mkdirSync(home, { mode: 0o700 });
    vi.stubEnv("AMC_HOME", home);
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "p227-synthetic-evidence-tests");
    workspace = join(root, "workspace");
    initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
    ledger = openLedger(workspace);
  });
  afterAll(() => {
    ledger?.close();
    if (workspace) lockVault(workspace);
    vi.unstubAllEnvs();
    if (root) rmSync(root, { recursive: true, force: true });
  });

  function session(): string {
    return startAssuranceSession({ ledger, mode: "sandbox", agentId: "default",
      packIds: [record.packId], trustTier: "SELF_REPORTED" });
  }

  test("the native writer and same-byte reader retain synthetic provenance after sealing", () => {
    const id = session();
    const ref = writeExecutedEvidence(ledger, id, record);
    ledger.sealSession(id);
    expect(ref).not.toBeNull();
    if (!ref) return;
    const loaded = loadExecutedEvidence(ledger, ref, record);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.record).toEqual(record);
    expect(loaded.item.provenance).toMatchObject({ verified: true, producerId: "amc.assurance.executed", trustTier: null });
    expect(loaded.item.verdict).toBe("neutral");
    expect(loaded.item.attributes.claimKind).toBe("synthetic_example");
  });

  test("an unsealed session cannot supply a verified capture", () => {
    const id = session();
    const ref = writeExecutedEvidence(ledger, id, record);
    expect(ref).not.toBeNull();
    if (!ref) { ledger.sealSession(id); return; }
    expect(loadExecutedEvidence(ledger, ref, record).ok).toBe(false);
    ledger.sealSession(id);
  });

  test.each(["conforms", "violates"] as const)("P1-11 rejects synthetic captures even when a local oracle reports %s", verdict => {
    const id = session();
    const ref = writeExecutedEvidence(ledger, id, record);
    ledger.sealSession(id);
    const loaded = loadExecutedEvidence(ledger, ref, record);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const control: EvaluableControl = { id: record.binding.controlId, version: record.binding.controlVersion,
      binding: { kind: "manual", points: [], mechanism: "Synthetic local drill", parameters: [],
        manualDuty: { duty: "Inspect a synthetic local fixture", ownerRole: "head_of_qa", cadence: "per drill", evidenceOfPerformance: "Sealed capture" } },
      invalidatedBy: [], evidence: [{ id: "synthetic-effects", producer: "amc.assurance.executed",
        bindingFields: ["controlId", "controlVersion", "tenantId", "workspaceId", "deploymentId", "agentId", "policyDigest"],
        freshness: { maxAgeDays: 1 }, sampling: { method: "all", ratePercent: null, minItems: 1 },
        retention: { mode: "regime_max" }, residency: { mode: "inherit_deployment" } }] };
    const now = Date.now();
    const context: EvaluationContext = { subject: { tenantId: record.binding.tenantId, workspaceId: record.binding.workspaceId,
      deploymentId: record.binding.deploymentId, agentId: record.binding.agentId, subjectId: null },
      window: { start: new Date(now - 60_000).toISOString(), end: new Date(now + 60_000).toISOString() },
      plan: { digest, policyDigest: digest, applicability: { state: "applicable" }, mode: "enforce" }, invalidations: [], reviews: [],
      producers: [{ id: "amc.assurance.executed", module: "src/assurance/executed/evidence.ts",
        emits: ["ASSURANCE_EXECUTED_CAPTURE"], maxClaimKind: "synthetic_example", status: "available", plannedBy: null }] };
    const result = evaluateControl(control, [{ ...loaded.item, verdict }], context);
    expect(result.admitted).toEqual([]);
    expect(result.rejected).toMatchObject([{ reason: "producer_unverified" }]);
    expect(result.dimensions.result).toBe("not_evaluated");
    expect(result.dimensions.applicability).toEqual({ state: "applicable" });
    expect(result.dimensions.review).toBe("pending");
    expect(result.claimKind).not.toBe("observed");
  });

  test.each(["tenantId", "workspaceId", "deploymentId", "agentId", "controlId", "controlVersion", "policyDigest", "runId", "attemptId", "fixtureDigest"] as const)(
    "a capture cannot be replayed for a different %s", field => {
      const id = session();
      const ref = writeExecutedEvidence(ledger, id, record);
      ledger.sealSession(id);
      expect(ref).not.toBeNull();
      if (!ref) return;
      const expected = structuredClone(record);
      expected.binding[field] = "other";
      expect(loadExecutedEvidence(ledger, ref, expected).ok).toBe(false);
    });

  test.each(["scenarioId", "packId"] as const)("a capture is bound to %s", field => {
    const id = session();
    const ref = writeExecutedEvidence(ledger, id, record);
    ledger.sealSession(id);
    expect(ref).not.toBeNull();
    if (!ref) return;
    expect(loadExecutedEvidence(ledger, ref, { ...record, [field]: "other" }).ok).toBe(false);
  });

  test.each(["environment", "seed"] as const)("a capture is bound to fixture %s", field => {
    const id = session();
    const ref = writeExecutedEvidence(ledger, id, record);
    ledger.sealSession(id);
    expect(ref).not.toBeNull();
    if (!ref) return;
    expect(loadExecutedEvidence(ledger, ref, { ...record, fixture: { ...record.fixture, [field]: "other" } }).ok).toBe(false);
  });

  test("a valid unrelated receipt cannot be substituted", () => {
    const id = session();
    const first = writeExecutedEvidence(ledger, id, record);
    const second = writeExecutedEvidence(ledger, id, { ...record, scenarioId: "other" });
    ledger.sealSession(id);
    expect(first).not.toBeNull(); expect(second).not.toBeNull();
    if (!first || !second) return;
    const rows = ledger.getAllEvents();
    const row = rows.find(value => value.id === first.eventId)!;
    const other = rows.find(value => value.id === second.eventId)!;
    const meta = JSON.parse(row.meta_json), replacement = JSON.parse(other.meta_json);
      meta.receipt = replacement.receipt; meta.receipt_sha256 = replacement.receipt_sha256;
    const read = vi.spyOn(ledger, "getAllEvents").mockReturnValue(rows.map(value => value.id === first.eventId
      ? { ...value, meta_json: JSON.stringify(meta) } : value));
    try {
      expect(loadExecutedEvidence(ledger, first, record).ok).toBe(false);
    } finally { read.mockRestore(); }
  });

  test("changed payload bytes fail even while the original row hash is retained", () => {
    const id = session();
    const ref = writeExecutedEvidence(ledger, id, record);
    ledger.sealSession(id);
    expect(ref).not.toBeNull();
    if (!ref) return;
    const rows = ledger.getAllEvents();
    const read = vi.spyOn(ledger, "getAllEvents").mockReturnValue(rows.map(value => value.id === ref.eventId
      ? { ...value, payload_inline: "{}", canonical_payload_inline: "{}" } : value));
    try {
      expect(loadExecutedEvidence(ledger, ref, record).ok).toBe(false);
    } finally { read.mockRestore(); }
  });
});
