import { getPublicKeyHistory, signHexDigest, verifyHexDigestAny } from "../../../src/crypto/keys.js";
import { getPurposeKeyHistory, getSigningKey, getSigningPublicKeyPem, rotatePurposeKeys } from "../../../src/keys/purposeKeys.js";
import { mintReceipt, verifyReceipt, type MintReceiptInput } from "../../../src/receipts/receipt.js";
import type { SessionRecord } from "../../../src/types.js";
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
  policy: { synthetic: true }, capture: { released: ["synthetic-lot"] }, invocationComplete: true
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
    // Split only owned fixture keys. AMC_HOME is the temporary operator directory above.
    rotatePurposeKeys({ workspace, purposes: ["receipt"], passphrase: "p227-synthetic-evidence-tests" });
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

  // The native getter runs inside the reader's SQLite snapshot. Override its
  // returned copy only; all native evidence/session immutable triggers stay installed.
  function sessionSnapshot(id: string, changes: Partial<SessionRecord>) {
    const nativeGet = ledger.getSessionById.bind(ledger);
    return vi.spyOn(ledger, "getSessionById").mockImplementation(asked => {
      const actual = nativeGet(asked);
      return actual && asked === id ? { ...actual, ...changes } : actual;
    });
  }

  test("the native writer and same-byte reader retain synthetic provenance after sealing", () => {
    const id = session();
    const ref = writeExecutedEvidence(ledger, id, record);
    ledger.sealSession(id);
    expect(ref).not.toBeNull();
    if (!ref) return;
    const loaded = loadExecutedEvidence(ledger, ref, { ...record, sessionId: id });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.record).toEqual(record);
    expect(loaded.item.provenance).toMatchObject({ verified: true, producerId: "amc.assurance.executed", trustTier: null });
    expect(loaded.item.verdict).toBe("neutral");
    expect(loaded.item.attributes.claimKind).toBe("synthetic_example");
  });

  test("preserves the exact native catalog policy digest spelling", () => {
    const id = session(), native = structuredClone(record);
    native.binding.policyDigest = `sha256:${record.binding.policyDigest}`;
    const ref = writeExecutedEvidence(ledger, id, native);
    ledger.sealSession(id);
    const loaded = loadExecutedEvidence(ledger, ref, { ...native, sessionId: id });
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.record.binding.policyDigest).toBe(native.binding.policyDigest);
    expect(loadExecutedEvidence(ledger, ref, { ...native, sessionId: id,
      binding: { ...native.binding, policyDigest: record.binding.policyDigest } }).ok).toBe(false);
  });

  test("an unsealed session cannot supply a verified capture", () => {
    const id = session();
    const ref = writeExecutedEvidence(ledger, id, record);
    expect(ref).not.toBeNull();
    if (!ref) { ledger.sealSession(id); return; }
    expect(loadExecutedEvidence(ledger, ref, { ...record, sessionId: id }).ok).toBe(false);
    ledger.sealSession(id);
  });

  test("a valid capture from another sealed session cannot be borrowed by a report", () => {
    const first = session(), second = session();
    const ref = writeExecutedEvidence(ledger, first, record);
    ledger.sealSession(first); ledger.sealSession(second);
    expect(loadExecutedEvidence(ledger, ref, { ...record, sessionId: second }).ok).toBe(false);
    expect(loadExecutedEvidence(ledger, ref, { ...record, sessionId: first }).ok).toBe(true);
  });

  test.each(["conforms", "violates"] as const)("P1-11 rejects synthetic captures even when a local oracle reports %s", verdict => {
    const id = session();
    const ref = writeExecutedEvidence(ledger, id, record);
    ledger.sealSession(id);
    const loaded = loadExecutedEvidence(ledger, ref, { ...record, sessionId: id });
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
      expect(loadExecutedEvidence(ledger, ref, { ...expected, sessionId: id }).ok).toBe(false);
    });

  test.each(["scenarioId", "packId"] as const)("a capture is bound to %s", field => {
    const id = session();
    const ref = writeExecutedEvidence(ledger, id, record);
    ledger.sealSession(id);
    expect(ref).not.toBeNull();
    if (!ref) return;
    expect(loadExecutedEvidence(ledger, ref, { ...record, sessionId: id, [field]: "other" }).ok).toBe(false);
  });

  test.each(["environment", "seed"] as const)("a capture is bound to fixture %s", field => {
    const id = session();
    const ref = writeExecutedEvidence(ledger, id, record);
    ledger.sealSession(id);
    expect(ref).not.toBeNull();
    if (!ref) return;
    expect(loadExecutedEvidence(ledger, ref, { ...record, sessionId: id, fixture: { ...record.fixture, [field]: "other" } }).ok).toBe(false);
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
      expect(loadExecutedEvidence(ledger, first, { ...record, sessionId: id }).ok).toBe(false);
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
      expect(loadExecutedEvidence(ledger, ref, { ...record, sessionId: id }).ok).toBe(false);
    } finally { read.mockRestore(); }
  });
  test("authentic captures verify with distinct ledger-row and receipt purposes", () => {
    const id = session();
    const ref = writeExecutedEvidence(ledger, id, record);
    ledger.sealSession(id);
    const receiptPublic = getSigningPublicKeyPem(workspace, "receipt");
    const ledgerPublic = getSigningPublicKeyPem(workspace, "ledger-row");
    expect(receiptPublic).not.toBe(ledgerPublic);
    expect(getPurposeKeyHistory(workspace, "ledger-row")).not.toContain(receiptPublic);
    // Non-vacuity: the old role aggregate really does admit the distinct receipt key.
    expect(getPublicKeyHistory(workspace, "monitor")).toContain(receiptPublic);
    const row = ledger.getEventById(ref.eventId)!;
    const receiptText = JSON.parse(row.meta_json).receipt as string;
    expect(verifyReceipt(receiptText, getPurposeKeyHistory(workspace, "receipt")).ok).toBe(true);
    expect(verifyReceipt(receiptText, getPurposeKeyHistory(workspace, "ledger-row")).ok).toBe(false);
    expect(loadExecutedEvidence(ledger, ref, { ...record, sessionId: id }).ok).toBe(true);
  });

  test.each(["ledger-head", "session-seal"] as const)("a receipt-purpose signature cannot forge the %s", target => {
    const id = session();
    const ref = writeExecutedEvidence(ledger, id, record);
    ledger.sealSession(id);
    const rows = ledger.getAllEvents();
    const row = rows.find(value => value.id === ref.eventId)!;
    expect(rows.at(-1)?.id).toBe(row.id);
    const forged = signHexDigest(row.event_hash, getSigningKey(workspace, "receipt"));
    expect(verifyHexDigestAny(row.event_hash, forged, getPurposeKeyHistory(workspace, "receipt"))).toBe(true);
    expect(verifyHexDigestAny(row.event_hash, forged, getPurposeKeyHistory(workspace, "ledger-row"))).toBe(false);
    expect(verifyHexDigestAny(row.event_hash, forged, getPublicKeyHistory(workspace, "monitor"))).toBe(true);
    const read = target === "ledger-head" ? vi.spyOn(ledger, "getAllEvents").mockReturnValue(
      rows.map(value => value.id === row.id ? { ...value, writer_sig: forged } : value)
    ) : null;
    const sessionRead = target === "session-seal" ? sessionSnapshot(id, { session_seal_sig: forged }) : null;
    try {
      expect(loadExecutedEvidence(ledger, ref, { ...record, sessionId: id }).ok).toBe(false);
    } finally { read?.mockRestore(); sessionRead?.mockRestore(); }
    expect(loadExecutedEvidence(ledger, ref, { ...record, sessionId: id }).ok).toBe(true);
  });

  test.each(["start-after-capture", "end-before-capture", "negative-start", "fractional-end", "nonfinite-end"] as const)(
    "a sealed capture rejects invalid session time %s", kind => {
      const id = session();
      const ref = writeExecutedEvidence(ledger, id, record);
      ledger.sealSession(id);
      const row = ledger.getEventById(ref.eventId)!;
      const actual = ledger.getSessionById(id)!;
      const started_ts = kind === "start-after-capture" ? row.ts + 1 : kind === "negative-start" ? -1 : actual.started_ts;
      const ended_ts = kind === "end-before-capture" ? row.ts - 1 : kind === "fractional-end" ? row.ts + 0.5
        : kind === "nonfinite-end" ? Infinity : actual.ended_ts;
      const read = sessionSnapshot(id, { started_ts, ended_ts });
      try {
        expect(loadExecutedEvidence(ledger, ref, { ...record, sessionId: id }).ok).toBe(false);
      } finally { read.mockRestore(); }
      expect(loadExecutedEvidence(ledger, ref, { ...record, sessionId: id }).ok).toBe(true);
    });

  test("a valid capture cannot hide a final signed session row after the recorded end", () => {
    const id = session();
    const ref = writeExecutedEvidence(ledger, id, record);
    const capture = ledger.getEventById(ref.eventId)!;
    const finalTs = capture.ts + 2000;
    ledger.appendEvidence({ sessionId: id, runtime: "sandbox", eventType: "audit", ts: finalTs,
      payload: "Synthetic timestamp-boundary fixture", inline: true,
      meta: { source: "assurance.executed", claimKind: "synthetic_example", trustTier: "SELF_REPORTED" } });
    ledger.sealSession(id);
    const positive = sessionSnapshot(id, { ended_ts: finalTs + 1 });
    try {
      expect(loadExecutedEvidence(ledger, ref, { ...record, sessionId: id }).ok).toBe(true);
    } finally { positive.mockRestore(); }
    const negative = sessionSnapshot(id, { ended_ts: capture.ts + 1 });
    try {
      expect(loadExecutedEvidence(ledger, ref, { ...record, sessionId: id }).ok).toBe(false);
    } finally { negative.mockRestore(); }
  });

  test("a final signed session row before the recorded start is invalid", () => {
    const id = session();
    const ref = writeExecutedEvidence(ledger, id, record);
    ledger.appendEvidence({ sessionId: id, runtime: "sandbox", eventType: "audit", ts: 0,
      payload: "Synthetic lower timestamp-boundary fixture", inline: true,
      meta: { source: "assurance.executed", claimKind: "synthetic_example", trustTier: "SELF_REPORTED" } });
    ledger.sealSession(id);
    expect(loadExecutedEvidence(ledger, ref, { ...record, sessionId: id }).ok).toBe(false);
  });

  test.each(["kind", "receiptId", "ts", "agentId", "providerId", "model", "eventHash", "bodySha256", "sessionId"] as const)(
    "a valid receipt signature cannot substitute a different body %s", field => {
      const id = session();
      const ref = writeExecutedEvidence(ledger, id, record);
      ledger.sealSession(id);
      const rows = ledger.getAllEvents();
      const row = rows.find(value => value.id === ref.eventId)!;
      const otherDigest = (value: string) => `${value[0] === "0" ? "1" : "0"}${value.slice(1)}`;
      const changes: Record<typeof field, Partial<MintReceiptInput>> = {
        kind: { kind: "tool_action" }, receiptId: { receiptId: `${ref.receiptId}-different` }, ts: { ts: row.ts + 1 },
        agentId: { agentId: `${record.binding.agentId}-different` }, providerId: { providerId: "amc.assurance.different" },
        model: { model: "synthetic-other-model" }, eventHash: { eventHash: otherDigest(row.event_hash) },
        bodySha256: { bodySha256: otherDigest(row.payload_sha256) }, sessionId: { sessionId: `${id}-different` }
      };
      const minted = mintReceipt({ kind: "guard_check", receiptId: ref.receiptId, ts: row.ts,
        agentId: record.binding.agentId, providerId: "amc.assurance.executed", model: null,
        eventHash: row.event_hash, bodySha256: row.payload_sha256, sessionId: id,
        privateKeyPem: getSigningKey(workspace, "receipt"), ...changes[field] });
      // The wrong body is genuinely signed by the correct purpose: signature rejection is not the oracle.
      expect(verifyReceipt(minted.receipt, getPurposeKeyHistory(workspace, "receipt")).ok).toBe(true);
      const meta = { ...JSON.parse(row.meta_json), receipt: minted.receipt, receipt_sha256: minted.receiptSha256 };
      const read = vi.spyOn(ledger, "getAllEvents").mockReturnValue(
        rows.map(value => value.id === row.id ? { ...value, meta_json: JSON.stringify(meta) } : value)
      );
      try {
        // Keep the hashed metadata receipt_id and all event/payload bytes intact. Only receipt text/hash are excluded from event hashing.
        const loaded = loadExecutedEvidence(ledger, { ...ref, receiptSha256: minted.receiptSha256 }, { ...record, sessionId: id });
        expect(loaded.ok).toBe(false);
        if (!loaded.ok) expect(loaded.reason).toBe("Capture receipt is invalid or commits to another record");
      } finally { read.mockRestore(); }
      expect(loadExecutedEvidence(ledger, ref, { ...record, sessionId: id }).ok).toBe(true);
    });

});
