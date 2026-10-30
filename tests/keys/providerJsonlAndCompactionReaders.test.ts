/** Proposed tests/keys/providerJsonlAndCompactionReaders.test.ts. Actual public readers; not executed by this reviewer. */
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace, signAmcConfig } from "../../src/workspace.js";
import { bindPurposeProviderKey } from "../../src/keys/purposeProviders.js";
import { awsKmsProvider } from "../../src/keys/providers/awsKms.js";
import { signingKeyId } from "../../src/keys/algorithmPolicy.js";
import { readOperationalDelegationState } from "../../src/keys/operationalDelegationState.js";
import { verifyLedgerIntegrity } from "../../src/ledger/ledgerVerification.js";
import { verifyAlternateBackendEvidence } from "../../src/ledger/alternateBackendVerification.js";
import { openSessionEventStore } from "../../src/persistence/openSessionEventStore.js";
import { readEventRows } from "../../src/persistence/jsonl/jsonlEventLog.js";
import { verifyStoredSessionEvents } from "../../src/persistence/sessionStoreVerification.js";
import { SessionService } from "../../src/session/sessionService.js";
import { compactionReceipt } from "../../src/session/surfaceCompactionValidation.js";
import { inspectSessionCompaction } from "../../src/session/sessionCompactionWorkflow.js";
import { withPins } from "../../src/trust/trustContext.js";
import { workspaceKeyTrust } from "../helpers/trustContext.js";
import { lockVault } from "../../src/vault/vault.js";
import { AWS_ARN, awsFake, fakeKey, publicPem } from "./providerFakes.js";

const PASS = "owned-jsonl-compaction-reader-passphrase";
const fixtures: Array<{ root: string; workspace: string; service?: SessionService }> = [];
afterEach(() => {
  for (const f of fixtures.splice(0).reverse()) {
    try { f.service?.disposeWithoutClosing(); } catch { /* The actual successful close may already have disposed it. */ }
    lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});
async function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-owned-jsonl-read-"))), workspace = join(root, "workspace"), home = join(root, "operator-home");
  mkdirSync(home); const f = { root, workspace, service: undefined as SessionService | undefined }; fixtures.push(f);
  vi.stubEnv("AMC_HOME", home); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined);
  // No environment backend selector is inherited: each actual test opens its one explicitly selected backend.
  vi.stubEnv("AMC_SESSION_STORE", "sqlite");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const key = fakeKey("p256"), arn = AWS_ARN("owned-jsonl-compaction"), fake = awsFake({ [arn]: key }), pem = publicPem(key);
  // Independent operator choice precedes binding and every new-provider artifact.
  const trust = withPins(workspaceKeyTrust(workspace), [{ keyId: signingKeyId(pem)!, purposes: ["ledger-row"], origin: "owned independent reader operator" }]);
  const path = join(workspace, ".amc", "amc.config.yaml"), config = YAML.parse(readFileSync(path, "utf8"));
  config.keys = { refs: { "ledger-row": { provider: "aws-kms", id: arn } } };
  writeFileSync(path, YAML.stringify(config)); signAmcConfig(workspace);
  const binding = await bindPurposeProviderKey(workspace, "ledger-row", { passphrase: PASS, provider: awsKmsProvider(fake.call), delegation: { maxEvents: 10_000 } });
  expect(binding.keyId).toBe(signingKeyId(pem));
  return { ...f, own: f, key, fake, binding, trust, absent: { ...trust, explicitPins: trust.explicitPins.filter(pin => pin.keyId !== signingKeyId(pem)) } };
}

