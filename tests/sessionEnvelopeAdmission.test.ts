import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { getPrivateKeyPem, signHexDigest } from "../src/crypto/keys.js";
import { canonicalMetadataForHash } from "../src/ledger/eventHash.js";
import type { Ledger } from "../src/ledger/ledger.js";
import { verifySessionChains } from "../src/ledger/sessionVerification.js";
import { openSessionEventStore } from "../src/persistence/openSessionEventStore.js";
import { verifyStoredSessionEventMetadata, verifyStoredSessionEvents } from "../src/persistence/sessionStoreVerification.js";
import { loadSessionEventHistory, SessionHistoryRefused } from "../src/session/sessionEventHistory.js";
import { SessionService } from "../src/session/sessionService.js";
import type { SessionHistoryRefusal } from "../src/session/sessionHistoryReader.js";
import type { EvidenceEvent } from "../src/types.js";
import { sha256Hex } from "../src/utils/hash.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";

let workspace: string;
let original: EvidenceEvent[];
let monitorKey: string;
let tailEnvelope: Record<string, unknown>;
beforeAll(() => {
  for (const name of ["AMC_SESSION_STORE", "AMC_EXPECTED_MONITOR_FINGERPRINT", "AMC_NO_SIGN"]) vi.stubEnv(name, undefined);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-envelope-admission-fixture");
  workspace = mkdtempSync(join(tmpdir(), "amc-envelope-admission-"));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  const service = new SessionService(workspace, openSessionEventStore(workspace, "jsonl"));
  try {
    service.open({ sessionId: "envelope-subject", agentId: "default", harnessVersion: "synthetic-fixture",
      compositionDigest: sha256Hex("fixture composition"), policyDigest: sha256Hex("fixture policy") });
    service.recordUserMessage("original evidence");
  } finally { service.disposeWithoutClosing(); }
  original = JSON.parse(`[${readFileSync(eventsPath(), "utf8").trim().split("\n").join(",")}]`) as EvidenceEvent[];
  tailEnvelope = (JSON.parse(original.at(-1)!.meta_json) as { amcSession: Record<string, unknown> }).amcSession;
  monitorKey = getPrivateKeyPem(workspace, "monitor");
});
afterAll(() => { lockVault(workspace); vi.unstubAllEnvs(); rmSync(workspace, { recursive: true, force: true }); });
function eventsPath(): string { return join(workspace, ".amc", "jsonl", "events.jsonl"); }

