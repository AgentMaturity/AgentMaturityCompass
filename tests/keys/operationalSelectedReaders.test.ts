// Actual selected-row consumers with an owned provider transport.
import { createPublicKey, sign, verify } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace, signAmcConfig } from "../../src/workspace.js";
import { lockVault } from "../../src/vault/vault.js";
import { awsKmsProvider } from "../../src/keys/providers/awsKms.js";
import { bindPurposeProviderKey } from "../../src/keys/purposeProviders.js";
import { getSigningKey } from "../../src/keys/signingKeys.js";
import { operationalEvidenceProblems } from "../../src/keys/operationalLedgerReader.js";
import { DELEGATION_META } from "../../src/keys/delegationScope.js";
import { openLedger, verifyLedgerIntegrity, type Ledger, canonicalMetadataForHash } from "../../src/ledger/ledger.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { canonicalize } from "../../src/utils/json.js";
import type { EvidenceEvent } from "../../src/types.js";
import { workspaceSelfTrust, type TrustContext } from "../../src/trust/trustContext.js";
import { SessionService } from "../../src/session/sessionService.js";
import { openSessionEventStore } from "../../src/persistence/openSessionEventStore.js";
import { inspectSpilledEvent, retrieveSpilledContent } from "../../src/session/spill/spillEvidence.js";
import { describeMeasuredLiveEntries } from "../../src/session/surfaceCompaction.js";
import { validateAcpCommittedTail } from "../../src/acp/acpCommittedUpdates.js";
import { buildSessionRootDescriptor } from "../../src/transparency/sessionRootDescriptor.js";
import { readBudgetEvents } from "../../src/budgets/nativeBudgetUsage.js";
import { openActionJournal, verifyChainIn } from "../../src/actions/actionJournal.js";
import { ledgerChainError } from "../../src/catalog/evidence/mappingAdapter.js";
import { legacyLedgerRowKeys } from "../../src/keys/operationalLedgerReader.js";
import { startAssuranceSession, writeScenarioPrompt, writeScenarioResponse } from "../../src/assurance/evidenceWriters.js";
import { writeExecutedEvidence, loadExecutedEvidence, type ExecutedCaptureRecord } from "../../src/assurance/executed/evidence.js";
import { validateExecutedReportRow } from "../../src/assurance/executed/reportValidation.js";
import { loadCatalog } from "../../src/catalog/loader.js";
import { budgetUsageSnapshot, evaluateBudgetStatus, initBudgets } from "../../src/budgets/budgets.js";
import { initToolsConfig } from "../../src/toolhub/toolhubValidators.js";
import { initActionPolicy } from "../../src/governor/actionPolicyEngine.js";
import { ToolHubService } from "../../src/toolhub/toolhubServer.js";
import { AWS_ARN, awsFake, fakeKey } from "./providerFakes.js";

const PASS = "owned-selected-provider-reader-passphrase";
const fixtures: Array<{ root: string; workspace: string; ledger?: Ledger; service?: SessionService }> = [];
afterEach(() => {
  for (const f of fixtures.splice(0)) { f.service?.disposeWithoutClosing(); f.ledger?.close(); lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});
async function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-selected-reader-")), workspace = join(root, "workspace");
  const f: (typeof fixtures)[number] = { root, workspace }; fixtures.push(f);
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  vi.stubEnv("AMC_LEDGER_SQLITE_SYNCHRONOUS", "FULL"); vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const key = fakeKey("p256"), id = AWS_ARN("selected-reader"), transport = awsFake({ [id]: key });
  const provider = awsKmsProvider(transport.call), description = await provider.describe({ provider: "aws-kms", id });
  const path = join(workspace, ".amc", "amc.config.yaml"), config = YAML.parse(readFileSync(path, "utf8"));
  config.keys = { refs: { "ledger-row": { provider: "aws-kms", id } } }; writeFileSync(path, YAML.stringify(config)); signAmcConfig(workspace);
  const binding = await bindPurposeProviderKey(workspace, "ledger-row", { passphrase: PASS, provider, delegation: { maxEvents: 10_000 } });
  const ownedIssuerId = sha256Hex(key.publicKey.export({ format: "pem", type: "spki" }).toString());
  expect(description.keyId).toBe(ownedIssuerId);
  const trust: TrustContext = { mode: "pinned", asOf: new Date(), lists: [], explicitPins: [{ keyId: ownedIssuerId, purposes: ["ledger-row"], origin: "owned independent operator pin" }],
    distrust: [], allowUnpinned: false, allowUnanchored: false };
  f.ledger = openLedger(workspace);
  return { ...f, ledger: f.ledger, trust, absent: { ...trust, explicitPins: [] }, description, binding };
}
function evidenceHash(row: EvidenceEvent): string {
  const metadata = canonicalMetadataForHash({ id: row.id, ts: row.ts, sessionId: row.session_id, runtime: row.runtime, eventType: row.event_type,
    payloadPath: row.canonical_payload_path ?? row.payload_path, payloadInline: row.canonical_payload_inline ?? row.payload_inline, metaJson: row.meta_json });
  return sha256Hex(`${row.prev_event_hash}${metadata}${row.payload_sha256}`);
}
function append(ledger: Ledger, sessionId: string): EvidenceEvent {
  ledger.startSession({ sessionId, runtime: "unknown", binaryPath: "owned-reader", binarySha256: "a".repeat(64) });
  const id = ledger.appendEvidence({ sessionId, runtime: "unknown", eventType: "audit", payload: "owned reader row", inline: true, meta: {} });
  ledger.sealSession(sessionId); return ledger.getEventById(id)!;
}