describe("provider-bound public JSONL exception diagnostics and real native compaction readers", () => {
  test("actual JSONL primary and alternate readers contain a real rejected delegate-key symlink diagnostic", async () => {
    const f = await fixture(); vi.stubEnv("AMC_SESSION_STORE", "jsonl");
    const store = openSessionEventStore(f.workspace, "jsonl");
    try {
      store.startSession({ sessionId: "owned-jsonl-error", runtime: "unknown", binaryPath: "owned-jsonl-error", binarySha256: "a".repeat(64) });
      store.appendSessionEvent({ sessionId: "owned-jsonl-error", runtime: "unknown", eventType: "audit", meta: { witness: "actual-jsonl-read" } });
      store.sealSession("owned-jsonl-error");
    } finally { store.close(); }
    const pinned = { ...f.trust, asOf: new Date() };
    expect(verifyAlternateBackendEvidence(f.workspace, null, pinned)).toEqual([]);
    expect(verifyLedgerIntegrity(f.workspace, { trust: pinned }).chain).toEqual({ ok: true, errors: [] });
    const keyPath = join(f.workspace, ".amc", "keys", "ledger-row.pub");
    const target = join(f.root, "HOST_PATH_SENTINEL_private-host-key.pub");
    writeFileSync(target, readFileSync(keyPath)); rmSync(keyPath); symlinkSync(target, keyPath);
    // Real low-level containment failure proves there is private native text to contain; no verification mock is used.
    expect(() => readOperationalDelegationState(f.workspace)).toThrow(f.workspace);
    expect(() => verifyStoredSessionEvents(f.workspace, readEventRows(f.workspace), { trust: pinned })).toThrow(f.workspace);
    // Compute both public verdicts before assertions so root can inspect each real forwarding boundary on RED.
    const alternate = verifyAlternateBackendEvidence(f.workspace, null, pinned), primary = verifyLedgerIntegrity(f.workspace, { trust: pinned });
    expect(alternate).toEqual(["jsonl session store could not be read: unreadable or unauthenticated evidence"]);
    expect(primary.chain.ok).toBe(false);
    expect(primary.chain.errors).toContain("Evidence verification could not complete: unreadable or unauthenticated evidence");
    for (const errors of [alternate, primary.errors, primary.chain.errors]) {
      const text = errors.join("\n");
      expect(text).not.toContain(f.root); expect(text).not.toContain(f.workspace);
      expect(text).not.toContain(keyPath); expect(text).not.toContain(target); expect(text).not.toContain("HOST_PATH_SENTINEL");
      expect(text).not.toContain("is a symlink");
    }
  });

  for (const backend of ["sqlite", "jsonl"] as const) test(`${backend}: actual signed native compaction reaches primary, session and operator readers with independent issuer admission`, async () => {
    const f = await fixture(); vi.stubEnv("AMC_SESSION_STORE", backend);
    const service = new SessionService(f.workspace, openSessionEventStore(f.workspace, backend)); f.own.service = service;
    const sessionId = `owned-provider-compact-${backend}`, original = "retained owned user text ".repeat(80), replacement = "owned summary";
    service.open({ sessionId, agentId: "default", harnessVersion: "owned-compaction", compositionDigest: "c".repeat(64), policyDigest: "d".repeat(64) });
    service.recordSystemPrompt("Owned system instructions.");
    service.startTurn({ trigger: "user" }); service.recordUserMessage(original); service.startStep();
    service.recordAssistantBlock({ blockIndex: 0, blockKind: "text", content: "owned answer ".repeat(40), stopReason: "end_turn" });
    service.endStep({ stopReason: "end_turn", usage: null }); service.endTurn({ reason: "complete" }); service.sealTurn();
    const before = service.readEvents(), origin = service.liveSurfaceEntries().find(entry => entry.role === "user")!.originEventId;
    const compacted = service.compactSurfaceEntry({ originEventId: origin, replacement, reason: "owned provider context reduction" });
    const current = service.readEvents(), compactRow = current.find(row => row.id === compacted.eventId)!;
    expect(compactRow.event_type).toBe("loop/compact");
    expect(JSON.parse(compactRow.meta_json).amcKeyDelegation).toMatchObject({ sha256: f.binding.delegationSha256, useSequence: expect.any(Number) });
    expect(compactionReceipt(compactRow)).toMatchObject({ replacedBytes: Buffer.byteLength(original), replacementBytes: Buffer.byteLength(replacement), savedBytes: Buffer.byteLength(original) - Buffer.byteLength(replacement) });
    expect(current.slice(0, before.length)).toEqual(before);
    const pinned = { ...f.trust, asOf: new Date() }, absent = { ...f.absent, asOf: new Date() };
    const inspected = inspectSessionCompaction(f.workspace, sessionId, { trust: pinned });
    expect(inspected).toMatchObject({ ok: true, backend, headEventId: compacted.eventId, headEventHash: compacted.eventHash, trustRootAnchored: true });
    expect(inspected.entries.find(entry => entry.originEventId === origin)).toMatchObject({ bytes: Buffer.byteLength(replacement), sourceEventId: compacted.eventId });
    expect(() => inspectSessionCompaction(f.workspace, sessionId, { trust: absent })).toThrow(/issuer|delegation/);
    expect(() => inspectSessionCompaction(f.workspace, sessionId)).toThrow(/issuer|delegation/);
    expect(service.readEvents()).toEqual(current); // All inspection/refusal controls stay read-only.
    service.close({ reason: "completed" });
    const sealedPinned = { ...pinned, asOf: new Date() }, sealedAbsent = { ...absent, asOf: new Date() };
    const reader = openSessionEventStore(f.workspace, backend, { readOnly: true });
    let rows: ReturnType<typeof reader.readAllEvents>, record: ReturnType<typeof reader.readSessionRecord>;
    try { rows = reader.readAllEvents(); record = reader.readSessionRecord(sessionId); } finally { reader.close(); }
    expect(record).not.toBeNull(); expect(rows.some(row => row.id === compacted.eventId)).toBe(true);
    expect(verifyStoredSessionEvents(f.workspace, rows, { trust: sealedPinned, sessionRecords: [record!] })).toMatchObject({ ok: true, errors: [] });
    expect(verifyLedgerIntegrity(f.workspace, { trust: sealedPinned }).chain).toEqual({ ok: true, errors: [] });
    for (const options of [{ trust: sealedAbsent }, {}]) {
      const stored = verifyStoredSessionEvents(f.workspace, rows, { ...options, sessionRecords: [record!] });
      const primary = verifyLedgerIntegrity(f.workspace, options);
      expect(stored.ok).toBe(false); expect(primary.chain.ok).toBe(false);
      expect(stored.errors.join("; ")).toMatch(/issuer.*not-pinned/);
      expect(primary.chain.errors.join("; ")).toMatch(/issuer.*not-pinned/);
    }
  });
});
