/**
 * Under AMC_NO_SIGN=1 no row and no receipt carries a real signature (lane nosignrcpt, 2026-11-01). Receipt-bearing
 * writers refuse; a flow that legitimately runs unsigned (assurance run --no-sign) writes a plain unsigned row.
 */
import { mkdtempSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { writeAssuranceAudit } from "../../src/assurance/evidenceWriters.js";
import { computeIncidentHash, createIncidentStore } from "../../src/incidents/incidentStore.js";
import { withLedgerReceipt } from "../../src/keys/receiptWriter.js";
import { readReceiptAuthorityState } from "../../src/keys/receiptAuthorityState.js";
import { openLedger, type Ledger } from "../../src/ledger/ledger.js";
import { initWorkspace } from "../../src/workspace.js";

vi.setConfig({ testTimeout: 60_000 });
const REFUSED = "receipt child signing requires an unlocked signing vault";
let root: string;
let workspace: string;
let ledger: Ledger;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "amc-nosign-receipts-")));
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(root, "checkpoints"));
  workspace = join(root, "workspace");
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  vi.stubEnv("AMC_NO_SIGN", "1");
  ledger = openLedger(workspace, { store: "unsigned" });
  ledger.startSession({ sessionId: "s1", runtime: "unknown", binaryPath: "amc-test", binarySha256: "0".repeat(64) });
});
afterEach(() => {
  ledger.close();
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

const eventCount = () => (ledger.db.prepare("SELECT COUNT(*) AS n FROM evidence_events").get() as { n: number }).n;
const blobs = () => { try { return readdirSync(join(workspace, ".amc", "blobs")).sort(); } catch { return []; } };
const receipt = { kind: "guard_check" as const, agentId: "default", providerId: "unknown", model: null, bodySha256: "0".repeat(64) };

test("appendEvidenceWithReceipt is refused on the unsigned store and writes nothing", () => {
  const before = eventCount(), beforeBlobs = blobs();
  expect(() => ledger.appendEvidenceWithReceipt({ sessionId: "s1", runtime: "unknown", eventType: "audit",
    payload: "not inlined", meta: { auditType: "NO_SIGN_PROBE", trustTier: "OBSERVED" }, receipt })).toThrow(REFUSED);
  expect(eventCount()).toBe(before);
  expect(blobs()).toEqual(beforeBlobs);
});

test("the legacy withLedgerReceipt branch refuses to mint a receipt", () => {
  expect(readReceiptAuthorityState(workspace)).toBeNull();
  const append = vi.fn();
  expect(() => ledger.db.transaction(() => withLedgerReceipt(ledger, null, "sqlite-evidence", {}, Date.now(), append))()).toThrow(REFUSED);
  expect(append).not.toHaveBeenCalled();
});

test("appendOutcomeEvent is refused and writes no outcome row", () => {
  const outcomes = () => (ledger.db.prepare("SELECT COUNT(*) AS n FROM outcome_events").get() as { n: number }).n;
  const before = outcomes();
  expect(() => ledger.appendOutcomeEvent({ agentId: "default", category: "Emotional", metricId: "m", value: 1,
    trustTier: "SELF_REPORTED", source: "manual" } as never)).toThrow(REFUSED);
  expect(outcomes()).toBe(before);
});

test("assurance run --no-sign audits are plain unsigned rows without a receipt", () => {
  const id = writeAssuranceAudit({ ledger, sessionId: "s1", runtime: "unknown", trustTier: "OBSERVED", agentId: "default",
    packId: "all", scenarioId: "agent-target", auditType: "ASSURANCE_TARGET_RESOLVED", severity: "LOW", message: "probe" });
  const row = ledger.db.prepare("SELECT writer_sig, meta_json FROM evidence_events WHERE id = ?").get(id) as { writer_sig: string; meta_json: string };
  expect(row.writer_sig).toBe("unsigned");
  const meta = JSON.parse(row.meta_json) as Record<string, unknown>;
  expect(meta.auditType).toBe("ASSURANCE_TARGET_RESOLVED");
  expect(meta).not.toHaveProperty("receipt");
  expect(meta).not.toHaveProperty("receipt_id");
});

test("auto-linking to an open incident writes unsigned link and edge rows", () => {
  const store = createIncidentStore(ledger.db); store.initTables();
  const now = Date.now();
  const base = { incidentId: "inc_nosign", agentId: "default", severity: "WARN", state: "OPEN", title: "t", description: "d",
    triggerType: "MANUAL", triggerId: "trigger-nosign", rootCauseClaimIds: [], affectedQuestionIds: ["AMC-2.1"], causalEdges: [],
    timelineEventIds: [], createdTs: now, updatedTs: now, resolvedTs: null, postmortemRef: null,
    prev_incident_hash: store.getLastIncidentHash("default") } as never;
  store.insertIncident({ ...(base as object), incident_hash: computeIncidentHash(base), signature: "unsigned" } as never);
  const eventId = ledger.appendEvidence({ sessionId: "s1", runtime: "unknown", eventType: "audit", inline: true,
    payload: "{}", meta: { agentId: "default", questionId: "AMC-2.1" } });
  const links = ledger.db.prepare("SELECT signature FROM evidence_incident_links WHERE event_id = ?").all(eventId) as Array<{ signature: string }>;
  expect(links.length).toBe(1);
  expect(links.every(row => row.signature === "unsigned")).toBe(true);
  const edges = ledger.db.prepare("SELECT signature FROM causal_edges WHERE from_event_id = ?").all(eventId) as Array<{ signature: string }>;
  expect(edges.length).toBe(1);
  expect(edges.every(row => row.signature === "unsigned")).toBe(true);
});