describe("public selected-row readers admit issuer and global authority before projecting bytes", () => {
  test("the selected helper refuses a real pinned-archive symlink without disclosing host paths", async () => {
    const f = await fixture(), row = append(f.ledger, "selected-redaction"), options = { ledger: f.ledger, trust: f.trust };
    expect(operationalEvidenceProblems(f.workspace, [row], options)).toEqual([]);
    const archive = join(f.workspace, ".amc", "keys", "delegations", f.binding.delegationSha256! + ".json");
    const secretPath = join(f.root, "HOST_PATH_SENTINEL_private_archive.json"); writeFileSync(secretPath, "not an authorized delegation");
    rmSync(archive); symlinkSync(secretPath, archive);
    const problems = operationalEvidenceProblems(f.workspace, [row], options);
    expect(problems).toHaveLength(1); expect(problems[0]).toMatch(/^Operational ledger delegation invalid: \.amc\/keys \(/);
    expect(problems.join("\n")).not.toContain(f.root); expect(problems.join("\n")).not.toContain("HOST_PATH_SENTINEL");
  });

  test("the helper verifies actual selected preimages, membership, uniqueness and unselected global evidence", async () => {
    const f = await fixture(), row = append(f.ledger, "selected"), options = { ledger: f.ledger, trust: f.trust };
    expect(operationalEvidenceProblems(f.workspace, [row], options)).toEqual([]);
    expect(operationalEvidenceProblems(f.workspace, [], { ...options, trust: f.absent })).toContainEqual(expect.stringMatching(/issuer.*not-pinned/));
    expect(operationalEvidenceProblems(f.workspace, [row], { ...options, trust: f.absent })).toContainEqual(expect.stringMatching(/issuer.*not-pinned/));
    expect(operationalEvidenceProblems(f.workspace, [row])).toContainEqual(expect.stringMatching(/issuer.*not-pinned/));
    const changed = { ...row, meta_json: JSON.stringify({ ...JSON.parse(row.meta_json), forged: true }) };
    expect(operationalEvidenceProblems(f.workspace, [changed], options)).toContainEqual(expect.stringMatching(/event_hash mismatch/));
    expect(operationalEvidenceProblems(f.workspace, [row, row], options)).toContainEqual(expect.stringMatching(/more than once/));
    const alternate = { ...row, id: "owned-valid-but-unrecorded" }; alternate.event_hash = evidenceHash(alternate);
    const privateKey = getSigningKey(f.workspace, "ledger-row");
    alternate.writer_sig = sign(null, Buffer.from(alternate.event_hash, "hex"), privateKey).toString("base64");
    expect(verify(null, Buffer.from(alternate.event_hash, "hex"), createPublicKey(privateKey), Buffer.from(alternate.writer_sig, "base64"))).toBe(true);
    expect(operationalEvidenceProblems(f.workspace, [alternate], options)).toContainEqual(expect.stringMatching(/not in a verified global/));
    const unrelated = append(f.ledger, "unselected");
    // Simulate a tampered owned database after bypassing its storage guard; production triggers stay unchanged.
    f.ledger.db.exec("DROP TRIGGER protect_evidence_immutable");
    f.ledger.db.prepare("UPDATE evidence_events SET payload_sha256 = ? WHERE id = ?").run("f".repeat(64), unrelated.id);
    expect(operationalEvidenceProblems(f.workspace, [row], options)).toContainEqual(expect.stringMatching(/event_hash mismatch/));
  });

  test("a selected SQLite row cannot hide duplicate quota use in the actual outcome stream", async () => {
    const f = await fixture(), row = append(f.ledger, "quota-selected");
    f.ledger.appendOutcomeEvent({ agentId: "default", category: "Functional", metricId: "owned", value: 1, trustTier: "SELF_REPORTED", source: "manual", meta: {} });
    const outcome = f.ledger.db.prepare("SELECT * FROM outcome_events ORDER BY rowid DESC LIMIT 1").get() as Record<string, any>;
    const meta = JSON.parse(outcome.meta_json); meta[DELEGATION_META].useSequence = JSON.parse(row.meta_json)[DELEGATION_META].useSequence;
    outcome.meta_json = JSON.stringify(meta);
    let value: unknown = outcome.value; try { value = JSON.parse(outcome.value); } catch { /* same storage spelling */ }
    const digest = sha256Hex(`${outcome.prev_event_hash}${canonicalize({ outcome_event_id: outcome.outcome_event_id, ts: outcome.ts,
      agent_id: outcome.agent_id, work_order_id: outcome.work_order_id, category: outcome.category, metric_id: outcome.metric_id, value, unit: outcome.unit,
      trust_tier: outcome.trust_tier, source: outcome.source, meta_json: outcome.meta_json, payload_sha256: outcome.payload_sha256 })}`);
    const signature = sign(null, Buffer.from(digest, "hex"), getSigningKey(f.workspace, "ledger-row")).toString("base64");
    // Deliberately corrupt only this owned fixture database.
    f.ledger.db.exec("DROP TRIGGER no_update_outcome_events");
    f.ledger.db.prepare("UPDATE outcome_events SET meta_json = ?, event_hash = ?, signature = ? WHERE outcome_event_id = ?")
      .run(outcome.meta_json, digest, signature, outcome.outcome_event_id);
    expect(operationalEvidenceProblems(f.workspace, [row], { ledger: f.ledger, trust: f.trust })).toContainEqual(expect.stringMatching(/reused across/));
  });

  test("real spill retrieval, compaction measurement, ACP tail and descriptor retain independent admission", async () => {
    const f = await fixture(), full = "owned spill bytes ".repeat(500);
    const service = new SessionService(f.workspace, undefined, { maxInlineBytes: 1024, previewHeadBytes: 64, previewTailBytes: 32 });
    fixtures.at(-1)!.service = service;
    const sessionId = "owned-selected-native";
    service.open({ sessionId, agentId: "default", harnessVersion: "owned", compositionDigest: "c", policyDigest: "p" });
    service.startTurn({ trigger: "user" }); service.recordUserMessage("read owned bytes"); service.startStep();
    service.recordToolCall({ toolCallId: "owned-call", toolName: "owned", dispatch: "native", parentToken: null, args: "{}" });
    service.recordToolResult({ toolCallId: "owned-call", outcome: "OK", exitCode: 0, timedOut: false, denied: false, content: full });
    service.endStep({ stopReason: "tool_use", usage: null }); service.endTurn({ reason: "complete" }); service.close({ reason: "completed" });
    const store = openSessionEventStore(f.workspace, "sqlite", { readOnly: true });
    try {
      const rows = store.readSessionEvents(sessionId), spilled = rows.find(row => JSON.parse(row.meta_json).spilled !== undefined)!;
      expect(spilled).toBeDefined();
      expect(retrieveSpilledContent(f.workspace, spilled, { trust: f.trust }).toString()).toBe(full);
      expect(inspectSpilledEvent(f.workspace, spilled, { trust: f.absent }).status).toBe("row-unauthentic");
      expect(inspectSpilledEvent(f.workspace, spilled).status).toBe("row-unauthentic");
      expect(describeMeasuredLiveEntries(f.workspace, rows, { trust: f.trust }).length).toBeGreaterThan(0);
      expect(() => describeMeasuredLiveEntries(f.workspace, rows, { trust: f.absent })).toThrow(/delegation|issuer/);
      expect(validateAcpCommittedTail(f.workspace, sessionId, rows, 0, null, { trust: f.trust })).toBe(rows.at(-1)!.event_hash);
      expect(() => validateAcpCommittedTail(f.workspace, sessionId, rows, rows.length, rows.at(-1)!.event_hash, { trust: f.absent })).toThrow(/delegation|issuer/);
      const record = store.readSessionRecord(sessionId);
      expect(buildSessionRootDescriptor({ workspace: f.workspace, sessionId, rows, record, options: { trust: f.trust } }).monitorKeyFingerprint).toBe(f.description.keyId);
      expect(() => buildSessionRootDescriptor({ workspace: f.workspace, sessionId, rows, record, options: { trust: f.absent } })).toThrow(/issuer|trust root/);
    } finally { store.close(); }
  });

  test("budget and catalog chain readers use the caller's independent provider pin", async () => {
    const f = await fixture(), row = append(f.ledger, "owned-budget");
    expect(readBudgetEvents(f.workspace, f.ledger, { trust: f.trust }).map(event => event.id)).toContain(row.id);
    expect(() => readBudgetEvents(f.workspace, f.ledger, { trust: f.absent })).toThrow(/delegation/);
    expect(() => readBudgetEvents(f.workspace, f.ledger)).toThrow(/delegation/);
    const rows = f.ledger.getAllEvents(), keys = legacyLedgerRowKeys(f.workspace);
    expect(ledgerChainError(rows, keys, { workspace: f.workspace, ledger: f.ledger, trust: f.trust })).toBeNull();
    expect(ledgerChainError(rows, keys, { workspace: f.workspace, ledger: f.ledger, trust: f.absent })).toMatch(/issuer.*not-pinned/);
  });

  test("the actual journal writer uses explicit local trust while public chain verification retains independent pins", async () => {
    const f = await fixture(), journal = openActionJournal(f.workspace);
    try {
      journal.request({ executionId: "owned-selected-execution", agentId: "default", toolName: "owned", actionClass: "WRITE_HIGH", sessionId: null,
        callId: "owned-selected-call", parentExecutionId: null, idempotencyKey: null });
      expect(journal.get("owned-selected-execution")?.receipts).toHaveLength(1);
      expect(verifyChainIn(f.ledger, "owned-selected-execution", { trust: f.trust }).ok).toBe(true);
      expect(verifyChainIn(f.ledger, "owned-selected-execution", { trust: f.absent }).ok).toBe(false);
      expect(verifyChainIn(f.ledger, "owned-selected-execution").ok).toBe(false);
    } finally { journal.close(); }
  });

  test("real executed capture and historical NE reference readers propagate independent issuer admission", async () => {
    const f = await fixture(), packId = "educationFERPA", scenarioId = "edu-vendor-training-use";
    const sessionId = startAssuranceSession({ ledger: f.ledger, mode: "sandbox", agentId: "default", packIds: [packId], trustTier: "SELF_REPORTED" });
    const record: ExecutedCaptureRecord = { v: 1, scenarioId, packId, fixture: { environment: "owned", seed: "owned-v1" },
      binding: { tenantId: "owned", workspaceId: "owned", deploymentId: "owned", agentId: "default", controlId: "L1-MOB-01", controlVersion: "0.1.0",
        policyDigest: "a".repeat(64), runId: "owned-run", attemptId: "owned-attempt", fixtureDigest: "a".repeat(64) },
      policy: { synthetic: true }, capture: { synthetic: true }, invocationComplete: true };
    const reference = writeExecutedEvidence(f.ledger, sessionId, record);
    const prompt = writeScenarioPrompt({ ledger: f.ledger, sessionId, runtime: "sandbox", trustTier: "SELF_REPORTED", packId, scenarioId, prompt: "owned request", agentId: "default" });
    const reply = writeScenarioResponse({ ledger: f.ledger, sessionId, runtime: "sandbox", trustTier: "SELF_REPORTED", packId, scenarioId, response: "owned reply", agentId: "default" });
    f.ledger.sealSession(sessionId);
    expect(loadExecutedEvidence(f.ledger, reference, { ...record, sessionId }, { trust: f.trust }).ok).toBe(true);
    expect(loadExecutedEvidence(f.ledger, reference, { ...record, sessionId }, { trust: f.absent }).ok).toBe(false);
    expect(loadExecutedEvidence(f.ledger, reference, { ...record, sessionId }).ok).toBe(false);
    const row = { scenarioId, title: "Historical ungraded exchange", category: "education_ferpa", riskTier: "all" as const,
      prompt: "owned request", response: "owned reply", pass: false, score0to5: 0, score0to100: 0, reasons: ["historical_not_evaluated"],
      correlatedRequestIds: [], evidenceEventIds: [prompt, reply], auditEventTypes: [], inconclusive: true };
    const input = { ledger: f.ledger, sessionId, scope: undefined, agentId: "default", row, packId, catalog: loadCatalog() };
    expect(validateExecutedReportRow({ ...input, trust: f.trust })).toEqual({ ok: true, errors: [] });
    expect(validateExecutedReportRow({ ...input, trust: f.absent }).errors).toContain("executed_report_unbacked_evidence_references");
    expect(validateExecutedReportRow(input).ok).toBe(false);
  });

  test("primary verifier keeps workspace self-check unanchored while independent issuer admission is anchored", async () => {
    const f = await fixture(); append(f.ledger, "primary-truth-label");
    expect(verifyLedgerIntegrity(f.workspace, { trust: workspaceSelfTrust(f.workspace) }).chain).toEqual({ ok: true, errors: [] });
    expect(verifyLedgerIntegrity(f.workspace, { trust: workspaceSelfTrust(f.workspace) }).trustRoot.anchored).toBe(false);
    expect(verifyLedgerIntegrity(f.workspace, { trust: f.trust }).trustRoot.anchored).toBe(true);
  });

  test("primary JSONL verification propagates the independently supplied issuer context", async () => {
    const f = await fixture(), store = openSessionEventStore(f.workspace, "jsonl");
    try {
      store.startSession({ sessionId: "primary-jsonl", runtime: "unknown", binaryPath: "owned-jsonl-reader", binarySha256: "a".repeat(64) });
      store.appendSessionEvent({ sessionId: "primary-jsonl", runtime: "unknown", eventType: "audit", meta: {} });
      store.sealSession("primary-jsonl");
    } finally { store.close(); }
    expect(verifyLedgerIntegrity(f.workspace, { trust: f.trust }).chain).toEqual({ ok: true, errors: [] });
    for (const options of [{ trust: f.absent }, {}]) {
      const result = verifyLedgerIntegrity(f.workspace, options);
      expect(result.chain.ok).toBe(false);
      expect(result.chain.errors.join("; ")).toMatch(/issuer.*not-pinned/);
    }
  });

  test("public budgets retain independent admission and the actual internal ToolHub path uses explicit current workspace authority", async () => {
    const f = await fixture(); initBudgets(f.workspace); initToolsConfig(f.workspace); initActionPolicy(f.workspace);
    const now = Date.now();
    expect(budgetUsageSnapshot(f.workspace, "default", now, { trust: f.trust }).daily.llmRequests).toBe(0);
    expect(evaluateBudgetStatus(f.workspace, "default", now, { trust: f.trust }).budgetConfigValid).toBe(true);
    expect(() => budgetUsageSnapshot(f.workspace, "default", now)).toThrow(/issuer|delegation/);
    expect(() => evaluateBudgetStatus(f.workspace, "default", now)).toThrow(/issuer|delegation/);
    mkdirSync(join(f.workspace, "workspace")); writeFileSync(join(f.workspace, "workspace", "owned.txt"), "owned fixture");
    const service = new ToolHubService(f.workspace);
    try {
      const intent = service.createIntent({ agentId: "default", initiator: "owned operator", toolName: "fs.read", args: { path: "workspace/owned.txt" }, requestedMode: "SIMULATE" });
      expect(intent).toMatchObject({ allowed: true, effectiveMode: "SIMULATE" });
      const result = await service.executeIntent({ intentId: intent.intentId });
      expect(result).toMatchObject({ allowed: true, effectiveMode: "SIMULATE", result: { bytes: 0 } });
      expect(result.result.output).toContain("SIMULATE fs.read");
    } finally { service.close(); }
  });
});