/** Re-sign only the tail: global hash, signature and payload checks still pass. */
function rowsWithTail(metaJson: string, eventType: EvidenceEvent["event_type"] = "tool/result"): EvidenceEvent[] {
  const row = { ...original.at(-1)!, meta_json: metaJson, event_type: eventType };
  const canonical = canonicalMetadataForHash({ id: row.id, ts: row.ts, sessionId: row.session_id, runtime: row.runtime,
    eventType: row.event_type, payloadPath: row.canonical_payload_path ?? row.payload_path,
    payloadInline: row.canonical_payload_inline ?? row.payload_inline, metaJson: row.meta_json });
  row.event_hash = sha256Hex(`${row.prev_event_hash}${canonical}${row.payload_sha256}`);
  row.writer_sig = signHexDigest(row.event_hash, monitorKey);
  return [...original.slice(0, -1), row];
}
function envelopeMeta(value: unknown): string { return JSON.stringify({ amcSession: value }); }
interface InvalidCase {
  readonly name: string;
  readonly meta: () => string;
  readonly code: SessionHistoryRefusal;
  readonly eventType?: EvidenceEvent["event_type"];
}
const invalidCases: readonly InvalidCase[] = [
  { name: "malformed JSON", meta: () => "{", code: "TAMPERED" },
  ...[null, false, 7, "metadata", []].map(value => ({ name: `nonobject metadata ${JSON.stringify(value)}`,
    meta: () => JSON.stringify(value), code: "TAMPERED" as const })),
  ...[null, false, 7, "envelope", []].map(value => ({ name: `malformed envelope ${JSON.stringify(value)}`,
    meta: () => envelopeMeta(value), code: "TAMPERED" as const })),
  { name: "future envelope version", meta: () => envelopeMeta({ ...tailEnvelope, v: 2 }), code: "UNSUPPORTED_FORMAT" },
  { name: "missing envelope version", meta: () => envelopeMeta({ ...tailEnvelope, v: undefined }), code: "UNSUPPORTED_FORMAT" },
  { name: "wrong envelope version type", meta: () => envelopeMeta({ ...tailEnvelope, v: "1" }), code: "UNSUPPORTED_FORMAT" },
  { name: "v1 missing sequence", meta: () => envelopeMeta({ ...tailEnvelope, seq: undefined }), code: "TAMPERED" },
  { name: "v1 malformed surface", meta: () => envelopeMeta({ ...tailEnvelope, surface: { op: "unknown" } }), code: "TAMPERED" },
  { name: "v1 malformed synthetic flag", meta: () => envelopeMeta({ ...tailEnvelope, synthetic: "false" }), code: "TAMPERED" },
  { name: "native row without envelope", meta: () => "{}", code: "UNSUPPORTED_FORMAT" },
  { name: "slash type outside session vocabulary without envelope", meta: () => "{}", code: "UNSUPPORTED_FORMAT", eventType: "session/resume" },
  { name: "legacy type with malformed reserved envelope", meta: () => envelopeMeta(null), code: "TAMPERED", eventType: "audit" }
];
const verifiers = [
  { name: "ledger session chain", verify: (rows: EvidenceEvent[]): readonly string[] => {
    const errors: string[] = [];
    verifySessionChains({ workspace, getAllEvents: () => rows } as unknown as Ledger, errors);
    return errors;
  } },
  { name: "stored full verification", verify: (rows: EvidenceEvent[]) => verifyStoredSessionEvents(workspace, rows).errors },
  { name: "stored metadata verification", verify: (rows: EvidenceEvent[]) => verifyStoredSessionEventMetadata(workspace, rows).errors }
];

describe.each(verifiers)("DXB-01 $name", ({ verify }) => {
  test.each(invalidCases)("refuses re-signed $name", ({ meta, eventType }) => {
    const rows = rowsWithTail(meta(), eventType);
    const errors = verify(rows);
    expect(errors.join("; ")).toMatch(/metadata|envelope/i);
    expect(errors.join("; ")).not.toMatch(/event_hash mismatch|writer signature invalid|previous hash mismatch|payload hash mismatch/);
  });
  test("accepts a supported envelope and keeps true legacy rows skippable", () => {
    expect(verify(original)).toEqual([]);
    expect(verify(rowsWithTail("{}", "audit"))).toEqual([]);
    expect(verify(rowsWithTail(envelopeMeta(tailEnvelope), "audit"))).toEqual([]);
  });
});

describe("DXB-01 cold history reader agrees with verifiers", () => {
  test.each(invalidCases)("refuses $name with its original classification", ({ meta, eventType, code }) => {
    const rows = rowsWithTail(meta(), eventType);
    writeFileSync(eventsPath(), rows.map(row => JSON.stringify(row)).join("\n") + "\n");
    for (const verifyPayloads of [false, true]) {
      let refusal: unknown;
      try { loadSessionEventHistory({ workspace, verifyPayloads }); } catch (error) { refusal = error; }
      expect(refusal).toBeInstanceOf(SessionHistoryRefused);
      expect((refusal as SessionHistoryRefused).code).toBe(code);
    }
  });
  test("reads supported envelopes and legacy metadata without rewriting bytes", () => {
    for (const rows of [original, rowsWithTail("{}", "audit")]) {
      const bytes = rows.map(row => JSON.stringify(row)).join("\n") + "\n";
      writeFileSync(eventsPath(), bytes);
      expect(loadSessionEventHistory({ workspace }).events).toEqual(rows);
      expect(readFileSync(eventsPath(), "utf8")).toBe(bytes);
    }
  });
});
